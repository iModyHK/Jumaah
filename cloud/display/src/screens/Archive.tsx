import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguage, type LiveParagraph, type SectionType } from '@jumaah/core';
import { type ArchiveKhutbahDto, type ArchiveListDto } from '@jumaah/cloud-shared';
import { apiBaseUrl, LangText, useLocalStorage } from '@jumaah/ui';
import { Branded, JumaahMark } from '@jumaah/display';
import { CenterMessage } from '@jumaah/display';
import { useTheme } from '@jumaah/display';
import { mobileUrl } from '@jumaah/display';
import { archiveUrl } from '../routes';

type Loaded<T> = T | null | undefined;

function useJson<T>(path: string): Loaded<T> {
  const [data, setData] = useState<Loaded<T>>(undefined);
  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    fetch(`${apiBaseUrl()}/api/public/${path}`, { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return data;
}

function fmtDate(iso: string, locale: 'ar' | 'en'): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso + 'T12:00:00Z'));
  } catch {
    return iso;
  }
}

/**
 * Public archive: /display/a/<slug> lists past khutbahs; /display/a/<slug>/<id> shows one in any of its languages,
 * with a print button (the browser's print dialog gives a clean handout). Paid editions only; the mosque switches
 * it on in settings, and the API answers 404 otherwise.
 */
export function Archive({ slug, khutbahId }: { slug: string; khutbahId: string | null }) {
  useTheme('light');
  return khutbahId ? <ArchiveReader slug={slug} khutbahId={khutbahId} /> : <ArchiveList slug={slug} />;
}

function ArchiveList({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation();
  const data = useJson<ArchiveListDto>(`archive/${encodeURIComponent(slug)}`);
  const locale = data?.tenant.locale;
  useEffect(() => {
    if (locale && i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale, i18n]);

  if (data === undefined) return <CenterMessage spinner>{t('display.connecting')}</CenterMessage>;
  if (!data) return <CenterMessage>{t('errors.NOT_FOUND')}</CenterMessage>;
  const { tenant, items } = data;

  return (
    <Branded branding={tenant.branding} className="j-archive">
      <ArchiveHeader tenant={tenant} slug={slug} />
      <main className="j-archive-body">
        <h2 className="j-archive-h2">{t('display.archive.title')}</h2>
        <p className="j-archive-sub">{t('display.archive.subtitle')}</p>
        {items.length === 0 && <div className="j-archive-empty">{t('display.archive.empty')}</div>}
        <ul className="j-archive-list">
          {items.map((k) => (
            <li key={k.id}>
              <a className="j-archive-item" href={archiveUrl(slug, k.id)}>
                <LangText lang="ar" as="span" className="j-archive-item-title">
                  {k.title}
                </LangText>
                <span className="j-archive-item-meta" dir="auto">
                  {fmtDate(k.gregorianDate, tenant.locale)}
                  {k.hijriDate ? ` · ${k.hijriDate}` : ''}
                  {k.imamName ? ` · ${k.imamName}` : ''}
                </span>
                <span className="j-archive-item-langs" dir="ltr">
                  {k.languages.map((l) => getLanguage(l).nativeName).join(' · ')}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </Branded>
  );
}

function ArchiveReader({ slug, khutbahId }: { slug: string; khutbahId: string }) {
  const { t, i18n } = useTranslation();
  const data = useJson<ArchiveKhutbahDto>(`archive/${encodeURIComponent(slug)}/${encodeURIComponent(khutbahId)}`);
  const [prefs, setPrefs] = useLocalStorage<{ langs: string[]; arabic: boolean }>(`jumaah.archive.prefs.${slug}`, { langs: [], arabic: true });
  const locale = data?.tenant.locale;
  useEffect(() => {
    if (locale && i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale, i18n]);

  const available = useMemo(() => data?.khutbah.targetLanguages ?? [], [data]);
  const selected = useMemo(() => {
    const kept = prefs.langs.filter((l) => available.includes(l));
    if (kept.length) return kept;
    const guess = navigator.languages?.map((l) => l.split('-')[0]).find((l) => available.includes(l));
    return guess ? [guess] : available.slice(0, 1);
  }, [prefs.langs, available]);

  if (data === undefined) return <CenterMessage spinner>{t('display.connecting')}</CenterMessage>;
  if (!data) return <CenterMessage>{t('errors.NOT_FOUND')}</CenterMessage>;
  const { tenant, khutbah } = data;
  const showArabic = prefs.arabic || selected.length === 0;
  const toggle = (l: string) => {
    const next = selected.includes(l) ? selected.filter((x) => x !== l) : [...selected, l];
    if (next.length === 0 && !prefs.arabic) return;
    setPrefs((p) => ({ ...p, langs: next }));
  };
  const sections: SectionType[] = ['FIRST', 'SECOND', 'DUA'];

  return (
    <Branded branding={tenant.branding} className="j-archive">
      <ArchiveHeader tenant={tenant} slug={slug} back />
      <div className="j-archive-tools">
        <div className="j-chips" role="group" aria-label={t('display.chooseLanguage')}>
          <button type="button" className="j-chip" data-on={showArabic} onClick={() => setPrefs((p) => ({ ...p, arabic: !p.arabic }))} lang="ar" dir="rtl" style={{ fontFamily: getLanguage('ar').fontFamily }}>
            {getLanguage('ar').nativeName}
          </button>
          {available.map((l) => (
            <button key={l} type="button" className="j-chip" data-on={selected.includes(l)} onClick={() => toggle(l)} lang={l} dir={getLanguage(l).dir} style={{ fontFamily: getLanguage(l).fontFamily }}>
              {getLanguage(l).nativeName}
            </button>
          ))}
        </div>
        <button type="button" className="j-archive-btn" onClick={() => window.print()}>
          {t('display.archive.print')}
        </button>
      </div>
      <main className="j-archive-body j-archive-paper">
        <header className="j-archive-khutbah-head">
          <LangText lang="ar" as="h1" className="j-archive-h1">
            {khutbah.title}
          </LangText>
          <div className="j-archive-item-meta" dir="auto">
            {tenant.name} · {fmtDate(khutbah.gregorianDate, tenant.locale)}
            {khutbah.hijriDate ? ` · ${khutbah.hijriDate}` : ''}
            {khutbah.imamName ? ` · ${khutbah.imamName}` : ''}
          </div>
        </header>
        {sections.map((type) => {
          const paras = khutbah.paragraphs.filter((p) => p.sectionType === type);
          if (!paras.length) return null;
          return (
            <section key={type} className="j-archive-section">
              <h3 className="j-archive-h3">
                <LangText lang="ar" as="span">
                  {t(`display.archive.sections.${type}`, { lng: 'ar' })}
                </LangText>
                {tenant.locale !== 'ar' || selected.length ? <span className="j-archive-h3-en"> · {t(`display.archive.sections.${type}`, { lng: 'en' })}</span> : null}
              </h3>
              {paras.map((p) => (
                <ArchiveParagraph key={p.id} p={p} langs={selected} showArabic={showArabic} pendingText={t('display.archive.pending')} />
              ))}
            </section>
          );
        })}
      </main>
    </Branded>
  );
}

function ArchiveParagraph({ p, langs, showArabic, pendingText }: { p: LiveParagraph; langs: string[]; showArabic: boolean; pendingText: string }) {
  const marks = p.kind === 'QURAN' ? ['﴿', '﴾'] : p.kind === 'HADITH' ? ['«', '»'] : null;
  return (
    <div className="j-archive-para" data-kind={p.kind}>
      {showArabic && (
        <LangText lang="ar" as="p" className="j-archive-ar">
          {marks ? marks[0] : ''}
          {p.textAr}
          {marks ? marks[1] : ''}
          {p.reference && marks ? <span className="j-archive-ref"> [{p.reference}]</span> : null}
        </LangText>
      )}
      {langs.map((l) => {
        const tr = p.translations[l];
        const text = tr && tr.status === 'APPROVED' && tr.text.trim() ? tr.text : null;
        return (
          <LangText key={l} lang={l} as="p" className={`j-archive-tr${text ? '' : ' j-archive-pending'}`}>
            {text ?? pendingText}
          </LangText>
        );
      })}
    </div>
  );
}

function ArchiveHeader({ tenant, slug, back = false }: { tenant: ArchiveListDto['tenant']; slug: string; back?: boolean }) {
  const { t } = useTranslation();
  return (
    <header className="j-archive-header">
      <a className="j-archive-brand" href={archiveUrl(slug)}>
        {tenant.branding.logoUrl && <img src={tenant.branding.logoUrl} alt="" className="j-archive-logo" draggable={false} />}
        <LangText lang={tenant.locale} as="span" className="j-archive-name">
          {tenant.name}
        </LangText>
      </a>
      <nav className="j-archive-nav">
        {back && (
          <a className="j-archive-link" href={archiveUrl(slug)}>
            {t('display.archive.back')}
          </a>
        )}
        <a className="j-archive-link" href={mobileUrl(slug)}>
          {t('display.archive.live')}
        </a>
        <JumaahMark branding={tenant.branding} />
      </nav>
    </header>
  );
}
