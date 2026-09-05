import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { Field, TextInput } from '../components/Field';
import { Card, PageHeader, Stat } from '../components/PageHeader';
import { PlatformBillingCard } from '../components/PlatformBillingCard';
import { useToast } from '../components/Toast';
import { fmtDate } from '../lib/format';

interface PlatformStats {
  tenants: number;
  users: number;
  khutbahs: number;
  displays: number;
  activeSessions: number;
  latestImageTag: string;
  imageTag: string;
  mode: 'edge' | 'cloud';
}

export function PlatformPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const stats = useQuery({ queryKey: ['platform', 'stats'], queryFn: () => api.get<PlatformStats>('/platform/stats'), refetchInterval: 30_000 });
  const settings = useQuery({ queryKey: ['platform', 'settings'], queryFn: () => api.get<Record<string, unknown>>('/platform/settings') });
  const [tag, setTag] = useState('');

  useEffect(() => {
    const v = settings.data?.['edge.latestImageTag'] as { tag?: string } | undefined;
    if (v?.tag !== undefined) setTag(v.tag);
    else if (stats.data) setTag(stats.data.latestImageTag);
  }, [settings.data, stats.data]);

  const save = useMutation({
    mutationFn: () => api.put('/platform/settings/edge.latestImageTag', { value: { tag: tag.trim() } }),
    onSuccess: () => {
      toast.success(t('common.success'));
      void qc.invalidateQueries({ queryKey: ['platform'] });
    },
    onError: (e) => toast.error(e),
  });

  const s = stats.data;
  return (
    <div>
      <PageHeader title={t('tenants.platform')} subtitle={s ? `${t('sync.mode')}: ${t(`sync.${s.mode}`)} · ${t('sync.imageTag')}: ${s.imageTag}` : undefined} />
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
      <Card
        title={t('sync.latestImageTag')}
        className="mt-4 max-w-xl"
        actions={
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || !tag.trim()}>
            {save.isPending ? <Spinner /> : t('common.save')}
          </Button>
        }
      >
        <Field label="edge.latestImageTag" hint={t('tenants.latestImageTagHint')}>
          <TextInput dir="ltr" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="v1.2.3" />
        </Field>
      </Card>
      <AiUsageOverview />
      <PlatformBillingCard />
    </div>
  );
}

interface AiUsageRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  state: 'active' | 'grace' | 'expired' | 'suspended';
  endsAt: string | null;
  aiIncluded: boolean;
  usedParagraphs: number;
  monthlyParagraphs: number | null;
  allowed: boolean;
}

/** Hosted edition: every mosque's plan, state and platform-AI usage this month, the view used for manual billing. */
function AiUsageOverview() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['platform', 'ai-usage'], queryFn: () => api.get<{ month: string; applies: boolean; items: AiUsageRow[] }>('/platform/ai-usage'), refetchInterval: 60_000 });
  const d = q.data;
  if (!d || !d.applies) return null;
  const tone = (r: AiUsageRow) => (!r.allowed ? 'danger' : r.state === 'grace' || (r.monthlyParagraphs && r.usedParagraphs >= r.monthlyParagraphs * 0.8) ? 'warn' : 'ok');
  return (
    <Card title={`${t('tenants.aiUsage')} · ${d.month}`} className="mt-4">
      <div className="j-muted mb-2 text-xs">{t('tenants.aiUsageHint')}</div>
      {d.items.length === 0 && <div className="j-muted text-sm">{t('tenants.noAiUsage')}</div>}
      {d.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="j-muted text-start text-xs">
                <th className="py-1 text-start">{t('tenants.title')}</th>
                <th className="py-1 text-start">{t('tenants.plan')}</th>
                <th className="py-1 text-start">{t('common.status')}</th>
                <th className="py-1 text-start">{t('tenants.subscriptionEndsAt')}</th>
                <th className="py-1 text-start">{t('tenants.aiState')}</th>
                <th className="py-1 text-end">{t('tenants.used')}</th>
                <th className="py-1 text-end">{t('tenants.allowance')}</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--j-border)' }}>
                  <td className="py-1.5">
                    {r.name} <span className="j-muted text-xs" dir="ltr">{r.slug}</span>
                  </td>
                  <td className="py-1.5">{t(`tenants.plans.${r.plan}`)}</td>
                  <td className="py-1.5">{t(`tenants.subscriptionStatus.${r.status}`)}</td>
                  <td className="py-1.5 text-xs">{fmtDate(r.endsAt)}</td>
                  <td className="py-1.5">
                    <StatusPill tone={tone(r)}>{t(`plan.state.${r.state}`)}</StatusPill>
                  </td>
                  <td className="py-1.5 text-end tabular-nums">{r.aiIncluded ? r.usedParagraphs : '—'}</td>
                  <td className="py-1.5 text-end tabular-nums">{r.aiIncluded ? (r.monthlyParagraphs ?? t('plan.unlimited')) : t('plan.deny.NOT_INCLUDED', { plan: t(`tenants.plans.${r.plan}`) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
