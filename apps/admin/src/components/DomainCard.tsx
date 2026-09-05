import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DomainStatusDto, TenantDto } from '@jumaah/shared';
import { Button, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Field, TextInput } from './Field';
import { Card } from './PageHeader';
import { useToast } from './Toast';
import { fmtDateTime } from '../lib/format';

/** Custom domain (Pro, hosted edition): set it, point a CNAME at the mosque host, verify, done. */
export function DomainCard({ tenant }: { tenant: TenantDto }) {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['tenant', 'domain', tenantId], queryFn: () => api.get<DomainStatusDto>('/tenant/domain') });
  const [domain, setDomain] = useState(tenant.customDomain ?? '');
  useEffect(() => setDomain(status.data?.domain ?? tenant.customDomain ?? ''), [status.data?.domain, tenant.customDomain]);

  const done = (data: DomainStatusDto) => {
    qc.setQueryData(['tenant', 'domain', tenantId], data);
    void qc.invalidateQueries({ queryKey: ['tenant'] });
  };
  const save = useMutation({
    mutationFn: (d: string | null) => api.put<DomainStatusDto>('/tenant/domain', { domain: d }),
    onSuccess: (data) => {
      toast.success(t('common.success'));
      done(data);
    },
    onError: (e) => toast.error(e),
  });
  const verify = useMutation({
    mutationFn: () => api.post<DomainStatusDto>('/tenant/domain/verify'),
    onSuccess: (data) => {
      if (data.verified) toast.success(t('domain.verifiedToast'));
      else toast.error(new Error(describeError(data.error, data.target, t)));
      done(data);
    },
    onError: (e) => toast.error(e),
  });

  const s = status.data;
  const available = !!s?.available;
  const stored = s?.domain ?? null;
  const dirty = domain.trim().toLowerCase() !== (stored ?? '');
  const shown = stored ?? (domain.trim() || 'khutbah.example.org');

  return (
    <Card title={t('domain.title')}>
      <div className="j-muted mb-3 text-sm">
        {t('domain.hint')}
        {s && !available && <span> · {s.reason === 'NO_BASE_DOMAIN' ? t('domain.notCloud') : t('branding.locked', { plan: t(`tenants.plans.${tenant.plan}`) })}</span>}
      </div>
      {status.isLoading && <Spinner />}
      {s && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('domain.domain')}>
              <TextInput dir="ltr" placeholder="khutbah.alnoor.org.sa" value={domain} onChange={(e) => setDomain(e.target.value)} disabled={!available && !stored} className="w-72" />
            </Field>
            <Button variant="primary" onClick={() => save.mutate(domain.trim() || null)} disabled={save.isPending || !dirty || (!available && !!domain.trim())}>
              {save.isPending ? <Spinner /> : t('common.save')}
            </Button>
            {stored && (
              <>
                <Button onClick={() => verify.mutate()} disabled={verify.isPending || dirty}>
                  {verify.isPending ? <Spinner /> : t('domain.verify')}
                </Button>
                <Button variant="danger" onClick={() => save.mutate(null)} disabled={save.isPending}>
                  {t('domain.clear')}
                </Button>
              </>
            )}
          </div>
          {stored && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusPill tone={s.verified ? 'ok' : 'warn'}>{s.verified ? t('domain.statusVerified') : t('domain.statusPending')}</StatusPill>
              {s.verifiedAt && <span className="j-muted text-xs">{fmtDateTime(s.verifiedAt)}</span>}
              {!s.verified && s.error && <span style={{ color: 'var(--j-danger)' }}>{describeError(s.error, s.target, t)}</span>}
            </div>
          )}
          {available && s.target && (
            <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--j-bg)', border: '1px solid var(--j-border)' }}>
              <div className="j-label">{t('domain.dnsTitle')}</div>
              <div>{t('domain.instructions', { domain: shown, target: s.target })}</div>
              <table className="mt-2 text-xs" dir="ltr">
                <tbody>
                  <tr>
                    <td className="j-muted pe-4">Type</td>
                    <td className="j-muted pe-4">Name</td>
                    <td className="j-muted">Target</td>
                  </tr>
                  <tr className="font-mono">
                    <td className="pe-4">CNAME</td>
                    <td className="pe-4">{shown}</td>
                    <td>{s.target}</td>
                  </tr>
                </tbody>
              </table>
              <div className="j-muted mt-2 text-xs">{t('domain.tlsHint')}</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function describeError(code: string | null, target: string | null, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!code) return '';
  const [kind, value] = code.split(':', 2);
  return t(`domain.errors.${kind}`, { value: value ?? '', target: target ?? '', defaultValue: code });
}
