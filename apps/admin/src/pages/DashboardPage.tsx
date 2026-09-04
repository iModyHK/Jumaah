import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getLanguage, type KhutbahDto, type LiveKhutbah, type LiveSessionSnapshot, type Paginated } from '@jumaah/shared';
import { EmptyState, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Card, PageHeader, Stat } from '../components/PageHeader';
import { ProgressBar } from '../components/ProgressBar';
import { KhutbahStatusBadge } from '../components/StatusBadge';
import { useSocketEvent } from '../lib/socket';
import { fmtDate, fmtDuration, toDateInput } from '../lib/format';
import { Navigate } from 'react-router-dom';

interface SessionInfo {
  session: LiveSessionSnapshot;
  khutbah: LiveKhutbah | null;
  displays: number;
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user, isSuper, tenantId } = useAuth();
  const today = toDateInput(new Date());

  const upcoming = useQuery({
    queryKey: ['khutbahs', 'upcoming', tenantId],
    queryFn: () => api.get<Paginated<KhutbahDto>>('/khutbahs', { from: today, pageSize: 50 }),
    enabled: !!tenantId,
  });
  const session = useQuery({ queryKey: ['session', tenantId], queryFn: () => api.get<SessionInfo>('/session'), enabled: !!tenantId, refetchInterval: 30_000 });

  const [live, setLive] = useState<LiveSessionSnapshot | null>(null);
  const [displays, setDisplays] = useState<number | null>(null);
  useSocketEvent(
    'session:state',
    useCallback((snap: LiveSessionSnapshot) => setLive(snap), []),
  );
  useSocketEvent(
    'displays:count',
    useCallback((info: { count: number }) => setDisplays(info.count), []),
  );

  if (isSuper && !tenantId) return <Navigate to="/tenants" replace />;

  const next = [...(upcoming.data?.items ?? [])].filter((k) => k.gregorianDate >= today && k.status !== 'ARCHIVED').sort((a, b) => a.gregorianDate.localeCompare(b.gregorianDate))[0];
  const snap = live ?? session.data?.session ?? null;
  const displayCount = displays ?? session.data?.displays ?? 0;
  const activeState = snap && snap.state !== 'ENDED' && snap.khutbahId ? snap : null;

  return (
    <div>
      <PageHeader title={t('dashboard.welcome', { name: user?.name ?? '' })} />
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label={t('dashboard.activeDisplays')} value={displayCount} />
        <Stat
          label={t('dashboard.liveSession')}
          value={activeState ? <StatusPill tone={activeState.state === 'LIVE' ? 'ok' : 'warn'}>{t(`dashboard.states.${activeState.state}`)}</StatusPill> : <span className="j-muted text-base">{t('dashboard.noSession')}</span>}
          hint={activeState && session.data?.khutbah ? session.data.khutbah.title : undefined}
        />
        <Stat label={t('dashboard.nextKhutbah')} value={next ? fmtDate(next.gregorianDate) : <span className="j-muted text-base">{t('dashboard.noUpcoming')}</span>} hint={next?.hijriDate ?? undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title={t('dashboard.nextKhutbah')} className="lg:col-span-2">
          {upcoming.isLoading && <Spinner />}
          {!upcoming.isLoading && !next && (
            <EmptyState
              title={t('dashboard.noUpcoming')}
              action={
                <Link to="/khutbahs/new" className="j-btn j-btn-primary">
                  {t('dashboard.newKhutbah')}
                </Link>
              }
            />
          )}
          {next && <NextKhutbah k={next} />}
        </Card>

        <div className="flex flex-col gap-4">
          <Card title={t('dashboard.liveSession')}>
            {activeState ? (
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="j-muted">{t('dashboard.state')}</span>
                  <StatusPill tone={activeState.state === 'LIVE' ? 'ok' : 'warn'}>{t(`dashboard.states.${activeState.state}`)}</StatusPill>
                </div>
                <div className="flex items-center justify-between">
                  <span className="j-muted">{t('dashboard.currentSection')}</span>
                  <span>{activeState.currentSection ? t(`khutbah.sections.${activeState.currentSection}`) : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="j-muted">{t('dashboard.currentParagraph')}</span>
                  <span className="tabular-nums">{activeState.currentIndex + 1}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="j-muted">{t('imam.title')}</span>
                  <span style={{ color: activeState.imamConnected ? 'var(--j-accent)' : 'var(--j-warn)' }}>{activeState.imamConnected ? t('imam.connected') : t('sync.offline')}</span>
                </div>
                {session.data?.khutbah && (
                  <Link to={`/khutbahs/${session.data.khutbah.id}`} className="j-btn mt-2">
                    {session.data.khutbah.title}
                  </Link>
                )}
              </div>
            ) : (
              <div className="j-muted text-sm">{t('dashboard.noSession')}</div>
            )}
          </Card>

          <Card title={t('dashboard.quickActions')}>
            <div className="flex flex-col gap-2">
              <Link to="/khutbahs/new" className="j-btn j-btn-primary">
                {t('dashboard.newKhutbah')}
              </Link>
              <a href="/imam/" target="_blank" rel="noreferrer" className="j-btn">
                {t('dashboard.openImam')}
              </a>
              <Link to="/displays" className="j-btn">
                {t('nav.displays')}
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function NextKhutbah({ k }: { k: KhutbahDto }) {
  const { t } = useTranslation();
  const stats = k.stats;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to={`/khutbahs/${k.id}`} className="text-lg font-semibold hover:underline">
            {k.title}
          </Link>
          <div className="j-muted text-sm">
            {fmtDate(k.gregorianDate)} {k.hijriDate ? `· ${k.hijriDate}` : ''} {k.imamName ? `· ${k.imamName}` : ''}
          </div>
        </div>
        <KhutbahStatusBadge status={k.status} />
      </div>
      {stats && (
        <div className="j-muted text-xs">
          {t('khutbah.paragraphs')}: {stats.paragraphs} · {t('khutbah.estimatedSeconds')}: {fmtDuration(stats.estimatedSeconds)}
        </div>
      )}
      <div className="text-sm font-semibold">{t('khutbah.readiness')}</div>
      {stats && stats.paragraphs > 0 ? (
        <div className="flex flex-col gap-2">
          {k.targetLanguages.map((lang) => {
            const s = stats.perLanguage[lang] ?? { approved: 0, reviewed: 0, machine: 0, pending: 0, rejected: 0 };
            return (
              <div key={lang} className="grid grid-cols-[6rem_1fr] items-center gap-3">
                <span className="truncate text-sm" lang={lang} dir={getLanguage(lang).dir}>
                  {getLanguage(lang).nativeName}
                </span>
                <ProgressBar value={s.approved} max={stats.paragraphs} label={`${s.approved}/${stats.paragraphs}`} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="j-muted text-sm">{t('khutbah.noParagraphs')}</div>
      )}
      <div className="flex gap-2">
        <Link to={`/khutbahs/${k.id}`} className="j-btn">
          {t('common.edit')}
        </Link>
        <a href="/imam/" target="_blank" rel="noreferrer" className="j-btn j-btn-primary">
          {t('khutbah.startLive')}
        </a>
      </div>
    </div>
  );
}
