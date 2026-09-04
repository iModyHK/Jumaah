import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { acceptInviteSchema, type AuthResponse, type Role } from '@jumaah/shared';
import { Button, EmptyState, Spinner, currentLocale, setLocale } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Field, TextInput } from '../components/Field';
import { validate } from '../lib/forms';
import { errorMessage } from '../lib/errors';

interface InviteInfo {
  email: string;
  name: string | null;
  role: Role;
  tenant: { name: string; slug: string };
}

export function InvitePage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { acceptAuth } = useAuth();
  const info = useQuery({ queryKey: ['invite', token], queryFn: () => api.get<InviteInfo>(`/auth/invite/${token}`), retry: false });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locale = currentLocale();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validate(acceptInviteSchema, { token, name: name.trim() || info.data?.name || '', password });
    setErrors(v.errors);
    if (!v.ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<AuthResponse>('/auth/accept-invite', v.data);
      acceptAuth(res);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {info.isLoading && (
          <div className="flex justify-center">
            <Spinner />
          </div>
        )}
        {info.isError && <EmptyState title={t('errors.NOT_FOUND')} hint={errorMessage(info.error)} />}
        {info.data && (
          <form onSubmit={(e) => void submit(e)} className="j-card j-fade-in p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="text-xl font-bold">{t('auth.acceptInvite')}</div>
                <div className="j-muted text-sm">
                  {info.data.tenant.name} — {t(`roles.${info.data.role}`)}
                </div>
                <div className="j-muted text-xs" dir="ltr">
                  {info.data.email}
                </div>
              </div>
              <Button type="button" className="px-2 py-1 text-xs" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
                {locale === 'ar' ? t('common.english') : t('common.arabic')}
              </Button>
            </div>
            <div className="flex flex-col gap-3">
              <Field label={t('common.name')} error={errors.name}>
                <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={info.data.name ?? ''} required={!info.data.name} />
              </Field>
              <Field label={t('auth.setPassword')} error={errors.password}>
                <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
              </Field>
              {error && (
                <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(229,72,77,0.12)', color: 'var(--j-danger)' }}>
                  {error}
                </div>
              )}
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? <Spinner /> : t('auth.acceptInvite')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
