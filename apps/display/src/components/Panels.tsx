import type { DisplayLayout, LiveParagraph, SessionState } from '@jumaah/shared';
import { getLanguage } from '@jumaah/shared';
import { LangText } from '@jumaah/ui';
import { contentFor, FittedText, lengthFactor, ParagraphBody } from './ParagraphText';

export type PanelLayout = DisplayLayout | 'column';
export type RenderMode = 'wall' | 'mobile';

export interface PanelsProps {
  languages: string[];
  layout: PanelLayout;
  fontScale: number;
  showPrevious: boolean;
  showArabic: boolean;
  state: SessionState;
  current: LiveParagraph | null;
  previous: LiveParagraph | null;
  mode: RenderMode;
}

/** Downgrade a layout when there are fewer languages than it needs. */
export function effectiveLayout(layout: DisplayLayout, count: number): DisplayLayout {
  if (count <= 1) return 'single';
  if (layout === 'grid' && count === 2) return 'split';
  return layout;
}

function wallBase(layout: PanelLayout, factor: number): string {
  const base = layout === 'single' ? 'min(6.2cqi, 15cqh)' : layout === 'split' ? 'min(8cqi, 15cqh)' : 'min(8.5cqi, 17cqh)';
  return `calc(${base} * ${factor.toFixed(3)})`;
}

function mobileBase(factor: number): string {
  return `calc(clamp(1.15rem, 5.4vw, 1.9rem) * ${Math.max(factor, 0.75).toFixed(3)})`;
}

export function Panels({ languages, layout, fontScale, showPrevious, showArabic, state, current, previous, mode }: PanelsProps) {
  const langs = layout === 'single' ? languages.slice(0, 1) : layout === 'split' ? languages.slice(0, 2) : layout === 'grid' ? languages.slice(0, 4) : languages;
  return (
    <div className="j-stage">
      {showArabic && <ArabicStrip state={state} current={current} fontScale={fontScale} mode={mode} />}
      <div className="j-panels" data-layout={layout} data-count={langs.length}>
        {langs.map((lang) => (
          <LangPanel key={lang} lang={lang} layout={layout} fontScale={fontScale} showPrevious={showPrevious} state={state} current={current} previous={previous} mode={mode} />
        ))}
      </div>
    </div>
  );
}

function LangPanel({ lang, layout, fontScale, showPrevious, state, current, previous, mode }: { lang: string } & Omit<PanelsProps, 'languages' | 'showArabic'>) {
  const info = getLanguage(lang);
  const content = contentFor(lang, current, state);
  const prev = showPrevious && state !== 'IMPROV' && previous ? contentFor(lang, previous, state) : null;
  const len = content.kind === 'empty' ? 0 : content.text.length;
  const factor = (content.kind === 'text' ? lengthFactor(len) : 0.8) * fontScale;
  const base = mode === 'wall' ? wallBase(layout, factor) : mobileBase(factor);
  const prevSize = mode === 'wall' ? `calc(${base} * 0.5)` : `calc(${base} * 0.72)`;
  return (
    <section className="j-panel" data-mode={mode} lang={lang} dir={info.dir}>
      <header className="j-panel-head">
        <span className="j-dot" />
        <LangText lang={lang} as="span" style={{ fontWeight: 600, lineHeight: 1.3 }}>
          {info.nativeName}
        </LangText>
        {info.nativeName !== info.name && (
          <span style={{ opacity: 0.6, fontSize: '0.8em', fontFamily: 'var(--j-font-latin)' }} dir="ltr">
            {info.name}
          </span>
        )}
      </header>
      {prev && prev.kind !== 'empty' && (
        <div className="j-panel-prev" style={{ fontSize: prevSize }}>
          <ParagraphBody lang={lang} content={prev} className={`j-clamp ${layout === 'grid' ? 'j-clamp-2' : 'j-clamp-3'}`} />
        </div>
      )}
      <FittedText lang={lang} content={content} baseSize={base} fit={mode === 'wall'} />
    </section>
  );
}

function ArabicStrip({ state, current, fontScale, mode }: { state: SessionState; current: LiveParagraph | null; fontScale: number; mode: RenderMode }) {
  const content = contentFor('ar', current, state);
  const len = content.kind === 'empty' ? 0 : content.text.length;
  const factor = (content.kind === 'text' ? lengthFactor(len) : 0.8) * fontScale;
  const base = mode === 'wall' ? `calc(min(4.2cqi, 34cqh) * ${factor.toFixed(3)})` : mobileBase(factor * 0.95);
  return (
    <div className="j-arabic-strip" data-mode={mode} lang="ar" dir="rtl">
      <header className="j-panel-head" style={{ fontSize: mode === 'wall' ? 'min(1.6cqi, 12cqh)' : '0.85rem' }}>
        <span className="j-dot" />
        <span style={{ fontWeight: 600 }}>{getLanguage('ar').nativeName}</span>
      </header>
      <FittedText lang="ar" content={content} baseSize={base} fit={mode === 'wall'} />
    </div>
  );
}
