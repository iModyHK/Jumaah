import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@jumaah/ui';
import { api } from '../api';
import { PageHeader, Stat } from '../components/PageHeader';
import { useExtensions } from '../extensions';

export interface PlatformStats {
  tenants: number;
  users: number;
  khutbahs: number;
  displays: number;
  activeSessions: number;
  imageTag: string;
  mode: string;
  [extra: string]: unknown;
}

/** Server-wide view for the super admin: counts and the software version; extensions add their cards below. */
export function PlatformPage() {
  const { t } = useTranslation();
  const ext = useExtensions();
  const stats = useQuery({ queryKey: ['platform', 'stats'], queryFn: () => api.get<PlatformStats>('/platform/stats'), refetchInterval: 30_000 });
  const s = stats.data;
  return (
    <div>
      <PageHeader title={t('tenants.platform')} subtitle={s ? `${t('sync.mode')}: ${t(`sync.${s.mode}`, { defaultValue: s.mode })} · ${t('sync.imageTag')}: ${s.imageTag}` : undefined} />
      {stats.isLoading && <Spinner />}
      {s && (
        <div className="grid gap-4 md:grid-cols-5">
          <Stat label={t('nav.tenants')} value={s.tenants} />
          <Stat label={t('nav.users')} value={s.users} />
          <Stat label={t('nav.khutbahs')} value={s.khutbahs} />
          <Stat label={t('nav.displays')} value={s.displays} />
          <Stat label={t('tenants.activeSessions')} value={s.activeSessions} />
        </div>
      )}
      {ext.platformCards.map((C, i) => (
        <C key={i} />
      ))}
    </div>
  );
}
