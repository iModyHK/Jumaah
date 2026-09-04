import { useTranslation } from 'react-i18next';
import { LangText } from '@jumaah/ui';
import type { LiveParagraph } from '@jumaah/shared';

export const KIND_COLOR: Record<LiveParagraph['kind'], string | undefined> = {
  TEXT: undefined,
  QURAN: '#e8b84a',
  HADITH: '#7cc4ff',
};

/** Previous (faint) / current (huge) / next (faded) paragraphs. Font size in rem is the imam's setting. */
export function ParagraphView({ prev, current, next, fontRem }: { prev?: LiveParagraph; current?: LiveParagraph; next?: LiveParagraph; fontRem: number }) {
  const { t } = useTranslation();
  const accent = current ? KIND_COLOR[current.kind] : undefined;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 py-2 sm:px-8">
      <div className="shrink-0" style={{ minHeight: `${fontRem * 0.5 * 1.9 * 2}rem` }}>
        {prev && (
          <LangText lang="ar" className="line-clamp-2" style={{ fontSize: `${fontRem * 0.5}rem`, color: 'var(--j-fg-muted)', opacity: 0.6 }}>
            {prev.textAr}
          </LangText>
        )}
      </div>

      <div key={current?.id} className="j-fade-in min-h-0 flex-1 overflow-y-auto">
        {current && current.kind !== 'TEXT' && (
          <div className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: accent }}>
            <span className="rounded-full px-3 py-0.5" style={{ border: `1px solid ${accent}`, background: 'var(--j-bg-soft)' }}>
              {t(`khutbah.kinds.${current.kind}`)}
            </span>
            {current.reference && <span className="opacity-80">{current.reference}</span>}
          </div>
        )}
        <LangText lang="ar" className="font-bold" style={{ fontSize: `${fontRem}rem`, color: accent ?? 'var(--j-fg)' }}>
          {current?.textAr ?? ''}
        </LangText>
      </div>

      <div className="shrink-0" style={{ minHeight: `${fontRem * 0.62 * 1.9 * 2}rem` }}>
        {next && (
          <LangText lang="ar" className="line-clamp-3" style={{ fontSize: `${fontRem * 0.62}rem`, color: 'var(--j-fg-muted)', opacity: 0.85 }}>
            {next.textAr}
          </LangText>
        )}
      </div>
    </div>
  );
}
