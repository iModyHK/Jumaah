import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthResponse, AuthUser, Role } from '@jumaah/shared';
import type { StoredSession } from '@jumaah/ui';
import { activeTenantId, api, getSession, onUnauthorized, setSession, subscribeSession } from '../api';

export interface AuthContextValue {
  session: StoredSession | null;
  user: AuthUser | null;
  role: Role | null;
  /** Tenant currently being managed (own tenant or the one picked by a super admin). */
  tenantId: string | null;
  isSuper: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<AuthResponse>;
  acceptAuth: (data: AuthResponse) => void;
  logout: () => Promise<void>;
  setTenantId: (tenantId: string | null) => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setLocal] = useState<StoredSession | null>(getSession());
  const qc = useQueryClient();

  useEffect(() => subscribeSession(setLocal), []);
  useEffect(() => {
    onUnauthorized(() => {
      qc.clear();
    });
  }, [qc]);

  const login = useCallback((email: string, password: string, tenantSlug?: string) => api.login(email, password, tenantSlug), []);

  const acceptAuth = useCallback((data: AuthResponse) => {
    setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user, tenantId: data.user.tenantId });
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    qc.clear();
  }, [qc]);

  const setTenantId = useCallback(
    (tenantId: string | null) => {
      const s = getSession();
      if (!s) return;
      setSession({ ...s, tenantId });
      qc.clear();
    },
    [qc],
  );

  const refreshMe = useCallback(async () => {
    const s = getSession();
    if (!s) return;
    const me = await api.get<AuthUser>('/auth/me');
    setSession({ ...s, user: { ...me, tenantId: s.user.tenantId } });
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const user = session?.user ?? null;
    const role = user?.role ?? null;
    return {
      session,
      user,
      role,
      tenantId: activeTenantId(session),
      isSuper: role === 'SUPER_ADMIN',
      canEdit: role === 'SUPER_ADMIN' || role === 'MOSQUE_ADMIN' || role === 'TRANSLATOR',
      isAdmin: role === 'SUPER_ADMIN' || role === 'MOSQUE_ADMIN',
      login,
      acceptAuth,
      logout,
      setTenantId,
      refreshMe,
    };
  }, [session, login, acceptAuth, logout, setTenantId, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
