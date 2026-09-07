import { MIN_PARAGRAPH_SECONDS, WORDS_PER_MINUTE_AR, type ParagraphKind } from './constants.js';

export interface SplitParagraph {
  text: string;
  kind: ParagraphKind;
  reference?: string;
}

const QURAN_MARKERS = [
  /[\u{FD3E}\u{FD3F}]/u, // ornate parentheses ﴾ ﴿
  /^\s*(?:قال|يقول)\s+(?:الله|تعالى|عز وجل|سبحانه)/,
  /\{[^}]+\}/,
];
const HADITH_MARKERS = [
  /(?:قال|يقول)\s+(?:رسول الله|النبي|المصطفى|عليه الصلاة والسلام|صلى الله عليه وسلم)/,
  /رواه\s+(?:البخاري|مسلم|الترمذي|أبو داود|النسائي|ابن ماجه|أحمد|مالك)/,
  /متفق عليه/,
  /صحيح\s+(?:البخاري|مسلم)/,
];
const QURAN_REF = /[\[(]\s*(?:سورة\s+)?([؀-ۿ]+(?:\s+[؀-ۿ]+)?)\s*[:،,]\s*(\d+(?:\s*[-–]\s*\d+)?)\s*[\])]/;

/** Normalize line endings and strip Word/PDF artifacts. */
export function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function detectKind(text: string): { kind: ParagraphKind; reference?: string } {
  if (QURAN_MARKERS.some((r) => r.test(text))) {
    const m = QURAN_REF.exec(text);
    return { kind: 'QURAN', reference: m ? `${m[1]}:${m[2].replace(/\s+/g, '')}` : undefined };
  }
  if (HADITH_MARKERS.some((r) => r.test(text))) {
    const m = /رواه\s+([؀-ۿ ]+?)(?:[.،\s]|$)/.exec(text) ?? /متفق عليه/.exec(text);
    return { kind: 'HADITH', reference: m ? m[0].trim() : undefined };
  }
  return { kind: 'TEXT' };
}

/** Split Arabic text into paragraphs on blank lines. Detects Quran/Hadith blocks. */
export function splitIntoParagraphs(raw: string): SplitParagraph[] {
  const text = normalizeText(raw);
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((p) => ({ text: p, ...detectKind(p) }));
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Estimated seconds an imam needs to read a paragraph aloud. */
export function estimateSeconds(text: string, wpm = WORDS_PER_MINUTE_AR): number {
  const words = countWords(text);
  return Math.max(MIN_PARAGRAPH_SECONDS, Math.round((words / wpm) * 60));
}

/** Arabic-aware normalization used for hashing/cache keys (strips tashkeel & tatweel). */
export function normalizeArabicForHash(text: string): string {
  return text
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** FNV-1a 64-bit hex hash (dependency free, deterministic across runtimes). */
export function fnv1a64(str: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const bytes = new TextEncoder().encode(str);
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

export function paragraphHash(text: string): string {
  return fnv1a64(normalizeArabicForHash(text));
}
