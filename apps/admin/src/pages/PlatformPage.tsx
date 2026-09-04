import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { Field, TextInput } from '../components/Field';
import { Card, PageHeader, Stat } from '../components/PageHeader';
import { useToast } from '../components/Toast';

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
    </div>
  );
}
