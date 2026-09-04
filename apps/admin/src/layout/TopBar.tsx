import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { Paginated, TenantDto } from '@jumaah/shared';
import { Button, Spinner, currentLocale, setLocale } from '@jumaah/ui';
import { changePasswordSchema } from '@jumaah/shared';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/Modal';
import { Field, TextInput } from '../components/Field';
import { useToast } from '../components/Toast';
import { useSocketConnected } from '../lib/socket';
import { validate } from '../lib/forms';

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { t, i18n } = useTranslation();
  const { user, isSuper, tenantId, setTenantId, logout, session } = useAuth();
  const navigate = useNavigate();
  const connected = useSocketConnected();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const locale = currentLocale();

  const tenants = useQuery({
    queryKey: ['tenants', 'switcher'],
    queryFn: () => api.get<Paginated<TenantDto>>('/tenants', { pageSize: 200 }),
    enabled: isSuper,
    staleTime: 60_000,
  });

  const toggleLocale = () => {
    const next = locale === 'ar' ? 'en' : 'ar';
    setLocale(next);
    if (session) void api.patch('/auth/locale', { locale: next }).catch(() => undefined);
  };

  const tenantName = user?.tenantName ?? tenants.data?.items.find((x) => x.id === tenantId)?.name ?? null;

  return (
    <header className="flex h-14 items-center gap-3 border-b px-4" style={{ borderColor: 'var(--j-border)', background: 'var(--j-bg-soft)' }}>
      <button type="button" className="j-btn j-btn-ghost px-2 py-1 lg:hidden" onClick={onMenu} aria-label="menu">
        ☰
      </button>
      {isSuper ? (
        <div className="flex items-center gap-2">
          <span className="j-muted hidden text-xs sm:inline">{t('tenants.currentMosque')}</span>
          <select
            className="j-input w-56 py-1 text-sm"
            value={tenantId ?? ''}
            onChange={(e) => {
              setTenantId(e.target.value || null);
              navigate(e.target.value ? '/' : '/tenants');
            }}
          >
            <option value="">{t('tenants.selectMosque')}</option>
            {tenants.data?.items.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ({x.slug})
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="truncate font-semibold">{tenantName}</div>
      )}
      <div className="ms-auto flex items-center gap-2">
        <span className="hidden items-center gap-1 text-xs sm:flex" style={{ color: connected ? 'var(--j-accent)' : 'var(--j-fg-muted)' }} title={connected ? t('imam.connected') : t('imam.reconnecting')}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: connected ? 'var(--j-accent)' : 'var(--j-fg-muted)' }} />
        </span>
        <Button className="px-3 py-1 text-sm" onClick={toggleLocale} title={t('common.language')}>
          {locale === 'ar' ? t('common.english') : t('common.arabic')}
        </Button>
        <div className="relative">
          <Button className="px-3 py-1 text-sm" onClick={() => setMenuOpen((v) => !v)}>
            <span className="max-w-32 truncate">{user?.name}</span>
            <span className="j-muted text-xs">{user ? t(`roles.${user.role}`) : ''}</span>
          </Button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="j-card absolute end-0 z-40 mt-1 w-56 p-1 text-sm shadow-lg">
                <div className="j-muted truncate px-3 py-2 text-xs">{user?.email}</div>
                <button
                  type="button"
                  className="j-nav-link w-full"
                  onClick={() => {
                    setMenuOpen(false);
                    setPwdOpen(true);
                  }}
                >
                  {t('auth.changePassword')}
                </button>
                <button
                  type="button"
                  className="j-nav-link w-full"
                  onClick={() => {
                    setMenuOpen(false);
                    void logout().then(() => navigate('/login'));
                  }}
                >
                  {t('common.logout')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} key={i18n.language} />
    </header>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = validate(changePasswordSchema, { currentPassword, newPassword });
    setErrors(v.errors);
    if (!v.ok) return;
    setBusy(true);
    try {
      await api.post('/auth/change-password', v.data);
      toast.success(t('common.success'));
      setCurrent('');
      setNew('');
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('auth.changePassword')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner /> : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('auth.currentPassword')} error={errors.currentPassword}>
          <TextInput type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label={t('auth.newPassword')} error={errors.newPassword}>
          <TextInput type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
    </Modal>
  );
}
