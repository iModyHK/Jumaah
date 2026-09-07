import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loginSchema, type HostInfoDto } from '@jumaah/core';
import { ApiRequestError, Button, Spinner, currentLocale, setLocale } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Field, TextInput } from '../components/Field';
import { validate, clean } from '../lib/forms';
import { errorMessage } from '../lib/errors';

export function LoginPage() {
  const { t } = useTranslation();
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setSlug] = useState('');
  // With per-mosque hosts (an extension) the address already names the mosque, so the field is replaced by its name.
  const [hostTenant, setHostTenant] = useState<HostInfoDto['tenant']>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locale = currentLocale();

  useEffect(() => {
    let cancelled = false;
    void api.hostInfo().then((info) => {
      if (cancelled || !info.tenant) return;
      setHostTenant(info.tenant);
      setSlug(info.tenant.slug);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (session) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validate(loginSchema, clean({ email: email.trim().toLowerCase(), password, tenantSlug: tenantSlug.trim() }));
    setErrors(v.errors);
    if (!v.ok) return;
    setBusy(true);
    try {
      const res = await login(v.data.email, v.data.password, v.data.tenantSlug);
      const target = res.user.role === 'SUPER_ADMIN' ? '/tenants' : location.state?.from ?? '/';
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError && err.status === 401 ? t('auth.invalidCredentials') : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={(e) => void submit(e)} className="j-card j-fade-in w-full max-w-sm p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="text-2xl font-bold">{hostTenant ? hostTenant.name : t('app.name')}</div>
            <div className="j-muted text-sm">{t('auth.loginTitle')}</div>
          </div>
          <Button type="button" className="px-2 py-1 text-xs" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
            {locale === 'ar' ? t('common.english') : t('common.arabic')}
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          <Field label={t('common.email')} error={errors.email}>
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" dir="ltr" required />
          </Field>
          <Field label={t('common.password')} error={errors.password}>
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          {hostTenant ? (
            <Field label={t('auth.mosque')}>
              <div className="j-muted text-sm" dir="ltr">
                {window.location.hostname}
              </div>
            </Field>
          ) : (
            <Field label={t('auth.mosque')} error={errors.tenantSlug}>
              <TextInput value={tenantSlug} onChange={(e) => setSlug(e.target.value)} dir="ltr" placeholder="my-mosque" />
            </Field>
          )}
          {error && (
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(229,72,77,0.12)', color: 'var(--j-danger)' }}>
              {error}
            </div>
          )}
          <Button type="submit" variant="primary" disabled={busy} className="mt-2">
            {busy ? <Spinner /> : t('auth.login')}
          </Button>
          <Link to="/forgot" className="j-muted mt-2 text-center text-sm underline">
            {t('auth.forgot')}
          </Link>
        </div>
      </form>
    </div>
  );
}
