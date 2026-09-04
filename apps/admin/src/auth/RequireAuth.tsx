import type { ReactNode } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Role } from '@jumaah/shared';
import { EmptyState } from '@jumaah/ui';
import { useAuth } from './AuthProvider';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { role } = useAuth();
  const { t } = useTranslation();
  if (!role || !roles.includes(role)) return <EmptyState title={t('errors.FORBIDDEN')} />;
  return <>{children}</>;
}

/** Mosque pages need a tenant: super admins must pick one first. */
export function RequireTenant({ children }: { children: ReactNode }) {
  const { tenantId, isSuper } = useAuth();
  const { t } = useTranslation();
  if (!tenantId && isSuper) {
    return (
      <EmptyState
        title={t('tenants.noTenantSelected')}
        hint={t('tenants.selectMosque')}
        action={
          <Link to="/tenants" className="j-btn j-btn-primary">
            {t('nav.tenants')}
          </Link>
        }
      />
    );
  }
  return <>{children}</>;
}
