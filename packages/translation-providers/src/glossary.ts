import type { GlossaryEntry } from './types.js';

/** Entries applicable to a target language ('*' or exact match). Longest terms first to avoid partial matches. */
export function applicableGlossary(entries: GlossaryEntry[] | undefined, targetLang: string): GlossaryEntry[] {
  return (entries ?? [])
    .filter((e) => e.lang === '*' || e.lang === targetLang)
    .sort((a, b) => b.term.length - a.term.length);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Tashkeel-insensitive matcher for an Arabic term. */
export function termRegex(term: string): RegExp {
  const stripped = term.replace(/[ً-ْٰـ]/g, '');
  const pattern = Array.from(stripped)
    .map((ch) => (ch === ' ' ? '\\s+' : `${escapeRegExp(ch)}[ً-ْٰـ]*`))
    .join('');
  return new RegExp(pattern, 'g');
}

export interface ProtectedText {
  text: string;
  placeholders: Map<string, string>;
}

/**
 * For machine-translation engines (Google, DeepL, LibreTranslate) that cannot follow instructions:
 * replace KEEP / REPLACE terms with numeric placeholders before sending, then restore after.
 */
export function protectTerms(text: string, entries: GlossaryEntry[]): ProtectedText {
  const placeholders = new Map<string, string>();
  let out = text;
  let n = 0;
  for (const e of entries) {
    if (e.mode === 'HINT') continue;
    const target = e.mode === 'REPLACE' ? (e.replacement ?? e.term) : (e.replacement ?? e.term);
    const rx = termRegex(e.term);
    if (!rx.test(out)) continue;
    n += 1;
    const token = `[[${n}]]`;
    placeholders.set(token, target);
    out = out.replace(termRegex(e.term), ` ${token} `).replace(/\s{2,}/g, ' ').trim();
  }
  return { text: out, placeholders };
}

export function restoreTerms(text: string, placeholders: Map<string, string>): string {
  let out = text;
  for (const [token, value] of placeholders) {
    const n = token.replace(/\D/g, '');
    // Engines sometimes add spaces or change brackets: [[ 1 ]], [ [1] ], 【1】
    const rx = new RegExp(`[\\[【]\\s*[\\[【]?\\s*${n}\\s*[\\]】]?\\s*[\\]】]`, 'g');
    out = out.replace(rx, value);
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** Human-readable glossary block for LLM prompts. */
export function glossaryInstructions(entries: GlossaryEntry[], targetLang: string): string {
  if (entries.length === 0) return '';
  const lines = entries.map((e) => {
    switch (e.mode) {
      case 'KEEP':
        return `- "${e.term}": keep untranslated${e.replacement ? ` (write it as "${e.replacement}")` : ' (transliterate)'}${e.note ? ` — ${e.note}` : ''}`;
      case 'REPLACE':
        return `- "${e.term}": always render as "${e.replacement ?? e.term}"${e.note ? ` — ${e.note}` : ''}`;
      case 'HINT':
        return `- "${e.term}": ${e.replacement ?? ''}${e.note ? ` — ${e.note}` : ''}`.trim();
    }
  });
  return `Glossary for ${targetLang} (mandatory):\n${lines.join('\n')}`;
}

/** Stable hash input for cache keys: only entries that affect output. */
export function glossaryFingerprint(entries: GlossaryEntry[]): string {
  return entries
    .map((e) => `${e.mode}|${e.term}|${e.lang}|${e.replacement ?? ''}`)
    .sort()
    .join('\n');
}
