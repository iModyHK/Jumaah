import { createApiClient, loadSession, saveSession, type ApiClient, type StoredSession } from '@jumaah/ui';

type Listener = (s: StoredSession | null) => void;
const listeners = new Set<Listener>();
let current: StoredSession | null = loadSession();

export function getSession(): StoredSession | null {
  return current;
}

export function setSession(s: StoredSession | null): void {
  current = s;
  saveSession(s);
  for (const l of listeners) l(s);
}

export function subscribeSession(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

export const api: ApiClient = createApiClient({
  getSession,
  setSession,
  onUnauthorized: () => unauthorizedHandler?.(),
});

export function useApi(): ApiClient {
  return api;
}

/** Tenant the current session operates on (own tenant, or the one a super admin picked). */
export function activeTenantId(s: StoredSession | null = current): string | null {
  if (!s) return null;
  return s.user.tenantId ?? s.tenantId ?? null;
}
