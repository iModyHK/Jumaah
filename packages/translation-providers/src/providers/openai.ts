import { actualLlmCost, estimateLlmCost } from '../cost.js';
import { buildSystemPrompt, buildUserMessage, parseItemsJson } from '../llm-prompt.js';
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

export const DEFAULT_OPENAI_MODEL = 'gpt-4.1';
const BATCH = 20;

/** OpenAI Chat Completions via fetch (also works with any OpenAI-compatible endpoint via baseUrl). */
export class OpenAiProvider implements TranslationProvider {
  readonly type = 'OPENAI' as const;
  readonly name: string;
  readonly supportsBatch = true;
  readonly maxBatchItems = BATCH;
  readonly requiresInternet = true;
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(settings: ProviderSettings) {
    this.name = settings.name ?? 'OpenAI';
    this.apiKey = settings.apiKey ?? null;
    this.baseUrl = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    this.model = settings.model || DEFAULT_OPENAI_MODEL;
    this.fetchFn = settings.fetch ?? fetch;
  }

  async translate(req: TranslateRequest): Promise<TranslateResult> {
    if (!this.apiKey) throw new ProviderError('OPENAI', 'NOT_CONFIGURED', 'API key missing');
    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        signal: req.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: buildSystemPrompt(req) },
            { role: 'user', content: buildUserMessage(req) },
          ],
        }),
      });
    } catch (err) {
      if (isAbort(err)) throw err;
      throw new ProviderError('OPENAI', 'NETWORK', (err as Error).message, true, err);
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError('OPENAI', 'AUTH', `HTTP ${res.status}`);
    if (res.status === 429) throw new ProviderError('OPENAI', 'RATE_LIMITED', 'HTTP 429', true);
    if (!res.ok) throw new ProviderError('OPENAI', 'UNKNOWN', `HTTP ${res.status}: ${await res.text()}`, res.status >= 500);
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = body.choices?.[0]?.message?.content ?? '';
    let items: Array<{ id: string; text: string }>;
    try {
      items = parseItemsJson(content);
    } catch (err) {
      throw new ProviderError('OPENAI', 'BAD_RESPONSE', (err as Error).message, false, err);
    }
    const usage = { inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens };
    return { items, provider: 'OPENAI', model: this.model, usage, costUsd: actualLlmCost(this.model, usage), latencyMs: Date.now() - started };
  }

  estimateCost(input: { characters: number; items: number; languages: number }): CostLine {
    return estimateLlmCost('OPENAI', this.model, input, BATCH);
  }

  async healthCheck(signal?: AbortSignal): Promise<HealthResult> {
    if (!this.apiKey) return { ok: false, message: 'API key missing' };
    const started = Date.now();
    try {
      const res = await this.fetchFn(`${this.baseUrl}/models/${encodeURIComponent(this.model)}`, {
        headers: { authorization: `Bearer ${this.apiKey}` },
        signal,
      });
      return { ok: res.ok, message: res.ok ? undefined : `HTTP ${res.status}`, latencyMs: Date.now() - started, model: this.model };
    } catch (err) {
      return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
    }
  }
}
