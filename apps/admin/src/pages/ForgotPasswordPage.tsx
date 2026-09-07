import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { forgotPasswordSchema, resetPasswordSchema, type HostInfoDto } from '@jumaah/core';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { Field, TextInput } from '../components/Field';
import { useToast } from '../components/Toast';
import { clean, validate } from '../lib/forms';

/** /forgot: ask for a reset link by email. Never says whether the address exists. */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const host = useQuery({ queryKey: ['public', 'host'], queryFn: () => api.get<HostInfoDto>('/public/host'), staleTime: Infinity });
  const [email, setEmail] = useState('');
  const [tenantSlug, setSlug] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const impliedMosque = host.data?.tenant ?? null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validate(forgotPasswordSchema, clean({ email: email.trim().toLowerCase(), tenantSlug: impliedMosque ? undefined : tenantSlug.trim() }));
    setErrors(v.errors);
    if (!v.ok) return;
    setBusy(true);
    try {
      await api.post('/auth/forgot', v.data);
      setSent(true);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={(e) => void submit(e)} className="j-card j-fade-in w-full max-w-sm p-6">
        <h1 className="mb-1 text-xl font-bold">{t('auth.forgotTitle')}</h1>
        <p className="j-muted mb-4 text-sm">{t('auth.forgotHint')}</p>
        {sent ? (
          <p className="text-sm">{t('auth.forgotSent')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label={t('auth.email')} error={errors.email}>
              <TextInput type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {!impliedMosque && (
              <Field label={t('auth.mosque')} error={errors.tenantSlug}>
                <TextInput value={tenantSlug} onChange={(e) => setSlug(e.target.value)} dir="ltr" placeholder="my-mosque" />
              </Field>
            )}
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? <Spinner /> : t('auth.sendReset')}
            </Button>
          </div>
        )}
        <div className="mt-4 text-sm">
          <Link to="/login" className="underline">
            {t('auth.backToLogin')}
          </Link>
        </div>
      </form>
    </div>
  );
}

/** /reset/:token: choose a new password. */
export function ResetPasswordPage() {
  const { token = '' } = useParams();
  const { t } = useTranslation();
  const toast = useToast();
  const check = useQuery({ queryKey: ['auth', 'reset', token], queryFn: () => api.get<{ email: string; tenant: { name: string; slug: string } | null }>(`/auth/reset/${encodeURIComponent(token)}`), retry: false, enabled: !!token });
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validate(resetPasswordSchema, { token, password });
    setErrors(v.errors);
    if (!v.ok) return;
    setBusy(true);
    try {
      await api.post('/auth/reset', v.data);
      setDone(true);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={(e) => void submit(e)} className="j-card j-fade-in w-full max-w-sm p-6">
        <h1 className="mb-1 text-xl font-bold">{t('auth.resetTitle')}</h1>
        {check.isLoading && <Spinner />}
        {check.isError && <p className="text-sm">{t('auth.resetInvalid')}</p>}
        {check.data && !done && (
          <div className="flex flex-col gap-3">
            <p className="j-muted text-sm">
              <span dir="ltr">{check.data.email}</span>
              {check.data.tenant ? ` · ${check.data.tenant.name}` : ''}
            </p>
            <Field label={t('auth.newPassword')} error={errors.password}>
              <TextInput type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? <Spinner /> : t('auth.resetSubmit')}
            </Button>
          </div>
        )}
        {done && <p className="text-sm">{t('auth.resetDone')}</p>}
        <div className="mt-4 text-sm">
          <Link to="/login" className="underline">
            {t('auth.backToLogin')}
          </Link>
        </div>
      </form>
    </div>
  );
}
