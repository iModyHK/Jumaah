import { fnv1a64, normalizeArabicForHash, type ProviderType } from '@jumaah/shared';
import { glossaryFingerprint } from './glossary.js';
import type { GlossaryEntry } from './types.js';

/**
 * Cache key for an identical translation request. Two paragraphs with the same normalized Arabic,
 * same target language, same provider family and same effective glossary share a translation.
 */
export function cacheKey(input: {
  text: string;
  targetLang: string;
  providerType: ProviderType;
  model?: string | null;
  glossary: GlossaryEntry[];
}): { key: string; sourceHash: string } {
  const sourceHash = fnv1a64(normalizeArabicForHash(input.text));
  const g = fnv1a64(glossaryFingerprint(input.glossary));
  const key = `${sourceHash}:${input.targetLang}:${input.providerType}:${input.model ?? ''}:${g}`;
  return { key, sourceHash };
}

export interface TranslationCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: { sourceHash: string; lang: string; providerType: ProviderType; text: string }): Promise<void>;
}

/** In-memory LRU used in tests and as an L1 in front of the DB cache. */
export class MemoryCacheStore implements TranslationCacheStore {
  private map = new Map<string, string>();
  constructor(private readonly max = 5000) {}
  async get(key: string): Promise<string | null> {
    const v = this.map.get(key);
    if (v === undefined) return null;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }
  async set(key: string, value: { text: string }): Promise<void> {
    this.map.set(key, value.text);
    if (this.map.size > this.max) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
  }
  get size(): number {
    return this.map.size;
  }
}
