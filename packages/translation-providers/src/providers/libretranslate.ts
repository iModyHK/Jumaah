import { freeCost } from '../cost.js';
import { applicableGlossary, protectTerms, restoreTerms } from '../glossary.js';
import {
  ProviderError,
  isAbort,
  type CostLine,
  type HealthResult,
  type ProviderSettings,
  type TranslateRequest,
  type TranslateResult,
  type TranslationProvider,
} from '../types.js';

/** Self-hosted LibreTranslate (offline-capable). One request per paragraph, limited concurrency. */
export class LibreTranslateProvider implements TranslationProvider {
  readonly type = 'LIBRETRANSLATE' as const;
  readonly name: string;
  readonly supportsBatch = true;
  readonly maxBatchItems = 10;
  readonly requiresInternet = false;
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly concurrency: number;

  constructor(settings: ProviderSettings) {
    this.name = settings.name ?? 'LibreTranslate';
    this.apiKey = settings.apiKey ?? null;
    this.baseUrl = (settings.baseUrl || 'http://localhost:5000').replace(/\/$/, '');
    this.fetchFn = settings.fetch ?? fetch;
    this.concurrency = Number(settings.options?.concurrency ?? 3);
  }

  async translate(req: TranslateRequest): Promise<TranslateResult> {
    const started = Date.now();
    const glossary = applicableGlossary(req.glossary, req.targetLang);
    const queue = req.items.map((i) => ({ id: i.id, ...protectTerms(i.text, glossary) }));
    const results: Array<{ id: string; text: string }> = [];
    let idx = 0;
    const worker = async () => {
      while (idx < queue.length) {
        const item = queue[idx++];
        const text = await this.translateOne(item.text, req);
        results.push({ id: item.id, text: restoreTerms(text, item.placeholders) });
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, queue.length) }, worker));
    const order = new Map(req.items.map((i, n) => [i.id, n]));
    results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return {
      items: results,
      provider: 'LIBRETRANSLATE',
      usage: { characters: req.items.reduce((n, i) => n + i.text.length, 0) },
      costUsd: 0,
      latencyMs: Date.now() - started,
    };
  }

  private async translateOne(text: string, req: TranslateRequest): Promise<string> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({ q: text, source: req.sourceLang, target: req.targetLang, format: 'text', api_key: this.apiKey ?? undefined }),
      });
    } catch (err) {
      if (isAbort(err)) throw err;
      throw new ProviderError('LIBRETRANSLATE', 'NETWORK', (err as Error).message, true, err);
    }
    if (res.status === 400) {
      const body = await res.text();
      if (/not supported|language/i.test(body)) throw new ProviderError('LIBRETRANSLATE', 'UNSUPPORTED_LANG', body);
      throw new ProviderError('LIBRETRANSLATE', 'UNKNOWN', body);
    }
    if (res.status === 403) throw new ProviderError('LIBRETRANSLATE', 'AUTH', 'HTTP 403');
    if (res.status === 429) throw new ProviderError('LIBRETRANSLATE', 'RATE_LIMITED', 'HTTP 429', true);
    if (!res.ok) throw new ProviderError('LIBRETRANSLATE', 'UNKNOWN', `HTTP ${res.status}`, res.status >= 500);
    const body = (await res.json()) as { translatedText?: string };
    if (typeof body.translatedText !== 'string') throw new ProviderError('LIBRETRANSLATE', 'BAD_RESPONSE', 'missing translatedText');
    return body.translatedText;
  }

  estimateCost(): CostLine {
    return freeCost('LIBRETRANSLATE', 'Self-hosted');
  }

  async healthCheck(signal?: AbortSignal): Promise<HealthResult> {
    const started = Date.now();
    try {
      const res = await this.fetchFn(`${this.baseUrl}/languages`, { signal });
      return { ok: res.ok, message: res.ok ? undefined : `HTTP ${res.status}`, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
    }
  }
}
