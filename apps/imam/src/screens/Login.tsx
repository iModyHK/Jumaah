import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiRequestError, Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { store } from '../state/store';
import { LocaleToggle } from '../components/LocaleToggle';

export function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(email.trim(), password, slug.trim() || undefined);
      store.setState({ screen: 'pick' });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.status === 401 ? t('auth.invalidCredentials') : err.status === 0 ? t('errors.NETWORK') : err.message);
      } else {
        setError(t('common.error'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center p-6" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
      <div className="j-card j-fade-in w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <div className="text-3xl font-extrabold">{t('app.name')}</div>
            <div className="text-lg" style={{ color: 'var(--j-fg-muted)' }}>
              {t('imam.title')}
            </div>
          </div>
          <img src="/imam/icons/icon.svg" alt="" className="h-14 w-14 rounded-xl" />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">{t('common.email')}</span>
            <input className="j-input min-h-14 text-lg" type="email" inputMode="email" autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">{t('common.password')}</span>
            <input className="j-input min-h-14 text-lg" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">{t('auth.mosque')}</span>
            <input className="j-input min-h-14 text-lg" type="text" autoComplete="organization" dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mosque-slug" />
          </label>

          {error && (
            <div className="rounded-xl px-4 py-3 font-semibold" style={{ background: 'rgba(229,72,77,0.15)', color: '#ff8a8e' }} role="alert">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" className="min-h-16 text-xl" disabled={busy || !email || !password}>
            {busy ? <Spinner /> : t('auth.login')}
          </Button>
        </form>

        <div className="mt-6 flex justify-center">
          <LocaleToggle />
        </div>
      </div>
    </div>
  );
}
