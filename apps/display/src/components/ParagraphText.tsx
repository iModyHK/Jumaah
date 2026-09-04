import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { LiveParagraph, ParagraphKind } from '@jumaah/shared';
import { getLanguage } from '@jumaah/shared';
import { LangText } from '@jumaah/ui';
import { phrase } from '../phrases';

/** Shrink factor by text length so long paragraphs start at a sensible size before the fit pass. */
export function lengthFactor(len: number): number {
  if (len <= 60) return 1;
  if (len <= 120) return 0.88;
  if (len <= 200) return 0.76;
  if (len <= 320) return 0.64;
  if (len <= 480) return 0.54;
  if (len <= 700) return 0.46;
  return 0.4;
}

/** Resolve what a panel should show for one language. */
export type PanelContent =
  | { kind: 'text'; text: string; paragraphKind: ParagraphKind; reference: string | null; id: string }
  | { kind: 'pending'; text: string; id: string }
  | { kind: 'phrase'; text: string; id: string }
  | { kind: 'empty' };

export function contentFor(lang: string, paragraph: LiveParagraph | null, state: string): PanelContent {
  if (state === 'IMPROV') return { kind: 'phrase', text: phrase('imamSpeaking', lang), id: 'improv' };
  if (!paragraph) return { kind: 'empty' };
  if (lang === 'ar') return { kind: 'text', text: paragraph.textAr, paragraphKind: paragraph.kind, reference: paragraph.reference, id: paragraph.id };
  const tr = paragraph.translations[lang];
  if (tr && tr.status === 'APPROVED' && tr.text.trim()) return { kind: 'text', text: tr.text, paragraphKind: paragraph.kind, reference: paragraph.reference, id: paragraph.id };
  return { kind: 'pending', text: phrase('translationPending', lang), id: paragraph.id };
}

/**
 * After layout, shrink the inner block's font-size until it fits inside `outer`.
 * Runs before paint (layout effect) so the viewer never sees the overflow.
 */
export function useFitText(outer: RefObject<HTMLElement | null>, inner: RefObject<HTMLElement | null>, baseSize: string, enabled: boolean, deps: readonly unknown[]): void {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !outer.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(outer.current);
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) setTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [enabled, outer]);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    i.style.fontSize = baseSize;
    if (!enabled) return;
    let scale = 1;
    for (let n = 0; n < 14; n++) {
      const overflow = i.scrollHeight > o.clientHeight + 1 || i.scrollWidth > o.clientWidth + 1;
      if (!overflow) break;
      scale *= 0.9;
      i.style.fontSize = `calc(${baseSize} * ${scale.toFixed(4)})`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSize, enabled, tick, ...deps]);
}

function Marker({ kind, pos, dir }: { kind: ParagraphKind; pos: 'start' | 'end'; dir: 'rtl' | 'ltr' }) {
  if (kind === 'TEXT') return null;
  // Rendered with bidi-override so glyphs are never mirrored; pick the glyph for the visual side explicitly.
  const glyph = kind === 'QURAN' ? (pos === 'start' ? (dir === 'rtl' ? '﴿' : '﴾') : dir === 'rtl' ? '﴾' : '﴿') : pos === 'start' ? (dir === 'rtl' ? '»' : '«') : dir === 'rtl' ? '«' : '»';
  return (
    <span className="j-mark" aria-hidden="true">
      {glyph}
    </span>
  );
}

/** The main translated text of a panel (current paragraph), including Quran/Hadith markers + reference. */
export function ParagraphBody({ lang, content, className = '' }: { lang: string; content: PanelContent; className?: string }) {
  const dir = getLanguage(lang).dir;
  if (content.kind === 'empty') return null;
  if (content.kind === 'text') {
    return (
      <LangText lang={lang} className={`j-text ${className}`}>
        <Marker kind={content.paragraphKind} pos="start" dir={dir} />
        {content.text}
        <Marker kind={content.paragraphKind} pos="end" dir={dir} />
        {content.reference && content.paragraphKind !== 'TEXT' && (
          <div className="j-ref" dir="auto">
            {content.reference}
          </div>
        )}
      </LangText>
    );
  }
  return (
    <LangText lang={lang} className={`j-text ${className}`} style={content.kind === 'phrase' ? { fontWeight: 600 } : undefined}>
      <span data-pending={content.kind === 'pending'} className="j-text" style={{ fontSize: content.kind === 'pending' ? '0.75em' : undefined }}>
        {content.text}
      </span>
    </LangText>
  );
}

/** Renders `content` sized to fit `baseSize` inside its flex parent, fading in whenever the paragraph changes. */
export function FittedText({ lang, content, baseSize, fit, className = '' }: { lang: string; content: PanelContent; baseSize: string; fit: boolean; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const id = content.kind === 'empty' ? '' : content.id;
  const text = content.kind === 'empty' ? '' : content.text;
  useFitText(outer, inner, baseSize, fit, [id, text, lang]);
  return (
    <div ref={outer} className={`j-panel-body ${className}`}>
      <div ref={inner} key={`${id}:${content.kind}`} className="j-fade-in">
        <ParagraphBody lang={lang} content={content} />
      </div>
    </div>
  );
}
