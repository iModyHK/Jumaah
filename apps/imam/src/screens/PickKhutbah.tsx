import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiRequestError, Button, ConnectionDot, Spinner, deviceId, useLocalStorage, useOnline } from '@jumaah/ui';
import type { KhutbahDto, KhutbahStatus, LiveKhutbah, LiveSessionSnapshot, Paginated } from '@jumaah/shared';
import { api } from '../api';
import { store, useAppState } from '../state/store';
import { acceptSnapshot, disconnectLive, refreshFromHttp, setKhutbah } from '../state/live';
import { isSessionActive } from '../state/reducer';
import { formatGregorian, hijriOf } from '../format';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LocaleToggle } from '../components/LocaleToggle';
import { StatusBadge } from '../components/StatusBadge';

const SHOWN: KhutbahStatus[] = ['READY', 'REVIEW', 'DELIVERED', 'TRANSLATING'];
const ORDER: Record<string, number> = { READY: 0, REVIEW: 1, TRANSLATING: 2, DELIVERED: 3 };

export function PickKhutbah() {
  const { t, i18n } = useTranslation();
  const { session, snapshot, khutbah, connected, displays } = useAppState();
  const online = useOnline();
  const [items, setItems] = useState<KhutbahDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [takeOver, setTakeOver] = useState<KhutbahDto | null>(null);
  const [autoAdvance, setAutoAdvance] = useLocalStorage('imam.autoAdvance', false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    api
      .get<Paginated<KhutbahDto>>('/khutbahs', { pageSize: 50, page: 1 })
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setItems([]);
        setLoadError(err instanceof ApiRequestError && err.status === 0 ? t('errors.NETWORK') : t('common.error'));
      });
    void refreshFromHttp().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [t]);

  const list = useMemo(
    () =>
      (items ?? [])
        .filter((k) => SHOWN.includes(k.status))
        .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || b.gregorianDate.localeCompare(a.gregorianDate)),
    [items],
  );

  const active = isSessionActive(snapshot);

  async function start(k: KhutbahDto, force = false) {
    setBusyId(k.id);
    setError(null);
    try {
      const snap = await api.post<LiveSessionSnapshot>('/session/start', { khutbahId: k.id, force, autoAdvance, deviceId: deviceId() });
      acceptSnapshot(snap);
      try {
        setKhutbah(await api.get<LiveKhutbah>(`/khutbahs/${k.id}/live`));
      } catch {
        /* the socket pushes session:khutbah too */
      }
      store.setState({ screen: 'live' });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409 && !force) {
        setTakeOver(k);
        return;
      }
      setError(err instanceof ApiRequestError ? (err.status === 0 ? t('errors.NETWORK') : err.message) : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function logout() {
    disconnectLive();
    await api.logout();
    store.setState({ screen: 'pick' });
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--j-border)', paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-extrabold">{t('imam.selectKhutbah')}</div>
          <div className="truncate text-sm" style={{ color: 'var(--j-fg-muted)' }}>
            {session?.user.tenantName ?? session?.user.tenantSlug ?? ''} · {session?.user.name}
          </div>
        </div>
        <ConnectionDot connected={connected} label={connected ? t('imam.connected') : online ? t('imam.reconnecting') : t('sync.offline')} />
        <span className="text-sm" style={{ color: 'var(--j-fg-muted)' }}>
          {t('imam.displaysConnected', { count: displays })}
        </span>
        <LocaleToggle compact />
        <Button variant="ghost" className="min-h-11" onClick={() => void logout()}>
          {t('common.logout')}
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
        {active && snapshot && (
          <section className="j-card j-fade-in flex flex-wrap items-center gap-3 p-4" style={{ borderColor: 'var(--j-accent)' }}>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold" style={{ color: 'var(--j-accent)' }}>
                {t('dashboard.liveSession')} · {snapshot.state === 'PAUSED' ? t('imam.paused') : snapshot.state === 'IMPROV' ? t('imam.improv') : t('nav.live')}
              </div>
              <div className="truncate text-xl font-bold">{khutbah?.title ?? '…'}</div>
              {khutbah && (
                <div className="text-sm" style={{ color: 'var(--j-fg-muted)' }}>
                  {t('khutbah.paragraph')} {snapshot.currentIndex + 1} / {khutbah.paragraphs.length}
                </div>
              )}
            </div>
            <Button variant="primary" className="min-h-16 px-8 text-xl" onClick={() => store.setState({ screen: 'live' })}>
              {t('imam.resume')}
            </Button>
          </section>
        )}

        <label className="j-card flex cursor-pointer items-center gap-3 p-4 text-lg font-semibold select-none">
          <input type="checkbox" className="h-6 w-6" style={{ accentColor: 'var(--j-accent)' }} checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} />
          {t('imam.autoAdvance')}
        </label>

        {error && (
          <div className="rounded-xl px-4 py-3 font-semibold" style={{ background: 'rgba(229,72,77,0.15)', color: '#ff8a8e' }} role="alert">
            {error}
          </div>
        )}

        {items === null ? (
          <div className="flex items-center justify-center gap-3 p-10" style={{ color: 'var(--j-fg-muted)' }}>
            <Spinner /> {t('common.loading')}
          </div>
        ) : list.length === 0 ? (
          <div className="j-card p-10 text-center text-lg" style={{ color: 'var(--j-fg-muted)' }}>
            {loadError ?? t('imam.noKhutbahs')}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((k) => {
              const stats = k.stats;
              const langs = k.targetLanguages.length ? k.targetLanguages : Object.keys(stats?.perLanguage ?? {});
              const isCurrent = active && snapshot?.khutbahId === k.id;
              return (
                <li key={k.id} className="j-card flex flex-col gap-3 p-4" style={isCurrent ? { borderColor: 'var(--j-accent)' } : undefined}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xl font-bold leading-snug">{k.title}</div>
                      <div className="mt-1 text-sm" style={{ color: 'var(--j-fg-muted)' }}>
                        {hijriOf(k)} · {formatGregorian(k.gregorianDate, i18n.language)}
                        {k.imamName ? ` · ${k.imamName}` : ''}
                      </div>
                    </div>
                    <StatusBadge status={k.status} />
                  </div>

                  {stats && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span style={{ color: 'var(--j-fg-muted)' }}>{t('khutbah.readiness')}:</span>
                      <span className="font-semibold">
                        {stats.paragraphs} {t('khutbah.paragraphs')}
                      </span>
                      {langs.map((lang) => {
                        const approved = stats.perLanguage[lang]?.approved ?? 0;
                        const full = stats.paragraphs > 0 && approved >= stats.paragraphs;
                        const color = full ? 'var(--j-accent)' : approved > 0 ? 'var(--j-warn)' : 'var(--j-fg-muted)';
                        return (
                          <span key={lang} className="rounded-full px-2.5 py-0.5 font-mono font-bold" dir="ltr" style={{ color, border: `1px solid ${color}` }}>
                            {lang} {approved}/{stats.paragraphs}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <Button variant={isCurrent ? 'default' : 'primary'} className="min-h-16 text-xl" disabled={busyId !== null} onClick={() => (isCurrent ? store.setState({ screen: 'live' }) : void start(k))}>
                    {busyId === k.id ? <Spinner /> : isCurrent ? t('imam.resume') : t('imam.start')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <ConfirmDialog
        open={takeOver !== null}
        message={t('imam.takeOver')}
        confirmLabel={t('common.yes')}
        cancelLabel={t('common.cancel')}
        danger
        onCancel={() => setTakeOver(null)}
        onConfirm={() => {
          const k = takeOver;
          setTakeOver(null);
          if (k) void start(k, true);
        }}
      />
    </div>
  );
}
