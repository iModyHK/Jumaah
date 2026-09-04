import { describe, expect, it, vi } from 'vitest';
import { ProviderChainError, translateWithChain, chunk } from './chain.js';
import { GoogleTranslateProvider } from './providers/google.js';
import { OllamaProvider } from './providers/ollama.js';
import { LibreTranslateProvider } from './providers/libretranslate.js';
import { DeepLProvider } from './providers/deepl.js';
import { OpenAiProvider } from './providers/openai.js';
import { ManualProvider } from './providers/manual.js';
import { createProvider, listProviderTypes } from './registry.js';
import { ProviderError, type TranslateRequest, type TranslationProvider } from './types.js';

function fake(type: TranslationProvider['type'], impl: TranslationProvider['translate'], extra: Partial<TranslationProvider> = {}): TranslationProvider {
  return {
    type,
    name: type,
    supportsBatch: true,
    maxBatchItems: 100,
    requiresInternet: false,
    translate: impl,
    estimateCost: () => ({ type, estimatedUsd: 0 }),
    healthCheck: async () => ({ ok: true }),
    ...extra,
  };
}

const req: TranslateRequest = {
  items: [
    { id: 'p1', text: 'الحمد لله' },
    { id: 'p2', text: 'أما بعد' },
    { id: 'p3', text: 'فاتقوا الله' },
  ],
  sourceLang: 'ar',
  targetLang: 'en',
  glossary: [],
};

describe('translateWithChain', () => {
  it('uses the first provider when it succeeds', async () => {
    const a = fake('ANTHROPIC', async (r) => ({ items: r.items.map((i) => ({ id: i.id, text: `A:${i.text}` })), provider: 'ANTHROPIC', costUsd: 0.01 }));
    const g = fake('GOOGLE', vi.fn());
    const res = await translateWithChain([a, g], req);
    expect(res.items.map((i) => i.text)).toEqual(['A:الحمد لله', 'A:أما بعد', 'A:فاتقوا الله']);
    expect(res.providerByItem).toEqual({ p1: 'ANTHROPIC', p2: 'ANTHROPIC', p3: 'ANTHROPIC' });
    expect(g.translate).not.toHaveBeenCalled();
    expect(res.costUsd).toBe(0.01);
    expect(res.attempts).toHaveLength(1);
  });

  it('falls back to the next provider on failure', async () => {
    const a = fake('ANTHROPIC', async () => {
      throw new ProviderError('ANTHROPIC', 'AUTH', 'bad key');
    });
    const g = fake('GOOGLE', async (r) => ({ items: r.items.map((i) => ({ id: i.id, text: `G:${i.id}` })), provider: 'GOOGLE' }));
    const res = await translateWithChain([a, g], req);
    expect(res.items.map((i) => i.text)).toEqual(['G:p1', 'G:p2', 'G:p3']);
    expect(res.attempts.map((x) => [x.provider, x.ok])).toEqual([
      ['ANTHROPIC', false],
      ['GOOGLE', true],
    ]);
  });

  it('forwards only missing items when a provider returns a partial result', async () => {
    const a = fake('ANTHROPIC', async (r) => ({ items: [{ id: r.items[0].id, text: 'only first' }], provider: 'ANTHROPIC' }));
    const seen: string[][] = [];
    const g = fake('GOOGLE', async (r) => {
      seen.push(r.items.map((i) => i.id));
      return { items: r.items.map((i) => ({ id: i.id, text: `G:${i.id}` })), provider: 'GOOGLE' };
    });
    const res = await translateWithChain([a, g], req);
    expect(seen).toEqual([['p2', 'p3']]);
    expect(res.providerByItem).toEqual({ p1: 'ANTHROPIC', p2: 'GOOGLE', p3: 'GOOGLE' });
  });

  it('retries retryable errors with backoff', async () => {
    let calls = 0;
    const a = fake('ANTHROPIC', async (r) => {
      calls += 1;
      if (calls === 1) throw new ProviderError('ANTHROPIC', 'RATE_LIMITED', '429', true);
      return { items: r.items.map((i) => ({ id: i.id, text: 'ok' })), provider: 'ANTHROPIC' };
    });
    const res = await translateWithChain([a], req, { retries: 1, retryDelayMs: 1 });
    expect(calls).toBe(2);
    expect(res.attempts[0].ok).toBe(true);
  });

  it('skips internet providers when offline', async () => {
    const a = fake('ANTHROPIC', vi.fn(), { requiresInternet: true });
    const o = fake('OLLAMA', async (r) => ({ items: r.items.map((i) => ({ id: i.id, text: `O:${i.id}` })), provider: 'OLLAMA' }));
    const res = await translateWithChain([a, o], req, { offline: true });
    expect(a.translate).not.toHaveBeenCalled();
    expect(res.attempts[0].code).toBe('OFFLINE');
    expect(res.providerByItem.p1).toBe('OLLAMA');
  });

  it('throws ProviderChainError listing missing ids when everything fails', async () => {
    const a = fake('ANTHROPIC', async () => {
      throw new ProviderError('ANTHROPIC', 'NETWORK', 'down');
    });
    const m = new ManualProvider();
    await expect(translateWithChain([a, m], req)).rejects.toBeInstanceOf(ProviderChainError);
    try {
      await translateWithChain([a, m], req);
    } catch (e) {
      const err = e as ProviderChainError;
      expect(err.missingIds).toEqual(['p1', 'p2', 'p3']);
      expect(err.attempts.map((x) => x.code)).toEqual(['NETWORK', 'MANUAL_REQUIRED']);
    }
  });

  it('respects maxBatchItems', async () => {
    const batches: number[] = [];
    const a = fake(
      'OLLAMA',
      async (r) => {
        batches.push(r.items.length);
        return { items: r.items.map((i) => ({ id: i.id, text: 'x' })), provider: 'OLLAMA' };
      },
      { maxBatchItems: 2 },
    );
    await translateWithChain([a], req);
    expect(batches).toEqual([2, 1]);
  });

  it('chunk helper', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

function mockFetch(handler: (url: string, init?: RequestInit) => unknown, status = 200): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const body = handler(String(url), init);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

describe('HTTP providers (mocked)', () => {
  it('Google protects glossary terms and restores them', async () => {
    let sent: string[] = [];
    const p = new GoogleTranslateProvider({
      type: 'GOOGLE',
      apiKey: 'k',
      fetch: mockFetch((_u, init) => {
        const b = JSON.parse(String(init?.body)) as { q: string[] };
        sent = b.q;
        return { data: { translations: b.q.map((q) => ({ translatedText: q.replace('اتقوا', 'Fear') })) } };
      }),
    });
    const res = await p.translate({ ...req, items: [{ id: 'x', text: 'اتقوا الله' }], glossary: [{ term: 'الله', lang: '*', mode: 'KEEP', replacement: 'Allah' }] });
    expect(sent[0]).toContain('[[1]]');
    expect(res.items[0].text).toBe('Fear Allah');
    expect(res.usage?.characters).toBe(10);
  });

  it('Google maps auth errors', async () => {
    const p = new GoogleTranslateProvider({ type: 'GOOGLE', apiKey: 'k', fetch: mockFetch(() => ({}), 403) });
    await expect(p.translate(req)).rejects.toMatchObject({ code: 'AUTH' });
  });

  it('DeepL rejects unsupported languages before calling the network', async () => {
    const f = vi.fn();
    const p = new DeepLProvider({ type: 'DEEPL', apiKey: 'k', fetch: f as unknown as typeof fetch });
    await expect(p.translate({ ...req, targetLang: 'ur' })).rejects.toMatchObject({ code: 'UNSUPPORTED_LANG' });
    expect(f).not.toHaveBeenCalled();
  });

  it('Ollama parses JSON and falls back to positional ids', async () => {
    const p = new OllamaProvider({
      type: 'OLLAMA',
      fetch: mockFetch(() => ({ message: { content: '{"items":[{"id":"?","text":"one"},{"id":"?","text":"two"},{"id":"?","text":"three"}]}' }, eval_count: 30 })),
    });
    const res = await p.translate(req);
    expect(res.items).toEqual([
      { id: 'p1', text: 'one' },
      { id: 'p2', text: 'two' },
      { id: 'p3', text: 'three' },
    ]);
  });

  it('LibreTranslate translates each item and preserves order', async () => {
    const p = new LibreTranslateProvider({
      type: 'LIBRETRANSLATE',
      baseUrl: 'http://lt',
      fetch: mockFetch((_u, init) => ({ translatedText: `T(${(JSON.parse(String(init?.body)) as { q: string }).q})` })),
    });
    const res = await p.translate(req);
    expect(res.items.map((i) => i.id)).toEqual(['p1', 'p2', 'p3']);
    expect(res.items[1].text).toBe('T(أما بعد)');
  });

  it('OpenAI parses chat completion', async () => {
    const p = new OpenAiProvider({
      type: 'OPENAI',
      apiKey: 'k',
      fetch: mockFetch(() => ({
        choices: [{ message: { content: '{"items":[{"id":"p1","text":"a"},{"id":"p2","text":"b"},{"id":"p3","text":"c"}]}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      })),
    });
    const res = await p.translate(req);
    expect(res.items[2].text).toBe('c');
    expect(res.costUsd).toBeGreaterThan(0);
  });

  it('not-configured providers fail fast', async () => {
    await expect(new OpenAiProvider({ type: 'OPENAI' }).translate(req)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    await expect(createProvider({ type: 'ANTHROPIC' }).translate(req)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('registry knows all types and estimates cost', () => {
    expect(listProviderTypes()).toHaveLength(7);
    const est = createProvider({ type: 'ANTHROPIC', apiKey: 'x' }).estimateCost({ characters: 5000, items: 12, languages: 3 });
    expect(est.estimatedUsd).toBeGreaterThan(0);
    expect(createProvider({ type: 'OLLAMA' }).estimateCost({ characters: 5000, items: 12, languages: 3 }).estimatedUsd).toBe(0);
  });
});
