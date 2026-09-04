import { SESSION_HEARTBEAT_MS, type LiveKhutbah, type LiveParagraph, type LiveSessionSnapshot, type SessionCommand } from '@jumaah/shared';
import { createSocket, deviceId, measureClockOffset, type JumaahSocket } from '@jumaah/ui';
import { api } from '../api';
import { applyLocal } from './reducer';
import { store } from './store';

const KHUTBAH_CACHE = 'imam.cache.khutbah';
const SNAPSHOT_CACHE = 'imam.cache.snapshot';
const QUEUE_CACHE = 'imam.queue';
const ACK_TIMEOUT_MS = 5000;

interface QueuedCommand {
  commandId: string;
  command: SessionCommand;
  clientSeq: number;
  /** Server seq at the moment the command was (last) sent; a later snapshot with a higher seq means it was applied. */
  sentAtSeq?: number;
}

type CommandAck = { ok: boolean; seq?: number; error?: string };

let socket: JumaahSocket | null = null;
let queue: QueuedCommand[] = readCache<QueuedCommand[]>(QUEUE_CACHE) ?? [];
let clientSeq = queue.reduce((m, q) => Math.max(m, q.clientSeq), 0);
let flushing = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let authRetryTimer: ReturnType<typeof setTimeout> | null = null;

// ---------- cache helpers ----------

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

function saveQueue(): void {
  writeCache(QUEUE_CACHE, queue.length ? queue : null);
}

function uid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------- derived view ----------

/** Re-derive the rendered snapshot = server snapshot + pending queue applied in order. */
function recompute(): void {
  const { serverSnapshot, khutbah } = store.getState();
  let view = serverSnapshot;
  if (view && khutbah) for (const q of queue) view = applyLocal(view, khutbah, q.command);
  store.setState({ snapshot: view, pending: queue.length });
}

/** Seed the store from localStorage so a reload while offline still shows the text. */
export function seedFromCache(): void {
  const s = store.getState();
  const patch: Partial<typeof s> = {};
  if (!s.khutbah) {
    const k = readCache<LiveKhutbah>(KHUTBAH_CACHE);
    if (k) patch.khutbah = k;
  }
  if (!s.serverSnapshot) {
    const snap = readCache<LiveSessionSnapshot>(SNAPSHOT_CACHE);
    if (snap) patch.serverSnapshot = snap;
  }
  if (Object.keys(patch).length) store.setState(patch);
  recompute();
}

/** Accept an authoritative snapshot (socket, HTTP, or cache). Drops out-of-order updates of the same session. */
export function acceptSnapshot(snap: LiveSessionSnapshot): void {
  const prev = store.getState().serverSnapshot;
  if (prev && prev.sessionId === snap.sessionId && snap.seq < prev.seq) return;

  // Commands queued for a session that no longer exists are meaningless.
  if (!snap.sessionId || (prev && prev.sessionId && prev.sessionId !== snap.sessionId)) {
    if (queue.length) {
      queue = [];
      saveQueue();
    }
  }
  // The in-flight command was applied if the server moved past the seq it was sent at.
  const head = queue[0];
  if (head && head.sentAtSeq !== undefined && snap.seq > head.sentAtSeq) {
    queue.shift();
    saveQueue();
  }

  store.setState({ serverSnapshot: snap });
  writeCache(SNAPSHOT_CACHE, snap);
  recompute();
}

export function setKhutbah(k: LiveKhutbah): void {
  store.setState({ khutbah: k });
  writeCache(KHUTBAH_CACHE, k);
  recompute();
}

function patchParagraph(p: LiveParagraph): void {
  const k = store.getState().khutbah;
  if (!k) return;
  const i = k.paragraphs.findIndex((x) => x.id === p.id);
  if (i === -1) return;
  const paragraphs = k.paragraphs.slice();
  paragraphs[i] = p;
  setKhutbah({ ...k, paragraphs });
}

/** HTTP fallback / initial load: GET /api/session. */
export async function refreshFromHttp(): Promise<void> {
  const res = await api.get<{ session: LiveSessionSnapshot; khutbah: LiveKhutbah | null; displays: number }>('/session');
  acceptSnapshot(res.session);
  if (res.khutbah) setKhutbah(res.khutbah);
  store.setState({ displays: res.displays });
}

// ---------- commands ----------

/** Apply optimistically, queue, and flush through the socket (in order, with acks). */
export function sendCommand(command: SessionCommand): void {
  queue.push({ commandId: uid(), command, clientSeq: ++clientSeq });
  saveQueue();
  recompute();
  void flush();
}

function emitCommand(item: QueuedCommand): Promise<CommandAck | null> {
  return new Promise((resolve) => {
    const s = socket;
    if (!s || !s.connected) return resolve(null);
    s.timeout(ACK_TIMEOUT_MS).emit(
      'imam:command',
      { commandId: item.commandId, command: item.command, clientSeq: item.clientSeq },
      (err: unknown, res?: CommandAck) => {
        if (err || !res) return resolve(null);
        resolve(res);
      },
    );
  });
}

async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    while (queue.length && socket?.connected) {
      const item = queue[0];
      item.sentAtSeq = store.getState().serverSnapshot?.seq ?? 0;
      const res = await emitCommand(item);
      if (res === null) break; // disconnected / timed out: retry after reconnect (sentAtSeq guards against a double apply)
      const i = queue.indexOf(item);
      if (i >= 0) queue.splice(i, 1);
      saveQueue();
      if (!res.ok) console.warn('[imam] command rejected', item.command, res.error);
      recompute();
    }
  } finally {
    flushing = false;
  }
}

// ---------- heartbeat ----------

export function startHeartbeat(): void {
  stopHeartbeat();
  const beat = () => {
    if (socket?.connected) socket.emit('imam:heartbeat', { deviceId: deviceId() });
  };
  beat();
  heartbeatTimer = setInterval(beat, SESSION_HEARTBEAT_MS);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

// ---------- socket lifecycle ----------

export function connectLive(): void {
  const session = store.getState().session;
  if (!session || socket) return;
  seedFromCache();

  const me = deviceId();
  const s = createSocket({ token: session.accessToken, deviceId: me, tenantId: session.tenantId ?? undefined });
  // Always authenticate with the freshest token (it may have been refreshed since the socket was created).
  s.auth = (cb) => cb({ token: store.getState().session?.accessToken ?? '', deviceId: me });
  socket = s;

  s.on('connect', () => {
    store.setState({ connected: true, everConnected: true });
    s.emit('imam:hello', { deviceId: me }, (snap) => {
      if (snap) acceptSnapshot(snap);
      void flush();
    });
    void measureClockOffset(s).then(({ offsetMs, rttMs }) => {
      if (rttMs >= 0) store.setState({ clockOffsetMs: offsetMs });
    });
  });

  s.on('disconnect', () => store.setState({ connected: false }));

  s.on('connect_error', (err) => {
    store.setState({ connected: false });
    // Transport errors reconnect on their own; a middleware rejection (expired token) needs a refresh + manual connect.
    if (!/UNAUTHORIZED|NO_TENANT/i.test(err.message)) return;
    if (authRetryTimer) return;
    authRetryTimer = setTimeout(async () => {
      authRetryTimer = null;
      try {
        await api.get('/session'); // a 401 here triggers the transparent token refresh
      } catch {
        /* handled by onUnauthorized when the refresh token is dead */
      }
      if (store.getState().session && socket === s) s.connect();
    }, 1500);
  });

  s.on('session:state', acceptSnapshot);
  s.on('session:khutbah', setKhutbah);
  s.on('session:paragraphUpdated', patchParagraph);
  s.on('displays:count', ({ count }) => store.setState({ displays: count }));
  s.on('server:time', (ts) => {
    if (!store.getState().everConnected) store.setState({ clockOffsetMs: ts - Date.now() });
  });
  s.on('imam:conflict', (info) => {
    if (info.deviceId === me) return; // we are the device that took over
    queue = [];
    saveQueue();
    store.setState({ conflict: info, screen: 'pick' });
    recompute();
  });
}

export function disconnectLive(): void {
  stopHeartbeat();
  if (authRetryTimer) clearTimeout(authRetryTimer);
  authRetryTimer = null;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  queue = [];
  saveQueue();
  writeCache(KHUTBAH_CACHE, null);
  writeCache(SNAPSHOT_CACHE, null);
  store.setState({ connected: false, everConnected: false, serverSnapshot: null, snapshot: null, khutbah: null, displays: 0, pending: 0, conflict: null });
}

export function isLiveConnected(): boolean {
  return !!socket?.connected;
}
