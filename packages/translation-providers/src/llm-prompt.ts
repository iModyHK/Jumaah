import { getLanguage } from '@jumaah/shared';
import { applicableGlossary, glossaryInstructions } from './glossary.js';
import type { TranslateRequest } from './types.js';

/**
 * Shared prompt for instruction-following LLM providers (Claude, OpenAI, Ollama).
 * Stable prefix first (for prompt caching), request-specific parts last.
 */
export function buildSystemPrompt(req: TranslateRequest): string {
  const target = getLanguage(req.targetLang);
  const glossary = applicableGlossary(req.glossary, req.targetLang);
  const parts = [
    `You are a professional translator of Islamic Friday sermons (khutbah) from Arabic into ${target.name} (${target.nativeName}).`,
    `Audience: Muslim worshippers reading a live screen in the mosque while the imam speaks. The text is shown one paragraph at a time, so each paragraph must stand alone and be easy to read at a glance.`,
    '',
    'Rules:',
    `- Translate faithfully and completely; do not summarize, add, or omit content. Preserve the paragraph's sentence order.`,
    `- Use respectful, clear, natural ${target.name} in the register used by Islamic scholars in that language. Prefer terms familiar to ${target.name}-speaking Muslims.`,
    `- Keep well-known Islamic terms in their established ${target.name} form (e.g. Allah, Salah, Zakah, Sunnah, Sahabah) rather than inventing new renderings.`,
    `- Render honorifics consistently: "صلى الله عليه وسلم" as the customary ${target.name} form; "رضي الله عنه" and "رحمه الله" likewise.`,
    `- Quran verses: if a paragraph contains a verse, translate its meaning in a recognized style and keep the reference (surah:ayah) exactly as given. Do not paraphrase loosely.`,
    `- Hadith: translate the meaning precisely and keep the narrator/source attribution (e.g. "Narrated by Al-Bukhari").`,
    `- Do not transliterate whole sentences. Do not add commentary, notes, or explanations. Do not include the Arabic source text.`,
    `- Keep numbers, names and references. Keep punctuation natural for ${target.name}.`,
  ];
  if (glossary.length) parts.push('', glossaryInstructions(glossary, req.targetLang));
  if (req.context?.instructions) parts.push('', `Mosque instructions: ${req.context.instructions}`);
  parts.push(
    '',
    'Input: a JSON array of objects {"id": string, "text": string} where text is Arabic.',
    'Output: ONLY a JSON object {"items": [{"id": string, "text": string}]} with the same ids in the same order, where text is the translation. No markdown, no code fences, no extra keys.',
  );
  return parts.join('\n');
}

export function buildUserMessage(req: TranslateRequest): string {
  const ctx: string[] = [];
  if (req.context?.khutbahTitle) ctx.push(`Khutbah title: ${req.context.khutbahTitle}`);
  if (req.context?.sectionType) ctx.push(`Section: ${req.context.sectionType}`);
  const items = req.items.map((i) => ({ id: i.id, text: i.text }));
  return `${ctx.length ? ctx.join('\n') + '\n\n' : ''}${JSON.stringify(items, null, 0)}`;
}

/** Robustly extract {"items":[...]} or a bare array from an LLM response. */
export function parseItemsJson(raw: string): Array<{ id: string; text: string }> {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  let parsed = tryParse(cleaned);
  if (parsed === undefined) {
    const objStart = cleaned.indexOf('{');
    const arrStart = cleaned.indexOf('[');
    const start = objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) parsed = tryParse(cleaned.slice(start, end + 1));
  }
  const arr = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown })?.items;
  if (!Array.isArray(arr)) throw new Error('Response is not a JSON items array');
  return arr
    .filter((x): x is { id: unknown; text: unknown } => !!x && typeof x === 'object')
    .map((x) => ({ id: String(x.id), text: typeof x.text === 'string' ? x.text : String(x.text ?? '') }));
}
