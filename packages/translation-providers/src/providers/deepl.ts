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
/** DeepL target languages (subset relevant to mosques). Others raise UNSUPPORTED_LANG so the chain falls through. */
const SUPPORTED = new Set(['en', 'de', 'fr', 'es', 'it', 'nl', 'pl', 'pt', 'ru', 'tr', 'id', 'zh', 'ja', 'ko', 'ar', 'uk', 'sv', 'da', 'fi', 'nb', 'el', 'cs', 'hu', 'ro', 'sk', 'sl', 'bg', 'et', 'lv', 'lt']);

export class DeepLProvider implements TranslationProvider {
  readonly type = 'DEEPL' as const;
  readonly name: string;
  readonly supportsBatch = true;
  readonly maxBatchItems = BATCH;
  readonly requiresInternet = true;
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(settings: ProviderSettings) {
    this.name = settings.name ?? 'DeepL';
    this.apiKey = settings.apiKey ?? null;
    const isFree = this.apiKey?.endsWith(':fx');
    this.baseUrl = (settings.baseUrl || (isFree ? 'https://api-free.deepl.com/v2' : 'https://api.deepl.com/v2')).replace(/\/$/, '');
    this.fetchFn = settings.fetch ?? fetch;
  }

  async translate(req: TranslateRequest): Promise<TranslateResult> {
    if (!this.apiKey) throw new ProviderError('DEEPL', 'NOT_CONFIGURED', 'API key missing');
    if (!SUPPORTED.has(req.targetLang)) throw new ProviderError('DEEPL', 'UNSUPPORTED_LANG', `DeepL does not support ${req.targetLang}`);
    const started = Date.now();
    const glossary = applicableGlossary(req.glossary, req.targetLang);
    const protectedItems = req.items.map((i) => ({ id: i.id, ...protectTerms(i.text, glossary) }));
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `DeepL-Auth-Key ${this.apiKey}` },
        signal: req.signal,
        body: JSON.stringify({
          text: protectedItems.map((i) => i.text),
          source_lang: req.sourceLang.toUpperCase(),
          target_lang: mapTarget(req.targetLang),
          formality: 'prefer_more',
        }),
      });
    } catch (err) {
      if (isAbort(err)) throw err;
      throw new ProviderError('DEEPL', 'NETWORK', (err as Error).message, true, err);
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError('DEEPL', 'AUTH', `HTTP ${res.status}`);
    if (res.status === 429 || res.status === 456) throw new ProviderError('DEEPL', 'RATE_LIMITED', `HTTP ${res.status}`, res.status === 429);
    if (!res.ok) throw new ProviderError('DEEPL', 'UNKNOWN', `HTTP ${res.status}: ${await res.text()}`, res.status >= 500);
    const body = (await res.json()) as { translations?: Array<{ text: string }> };
    const out = body.translations ?? [];
    if (out.length !== protectedItems.length) throw new ProviderError('DEEPL', 'BAD_RESPONSE', 'translation count mismatch');
    const characters = req.items.reduce((n, i) => n + i.text.length, 0);
    return {
      items: protectedItems.map((p, idx) => ({ id: p.id, text: restoreTerms(out[idx].text, p.placeholders) })),
      provider: 'DEEPL',
      usage: { characters },
      costUsd: estimateMtCost('DEEPL', { characters, languages: 1 }).estimatedUsd,
      latencyMs: Date.now() - started,
    };
  }

  estimateCost(input: { characters: number; items: number; languages: number }): CostLine {
    return estimateMtCost('DEEPL', input);
  }

  async healthCheck(signal?: AbortSignal): Promise<HealthResult> {
    if (!this.apiKey) return { ok: false, message: 'API key missing' };
    const started = Date.now();
    try {
      const res = await this.fetchFn(`${this.baseUrl}/usage`, { headers: { authorization: `DeepL-Auth-Key ${this.apiKey}` }, signal });
      return { ok: res.ok, message: res.ok ? undefined : `HTTP ${res.status}`, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
    }
  }
}

function mapTarget(code: string): string {
  if (code === 'en') return 'EN-GB';
  if (code === 'pt') return 'PT-PT';
  if (code === 'zh') return 'ZH-HANS';
  return code.toUpperCase();
}
