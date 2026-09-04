import { describe, expect, it } from 'vitest';
import { detectKind, estimateSeconds, paragraphHash, splitIntoParagraphs } from './paragraphs.js';
import { nextFriday, toHijri } from './hijri.js';

describe('splitIntoParagraphs', () => {
  it('splits on blank lines and joins soft line breaks', () => {
    const text = 'الحمد لله رب العالمين\nوالصلاة والسلام على رسول الله\n\n\nأما بعد\r\n\r\nفاتقوا الله';
    const out = splitIntoParagraphs(text);
    expect(out.map((p) => p.text)).toEqual([
      'الحمد لله رب العالمين والصلاة والسلام على رسول الله',
      'أما بعد',
      'فاتقوا الله',
    ]);
    expect(out.every((p) => p.kind === 'TEXT')).toBe(true);
  });

  it('returns empty for empty input', () => {
    expect(splitIntoParagraphs('   \n\n  ')).toEqual([]);
  });

  it('detects Quran blocks with ornate brackets and extracts reference', () => {
    const p = detectKind('قال تعالى: ﴿يَا أَيُّهَا الَّذِينَ آمَنُوا اتَّقُوا اللَّهَ﴾ [آل عمران: 102]');
    expect(p.kind).toBe('QURAN');
    expect(p.reference).toBe('آل عمران:102');
  });

  it('detects Hadith blocks', () => {
    const p = detectKind('قال رسول الله صلى الله عليه وسلم: «إنما الأعمال بالنيات» رواه البخاري.');
    expect(p.kind).toBe('HADITH');
    expect(p.reference).toContain('رواه البخاري');
  });
});

describe('estimateSeconds', () => {
  it('uses a floor for very short paragraphs', () => {
    expect(estimateSeconds('أما بعد')).toBe(8);
  });
  it('scales with word count', () => {
    const words = Array.from({ length: 220 }, () => 'كلمة').join(' ');
    expect(estimateSeconds(words)).toBe(120);
  });
});

describe('paragraphHash', () => {
  it('ignores tashkeel and whitespace differences', () => {
    expect(paragraphHash('الحَمْدُ لِلَّهِ')).toBe(paragraphHash('الحمد   لله'));
    expect(paragraphHash('الحمد لله')).not.toBe(paragraphHash('الحمد لله رب العالمين'));
  });
});

describe('hijri', () => {
  it('formats a known date', () => {
    const h = toHijri(new Date(Date.UTC(2024, 2, 11, 12)));
    expect(h.year).toBe(1445);
    expect(h.month).toBe(9);
    expect(h.formatted).toContain('رمضان');
  });
  it('nextFriday returns a Friday', () => {
    expect(nextFriday(new Date(2026, 8, 1)).getDay()).toBe(5);
    expect(nextFriday(new Date(2026, 8, 4)).getDate()).toBe(4);
  });
});
