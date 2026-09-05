import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getLanguage, type HandoutDto, type LiveParagraph, type SectionType } from '@jumaah/shared';
import { Button, EmptyState, LangText, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { Checkbox, Select } from '../components/Field';
import { errorMessage } from '../lib/errors';
import { fmtDate } from '../lib/format';

const SECTIONS: SectionType[] = ['FIRST', 'SECOND', 'DUA'];

/**
 * Printable handout: /admin/khutbahs/<id>/handout (paid editions). Opens outside the admin shell, forced light, one
 * language at a time with the Arabic beside it if wanted; the browser's print dialog produces the PDF or paper copy.
 */
export function HandoutPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['khutbah', id, 'handout'], queryFn: () => api.get<HandoutDto>(`/khutbahs/${id}/handout`), enabled: !!id, retry: false });
  const [lang, setLang] = useState('');
  const [arabic, setArabic] = useState(true);
  const [size, setSize] = useState(1);

  useEffect(() => {
    const prev = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = 'light';
    document.documentElement.classList.add('j-print');
    return () => {
      document.documentElement.classList.remove('j-print');
      if (prev) document.documentElement.dataset.theme = prev;
      else delete document.documentElement.dataset.theme;
    };
  }, []);

  const langs = q.data?.khutbah.targetLanguages ?? [];
  const current = lang && langs.includes(lang) ? lang : (langs[0] ?? '');
  const missing = useMemo(() => (current && q.data ? q.data.khutbah.paragraphs.filter((p) => !approved(p, current)).length : 0), [q.data, current]);

  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <EmptyState title={t('handout.title')} hint={q.error ? errorMessage(q.error) : undefined} />;
  const { tenant, khutbah } = q.data;
  const dir = current ? getLanguage(current).dir : 'rtl';

  return (
    <div className="j-handout" style={{ fontSize: `${size}rem` }}>
      <div className="j-handout-tools" dir="auto">
        {langs.length > 0 && (
          <Select value={current} onChange={(e) => setLang(e.target.value)} aria-label={t('handout.language')}>
            {langs.map((l) => (
              <option key={l} value={l}>
                {getLanguage(l).nativeName}
              </option>
            ))}
          </Select>
        )}
        <Checkbox label={t('handout.includeArabic')} checked={arabic || !current} disabled={!current} onChange={setArabic} />
        <span className="inline-flex items-center gap-1" dir="ltr">
          <Button className="!px-3 !py-1" onClick={() => setSize((s) => Math.max(0.7, +(s - 0.1).toFixed(2)))} aria-label="smaller">
            A−
          </Button>
          <Button className="!px-3 !py-1" onClick={() => setSize((s) => Math.min(1.6, +(s + 0.1).toFixed(2)))} aria-label="larger">
            A+
          </Button>
        </span>
        <Button variant="primary" onClick={() => window.print()}>
          {t('handout.print')}
        </Button>
        {missing > 0 && current && <span className="j-muted text-sm">{t('handout.untranslated', { count: missing })}</span>}
      </div>
      <article className="j-handout-page" dir={dir}>
        <header className="j-handout-head">
          {tenant.logoUrl && <img src={tenant.logoUrl} alt="" className="j-handout-logo" />}
          <div className="min-w-0">
            <LangText lang={tenant.locale} as="div" className="j-handout-mosque">
              {tenant.name}
            </LangText>
            <LangText lang="ar" as="h1" className="j-handout-title">
              {khutbah.title}
            </LangText>
            <div className="j-handout-meta" dir="auto">
              {fmtDate(khutbah.gregorianDate)}
              {khutbah.hijriDate ? ` · ${khutbah.hijriDate}` : ''}
              {khutbah.imamName ? ` · ${khutbah.imamName}` : ''}
            </div>
          </div>
        </header>
        {SECTIONS.map((type) => {
          const paras = khutbah.paragraphs.filter((p) => p.sectionType === type);
          if (!paras.length) return null;
          return (
            <section key={type} className="j-handout-section">
              <h2 className="j-handout-h2">{t(`khutbah.sections.${type}`)}</h2>
              {paras.map((p) => (
                <HandoutParagraph key={p.id} p={p} lang={current} arabic={arabic || !current} pending={t('handout.pending')} />
              ))}
            </section>
          );
        })}
        <footer className="j-handout-foot" dir="auto">
          {tenant.name}
        </footer>
      </article>
    </div>
  );
}

function approved(p: LiveParagraph, lang: string): string | null {
  const tr = p.translations[lang];
  return tr && tr.status === 'APPROVED' && tr.text.trim() ? tr.text : null;
}

function HandoutParagraph({ p, lang, arabic, pending }: { p: LiveParagraph; lang: string; arabic: boolean; pending: string }) {
  const marks = p.kind === 'QURAN' ? ['﴿', '﴾'] : p.kind === 'HADITH' ? ['«', '»'] : null;
  const text = lang ? approved(p, lang) : null;
  return (
    <div className="j-handout-para" data-kind={p.kind}>
      {arabic && (
        <LangText lang="ar" as="p" className="j-handout-ar">
          {marks ? marks[0] : ''}
          {p.textAr}
          {marks ? marks[1] : ''}
          {p.reference && marks ? <span className="j-handout-ref"> [{p.reference}]</span> : null}
        </LangText>
      )}
      {lang && (
        <LangText lang={lang} as="p" className={`j-handout-tr${text ? '' : ' j-handout-pending'}`}>
          {text ?? pending}
        </LangText>
      )}
    </div>
  );
}
