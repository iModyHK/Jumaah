import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@jumaah/shared';
import { apiBaseUrl } from './api.js';

export type JumaahSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type SocketAuth = { token: string; deviceId: string; tenantId?: string } | { displayToken: string; deviceId: string } | { slug: string; deviceId: string };

/** Stable per-browser device id (used for imam session ownership and display presence). */
export function deviceId(): string {
  const KEY = 'jumaah.deviceId';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `mem-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Typed Socket.IO client with aggressive reconnection (LAN links flap; we want < 200ms recovery once back).
 * Server state is authoritative: on every (re)connect the server pushes `session:state` + `session:khutbah`.
 */
export function createSocket(auth: SocketAuth, baseUrl = apiBaseUrl()): JumaahSocket {
  const query: Record<string, string> = {};
  if ('tenantId' in auth && auth.tenantId) query.tenantId = auth.tenantId;
  return io(baseUrl, {
    path: '/socket.io',
    auth,
    query,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 300,
    reconnectionDelayMax: 3000,
    randomizationFactor: 0.3,
    timeout: 8000,
    autoConnect: true,
  });
}

/** Measure round-trip and clock offset against the server (used for the session timer). */
export function measureClockOffset(socket: JumaahSocket): Promise<{ rttMs: number; offsetMs: number }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    socket.timeout(3000).emit('ping:time', t0, (err: unknown, serverTs?: number) => {
      const t1 = Date.now();
      if (err || typeof serverTs !== 'number') return resolve({ rttMs: -1, offsetMs: 0 });
      resolve({ rttMs: t1 - t0, offsetMs: serverTs - (t0 + (t1 - t0) / 2) });
    });
  });
}
