import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { DisplayConfig, LiveKhutbah, LiveParagraph, LiveSessionSnapshot, TenantPublicInfo } from '@jumaah/shared';
import { apiBaseUrl, createSocket, deviceId, measureClockOffset, type JumaahSocket } from '@jumaah/ui';

export type LiveSource = { kind: 'display'; token: string } | { kind: 'mobile'; slug: string };

export interface LiveState {
  /** `loading` until we have enough to render (cache or network); `invalid` when the token/slug is rejected. */
  phase: 'loading' | 'ready' | 'invalid';
  connected: boolean;
  /** True once the socket delivered at least one snapshot in this page life (i.e. data is fresh, not just cached). */
  fresh: boolean;
  tenant: TenantPublicInfo | null;
  config: DisplayConfig | null;
  session: LiveSessionSnapshot | null;
  khutbah: LiveKhutbah | null;
  /** serverNow ≈ Date.now() + offsetMs */
  offsetMs: number;
}

interface Persisted {
  tenant: TenantPublicInfo | null;
  config: DisplayConfig | null;
  session: LiveSessionSnapshot | null;
  khutbah: LiveKhutbah | null;
  savedAt: number;
}

interface DisplayBootstrap {
  display: DisplayConfig;
  tenant: TenantPublicInfo;
  session: LiveSessionSnapshot;
  khutbah: LiveKhutbah | null;
  serverTime: number;
}
interface TenantBootstrap {
  tenant: TenantPublicInfo;
  session: LiveSessionSnapshot;
  khutbah: LiveKhutbah | null;
  serverTime: number;
}

const INVALID_ERRORS = new Set(['INVALID_DISPLAY_TOKEN', 'INVALID_TENANT', 'UNAUTHORIZED']);
const BOOTSTRAP_TIMEOUT_MS = 4000;
const CLOCK_SYNC_MS = 5 * 60 * 1000;

function cacheKey(source: LiveSource): string {
  return source.kind === 'display' ? `jumaah.display.cache.${source.token}` : `jumaah.mobile.cache.${source.slug}`;
}

function loadCache(key: string): Persisted | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

function saveCache(key: string, p: Persisted): void {
  try {
    localStorage.setItem(key, JSON.stringify(p));
  } catch {
    /* quota / private mode: ignore */
  }
}

export interface LiveStore {
  subscribe: (l: () => void) => () => void;
  getState: () => LiveState;
  start: () => void;
  dispose: () => void;
  /** Ask the server to resend state (e.g. after a visibility change). */
  refresh: () => void;
}

export function createLiveStore(source: LiveSource): LiveStore {
  const key = cacheKey(source);
  const cached = loadCache(key);
  const listeners = new Set<() => void>();
  let socket: JumaahSocket | null = null;
  let disposed = false;
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  let state: LiveState = {
    phase: 'loading',
    connected: false,
    fresh: false,
    tenant: cached?.tenant ?? null,
    config: cached?.config ?? null,
    session: cached?.session ?? null,
    khutbah: cached?.khutbah ?? null,
    offsetMs: 0,
  };
  state = { ...state, phase: computePhase(state) };

  function computePhase(s: LiveState): LiveState['phase'] {
    if (s.phase === 'invalid') return 'invalid';
    const ready = !!s.tenant && !!s.session && (source.kind === 'mobile' || !!s.config);
    return ready ? 'ready' : 'loading';
  }

  function emit() {
    for (const l of listeners) l();
  }

  function set(patch: Partial<LiveState>) {
    const next = { ...state, ...patch };
    next.phase = computePhase(next);
    state = next;
    if ('tenant' in patch || 'config' in patch || 'session' in patch || 'khutbah' in patch) {
      saveCache(key, { tenant: state.tenant, config: state.config, session: state.session, khutbah: state.khutbah, savedAt: Date.now() });
    }
    emit();
  }

  /** Apply a snapshot unless it is older than what we already have for the same session. */
  function acceptSnapshot(snap: LiveSessionSnapshot, fresh: boolean) {
    const cur = state.session;
    if (cur && cur.sessionId === snap.sessionId && snap.seq < cur.seq) return;
    if (cur && cur.sessionId === snap.sessionId && snap.seq === cur.seq && cur.updatedAt >= snap.updatedAt && state.fresh) return;
    set({ session: snap, fresh: state.fresh || fresh });
  }

  function acceptKhutbah(k: LiveKhutbah) {
    const cur = state.khutbah;
    if (cur && cur.id === k.id && cur.version > k.version) return;
    set({ khutbah: k });
  }

  function patchParagraph(p: LiveParagraph) {
    const k = state.khutbah;
    if (!k) return;
    const idx = k.paragraphs.findIndex((x) => x.id === p.id);
    if (idx === -1) return;
    const paragraphs = k.paragraphs.slice();
    paragraphs[idx] = p;
    set({ khutbah: { ...k, paragraphs } });
  }

  function markInvalid() {
    state = { ...state, phase: 'invalid', connected: false };
    emit();
    socket?.disconnect();
  }

  async function bootstrap(): Promise<void> {
    const path = source.kind === 'display' ? `/api/public/display/${encodeURIComponent(source.token)}` : `/api/public/tenant/${encodeURIComponent(source.slug)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), BOOTSTRAP_TIMEOUT_MS);
    const t0 = Date.now();
    try {
      const res = await fetch(apiBaseUrl() + path, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (res.status === 404) {
        markInvalid();
        return;
      }
      if (!res.ok) return;
      const rtt = Date.now() - t0;
      if (source.kind === 'display') {
        const data = (await res.json()) as DisplayBootstrap;
        if (disposed) return;
        set({ tenant: data.tenant, config: data.display, offsetMs: data.serverTime - (t0 + rtt / 2) });
        if (data.khutbah) acceptKhutbah(data.khutbah);
        acceptSnapshot(data.session, false);
      } else {
        const data = (await res.json()) as TenantBootstrap;
        if (disposed) return;
        set({ tenant: data.tenant, offsetMs: data.serverTime - (t0 + rtt / 2) });
        if (data.khutbah) acceptKhutbah(data.khutbah);
        acceptSnapshot(data.session, false);
      }
    } catch {
      /* offline or slow: keep the cached snapshot, the socket will catch up */
    } finally {
      clearTimeout(timer);
    }
  }

  function openSocket() {
    if (disposed || socket) return;
    const auth = source.kind === 'display' ? { displayToken: source.token, deviceId: deviceId() } : { slug: source.slug, deviceId: deviceId() };
    const s = createSocket(auth);
    socket = s;

    s.on('connect', () => {
      set({ connected: true });
      void syncClock();
    });
    s.on('disconnect', () => set({ connected: false }));
    s.on('connect_error', (err) => {
      if (INVALID_ERRORS.has(err.message)) markInvalid();
    });
    s.on('tenant:info', (info) => set({ tenant: info }));
    s.on('display:config', (config) => set({ config }));
    s.on('session:khutbah', (k) => acceptKhutbah(k));
    s.on('session:state', (snap) => acceptSnapshot(snap, true));
    s.on('session:paragraphUpdated', (p) => patchParagraph(p));
    s.on('server:time', (ts) => set({ offsetMs: ts - Date.now() }));

    clockTimer = setInterval(() => void syncClock(), CLOCK_SYNC_MS);
  }

  async function syncClock() {
    if (!socket?.connected) return;
    const { rttMs, offsetMs } = await measureClockOffset(socket);
    if (rttMs >= 0 && !disposed) set({ offsetMs });
  }

  return {
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getState: () => state,
    start() {
      // React StrictMode mounts → unmounts → mounts again with the same memoised store: re-arm it.
      disposed = false;
      void bootstrap().finally(() => {
        if (state.phase !== 'invalid') openSocket();
      });
    },
    refresh() {
      if (!socket?.connected) return;
      if (source.kind === 'display') socket.emit('display:hello', { token: source.token, deviceId: deviceId() });
      void syncClock();
    },
    dispose() {
      disposed = true;
      if (clockTimer) clearInterval(clockTimer);
      clockTimer = null;
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = null;
    },
  };
}

/** React binding: bootstrap + socket lifecycle tied to the component. */
export function useLiveStore(source: LiveSource): LiveState {
  const id = source.kind === 'display' ? `d:${source.token}` : `m:${source.slug}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = useMemo(() => createLiveStore(source), [id]);
  useEffect(() => {
    store.start();
    const onVisible = () => {
      if (document.visibilityState === 'visible') store.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      store.dispose();
    };
  }, [store]);
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** The khutbah only counts if it matches the session; otherwise it is stale cache. */
export function activeKhutbah(state: Pick<LiveState, 'session' | 'khutbah'>): LiveKhutbah | null {
  const { session, khutbah } = state;
  if (!session || !khutbah || !session.khutbahId) return null;
  return khutbah.id === session.khutbahId ? khutbah : null;
}

export function currentParagraphs(session: LiveSessionSnapshot | null, khutbah: LiveKhutbah | null): { current: LiveParagraph | null; previous: LiveParagraph | null; index: number } {
  if (!session || !khutbah || khutbah.paragraphs.length === 0) return { current: null, previous: null, index: -1 };
  let index = session.currentParagraphId ? khutbah.paragraphs.findIndex((p) => p.id === session.currentParagraphId) : -1;
  if (index === -1) index = Math.min(Math.max(session.currentIndex, 0), khutbah.paragraphs.length - 1);
  return { current: khutbah.paragraphs[index] ?? null, previous: index > 0 ? khutbah.paragraphs[index - 1] ?? null : null, index };
}
