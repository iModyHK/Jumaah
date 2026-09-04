import { estimateMtCost } from '../cost.js';
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

const BATCH = 50;

/** Google Cloud Translation v2 (API key). Glossary terms are protected with placeholders. */
export class GoogleTranslateProvider implements TranslationProvider {
  readonly type = 'GOOGLE' as const;
  readonly name: string;
  readonly supportsBatch = true;
  readonly maxBatchItems = BATCH;
  readonly requiresInternet = true;
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(settings: ProviderSettings) {
    this.name = settings.name ?? 'Google Cloud Translation';
    this.apiKey = settings.apiKey ?? null;
    this.baseUrl = (settings.baseUrl || 'https://translation.googleapis.com/language/translate/v2').replace(/\/$/, '');
    this.fetchFn = settings.fetch ?? fetch;
  }

  async translate(req: TranslateRequest): Promise<TranslateResult> {
    if (!this.apiKey) throw new ProviderError('GOOGLE', 'NOT_CONFIGURED', 'API key missing');
    const started = Date.now();
    const glossary = applicableGlossary(req.glossary, req.targetLang);
    const protectedItems = req.items.map((i) => ({ id: i.id, ...protectTerms(i.text, glossary) }));
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}?key=${encodeURIComponent(this.apiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
          q: protectedItems.map((i) => i.text),
          source: req.sourceLang,
          target: mapLang(req.targetLang),
          format: 'text',
        }),
      });
    } catch (err) {
      if (isAbort(err)) throw err;
      throw new ProviderError('GOOGLE', 'NETWORK', (err as Error).message, true, err);
    }
    if (res.status === 400) {
      const text = await res.text();
      if (/target|language/i.test(text)) throw new ProviderError('GOOGLE', 'UNSUPPORTED_LANG', text);
      throw new ProviderError('GOOGLE', 'UNKNOWN', text);
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError('GOOGLE', 'AUTH', `HTTP ${res.status}`);
    if (res.status === 429) throw new ProviderError('GOOGLE', 'RATE_LIMITED', 'HTTP 429', true);
    if (!res.ok) throw new ProviderError('GOOGLE', 'UNKNOWN', `HTTP ${res.status}`, res.status >= 500);
    const body = (await res.json()) as { data?: { translations?: Array<{ translatedText: string }> } };
    const out = body.data?.translations ?? [];
    if (out.length !== protectedItems.length) throw new ProviderError('GOOGLE', 'BAD_RESPONSE', 'translation count mismatch');
    const characters = req.items.reduce((n, i) => n + i.text.length, 0);
    return {
      items: protectedItems.map((p, idx) => ({ id: p.id, text: restoreTerms(decodeEntities(out[idx].translatedText), p.placeholders) })),
      provider: 'GOOGLE',
      usage: { characters },
      costUsd: estimateMtCost('GOOGLE', { characters, languages: 1 }).estimatedUsd,
      latencyMs: Date.now() - started,
    };
  }

  estimateCost(input: { characters: number; items: number; languages: number }): CostLine {
    return estimateMtCost('GOOGLE', input);
  }

  async healthCheck(signal?: AbortSignal): Promise<HealthResult> {
    if (!this.apiKey) return { ok: false, message: 'API key missing' };
    const started = Date.now();
    try {
      const res = await this.fetchFn(`${this.baseUrl}/languages?key=${encodeURIComponent(this.apiKey)}`, { signal });
      return { ok: res.ok, message: res.ok ? undefined : `HTTP ${res.status}`, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
    }
  }
}

function mapLang(code: string): string {
  if (code === 'zh') return 'zh-CN';
  if (code === 'tl') return 'tl';
  return code;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
