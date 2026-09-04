import { describe, expect, it } from 'vitest';
import { applicableGlossary, glossaryInstructions, protectTerms, restoreTerms, termRegex } from './glossary.js';
import { parseItemsJson } from './llm-prompt.js';
import { cacheKey } from './cache.js';
import type { GlossaryEntry } from './types.js';

const glossary: GlossaryEntry[] = [
  { term: 'الله', lang: '*', mode: 'KEEP', replacement: 'Allah' },
  { term: 'صلى الله عليه وسلم', lang: 'en', mode: 'REPLACE', replacement: 'peace be upon him' },
  { term: 'زكاة', lang: 'ur', mode: 'REPLACE', replacement: 'زکوٰۃ' },
  { term: 'تقوى', lang: 'en', mode: 'HINT', replacement: 'taqwa' },
];

describe('applicableGlossary', () => {
  it('filters by language and sorts longest-first', () => {
    const en = applicableGlossary(glossary, 'en');
    expect(en.map((e) => e.term)).toEqual(['صلى الله عليه وسلم', 'الله', 'تقوى']);
    expect(applicableGlossary(glossary, 'ur').map((e) => e.term)).toEqual(['الله', 'زكاة']);
  });
});

describe('termRegex', () => {
  it('matches with or without tashkeel', () => {
    expect(termRegex('الله').test('الحَمْدُ لِلَّهِ')).toBe(false);
    expect(termRegex('الله').test('قال اللَّهُ تعالى')).toBe(true);
  });
});

describe('protectTerms / restoreTerms', () => {
  it('replaces KEEP/REPLACE terms with placeholders and restores them', () => {
    const p = protectTerms('قال رسول الله صلى الله عليه وسلم: اتقوا الله', applicableGlossary(glossary, 'en'));
    expect(p.text).not.toContain('صلى الله عليه وسلم');
    expect(p.placeholders.size).toBe(2);
    const machineOutput = p.text.replace('قال رسول', 'The Messenger of').replace(': اتقوا', ': fear');
    const restored = restoreTerms(machineOutput, p.placeholders);
    expect(restored).toContain('peace be upon him');
    expect(restored).toContain('Allah');
    expect(restored).not.toMatch(/\[\[\d\]\]/);
  });

  it('tolerates engines that mangle brackets', () => {
    const ph = new Map([['[[1]]', 'Allah']]);
    expect(restoreTerms('Praise [[ 1 ]] always', ph)).toBe('Praise Allah always');
    expect(restoreTerms('Praise 【1】 always', ph)).toBe('Praise Allah always');
  });

  it('ignores HINT entries', () => {
    const p = protectTerms('التقوى خير زاد', applicableGlossary(glossary, 'en'));
    expect(p.placeholders.size).toBe(0);
  });
});

describe('glossaryInstructions', () => {
  it('renders one line per entry', () => {
    const txt = glossaryInstructions(applicableGlossary(glossary, 'en'), 'en');
    expect(txt).toContain('keep untranslated');
    expect(txt).toContain('always render as "peace be upon him"');
    expect(txt).toContain('taqwa');
  });
});

describe('parseItemsJson', () => {
  it('parses object, array, and fenced responses', () => {
    expect(parseItemsJson('{"items":[{"id":"a","text":"x"}]}')).toEqual([{ id: 'a', text: 'x' }]);
    expect(parseItemsJson('[{"id":"a","text":"x"}]')).toEqual([{ id: 'a', text: 'x' }]);
    expect(parseItemsJson('Sure:\n```json\n{"items":[{"id":1,"text":"y"}]}\n```')).toEqual([{ id: '1', text: 'y' }]);
  });
  it('throws on garbage', () => {
    expect(() => parseItemsJson('nope')).toThrow();
  });
});

describe('cacheKey', () => {
  it('is stable across tashkeel and glossary order, and differs by lang/provider', () => {
    const a = cacheKey({ text: 'الحَمْدُ لله', targetLang: 'en', providerType: 'ANTHROPIC', glossary: [glossary[0], glossary[1]] });
    const b = cacheKey({ text: 'الحمد لله', targetLang: 'en', providerType: 'ANTHROPIC', glossary: [glossary[1], glossary[0]] });
    expect(a.key).toBe(b.key);
    expect(cacheKey({ text: 'الحمد لله', targetLang: 'ur', providerType: 'ANTHROPIC', glossary: [] }).key).not.toBe(a.key);
    expect(cacheKey({ text: 'الحمد لله', targetLang: 'en', providerType: 'GOOGLE', glossary: [] }).key).not.toBe(a.key);
  });
});
