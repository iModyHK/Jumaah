import type { ApiError, AuthResponse, AuthUser } from '@jumaah/shared';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  /** Super admin acting inside a tenant */
  tenantId?: string | null;
}

const SESSION_KEY = 'jumaah.session';

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: StoredSession | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Resolve the API origin: VITE_API_URL at build time, otherwise same origin (Caddy proxies /api). */
export function apiBaseUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  const configured = env?.VITE_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export interface ApiClientOptions {
  baseUrl?: string;
  getSession: () => StoredSession | null;
  setSession: (s: StoredSession | null) => void;
  onUnauthorized?: () => void;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  raw?: boolean;
}

/** Fetch wrapper with JWT bearer, transparent refresh, tenant header for super admins, typed errors. */
export function createApiClient(opts: ApiClientOptions) {
  const base = (opts.baseUrl ?? apiBaseUrl()) + '/api';
  let refreshing: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const s = opts.getSession();
      if (!s?.refreshToken) return false;
      try {
        const res = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) });
        if (!res.ok) return false;
        const data = (await res.json()) as AuthResponse;
        opts.setSession({ ...s, accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function request<T>(path: string, o: RequestOptions = {}, retry = true): Promise<T> {
    const s = opts.getSession();
    const url = new URL(base + path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    const headers: Record<string, string> = {};
    if (s?.accessToken) headers.authorization = `Bearer ${s.accessToken}`;
    if (s?.tenantId) headers['x-tenant-id'] = s.tenantId;
    if (o.body !== undefined && !o.formData) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await fetch(url.toString(), { method: o.method ?? (o.body || o.formData ? 'POST' : 'GET'), headers, body: o.formData ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined), signal: o.signal });
    } catch (err) {
      throw new ApiRequestError(0, 'NETWORK', (err as Error).message);
    }
    if (res.status === 401 && retry && s?.refreshToken && !path.startsWith('/auth/')) {
      if (await refresh()) return request<T>(path, o, false);
      opts.setSession(null);
      opts.onUnauthorized?.();
    }
    if (!res.ok) {
      let body: ApiError | null = null;
      try {
        body = (await res.json()) as ApiError;
      } catch {
        /* ignore */
      }
      throw new ApiRequestError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? res.statusText, body?.error?.details);
    }
    if (o.raw) return res as unknown as T;
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    request,
    get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) => request<T>(path, { method: 'GET', query, signal }),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
    put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body ?? {} }),
    patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body ?? {} }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    upload: <T>(path: string, file: File, query?: RequestOptions['query']) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      return request<T>(path, { method: 'POST', formData: fd, query });
    },
    async login(email: string, password: string, tenantSlug?: string): Promise<AuthResponse> {
      const data = await request<AuthResponse>('/auth/login', { method: 'POST', body: { email, password, tenantSlug: tenantSlug || undefined } }, false);
      opts.setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user, tenantId: data.user.tenantId });
      return data;
    },
    async logout(): Promise<void> {
      const s = opts.getSession();
      if (s?.refreshToken) await request('/auth/logout', { method: 'POST', body: { refreshToken: s.refreshToken } }, false).catch(() => undefined);
      opts.setSession(null);
    },
    baseUrl: base,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
