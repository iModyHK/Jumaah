import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TenantPublicInfo } from '@jumaah/shared';
import { apiBaseUrl, LangText } from '@jumaah/ui';
import { Branded, JumaahMark } from '../components/Branding';
import { QrCode } from '../components/QrCode';
import { CenterMessage } from '../components/Overlays';

/**
 * Printable QR poster: /display/poster/<slug>?size=A4|A3
 * Public page. The admin opens it and prints (or saves as PDF) from the browser, so the mosque's fonts, logo and
 * colours come out exactly as on the phone page. Both Arabic and English are always shown.
 */
export function Poster({ slug, size }: { slug: string; size: 'A4' | 'A3' }) {
  const { t } = useTranslation();
  const [tenant, setTenant] = useState<TenantPublicInfo | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBaseUrl()}/api/public/tenant/${encodeURIComponent(slug)}`, { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tenant: TenantPublicInfo } | null) => {
        if (!cancelled) setTenant(data?.tenant ?? null);
      })
      .catch(() => {
        if (!cancelled) setTenant(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.classList.add('j-print');
    return () => document.documentElement.classList.remove('j-print');
  }, []);

  if (tenant === undefined) return <CenterMessage spinner>{t('display.connecting')}</CenterMessage>;
  if (!tenant) return <CenterMessage>{t('errors.NOT_FOUND')}</CenterMessage>;

  const url = `${window.location.origin}/display/m/${encodeURIComponent(slug)}`;
  const shown = url.replace(/^https?:\/\//, '');
  const steps = ['scan', 'pick', 'follow'] as const;

  return (
    <Branded branding={tenant.branding} className={`j-poster j-poster-${size.toLowerCase()}`}>
      <div className="j-poster-toolbar">
        <button type="button" className="j-poster-btn" onClick={() => window.print()}>
          {t('display.poster.print')}
        </button>
        <a className="j-poster-btn j-poster-btn-ghost" href={`?size=${size === 'A4' ? 'A3' : 'A4'}`}>
          {size === 'A4' ? 'A3' : 'A4'}
        </a>
      </div>
      <div className="j-poster-page">
        <header className="j-poster-head">
          {tenant.branding.logoUrl && <img src={tenant.branding.logoUrl} alt="" className="j-poster-logo" />}
          <LangText lang={tenant.locale} as="h1" className="j-poster-name">
            {tenant.name}
          </LangText>
        </header>
        <div className="j-poster-title">
          <LangText lang="ar" as="div" className="j-poster-title-ar">
            {t('display.poster.title', { lng: 'ar' })}
          </LangText>
          <LangText lang="en" as="div" className="j-poster-title-en">
            {t('display.poster.title', { lng: 'en' })}
          </LangText>
        </div>
        <div className="j-poster-qr">
          <QrCode value={url} className="j-poster-qr-img" />
          <div className="j-poster-url" dir="ltr">
            {shown}
          </div>
        </div>
        <ol className="j-poster-steps">
          {steps.map((s, i) => (
            <li key={s}>
              <span className="j-poster-step-n">{i + 1}</span>
              <span className="j-poster-step-text">
                <LangText lang="ar" as="span">
                  {t(`display.poster.${s}`, { lng: 'ar' })}
                </LangText>
                <LangText lang="en" as="span" className="j-poster-step-en">
                  {t(`display.poster.${s}`, { lng: 'en' })}
                </LangText>
              </span>
            </li>
          ))}
        </ol>
        <footer className="j-poster-foot">
          <LangText lang="ar" as="span">
            {t('display.poster.noApp', { lng: 'ar' })}
          </LangText>
          <LangText lang="en" as="span" className="j-poster-step-en">
            {t('display.poster.noApp', { lng: 'en' })}
          </LangText>
          <JumaahMark branding={tenant.branding} className="j-poster-mark" />
        </footer>
      </div>
    </Branded>
  );
}
