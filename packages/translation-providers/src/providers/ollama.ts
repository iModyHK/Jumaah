import { freeCost } from '../cost.js';
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

export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:7b';

/** Local LLM via Ollama's chat API. Small batches: local models handle few paragraphs at a time reliably. */
export class OllamaProvider implements TranslationProvider {
  readonly type = 'OLLAMA' as const;
  readonly name: string;
  readonly supportsBatch = true;
  readonly maxBatchItems = 4;
  readonly requiresInternet = false;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(settings: ProviderSettings) {
    this.name = settings.name ?? 'Ollama';
    this.baseUrl = (settings.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
    this.model = settings.model || DEFAULT_OLLAMA_MODEL;
    this.fetchFn = settings.fetch ?? fetch;
  }

  async translate(req: TranslateRequest): Promise<TranslateResult> {
    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: 'json',
          options: { temperature: 0.2, num_ctx: 8192 },
          messages: [
            { role: 'system', content: buildSystemPrompt(req) },
            { role: 'user', content: buildUserMessage(req) },
          ],
        }),
      });
    } catch (err) {
      if (isAbort(err)) throw err;
      throw new ProviderError('OLLAMA', 'NETWORK', (err as Error).message, true, err);
    }
    if (res.status === 404) throw new ProviderError('OLLAMA', 'NOT_CONFIGURED', `model ${this.model} not pulled`);
    if (!res.ok) throw new ProviderError('OLLAMA', 'UNKNOWN', `HTTP ${res.status}: ${await res.text()}`, res.status >= 500);
    const body = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
    let items: Array<{ id: string; text: string }>;
    try {
      items = parseItemsJson(body.message?.content ?? '');
    } catch (err) {
      throw new ProviderError('OLLAMA', 'BAD_RESPONSE', (err as Error).message, true, err);
    }
    // Local models sometimes drop ids; fall back to positional mapping when counts match.
    const ids = new Set(req.items.map((i) => i.id));
    if (!items.every((i) => ids.has(i.id)) && items.length === req.items.length) {
      items = items.map((it, n) => ({ id: req.items[n].id, text: it.text }));
    }
    return {
      items,
      provider: 'OLLAMA',
      model: this.model,
      usage: { inputTokens: body.prompt_eval_count, outputTokens: body.eval_count },
      costUsd: 0,
      latencyMs: Date.now() - started,
    };
  }

  estimateCost(): CostLine {
    return freeCost('OLLAMA', `Local model ${this.model}`);
  }

  async healthCheck(signal?: AbortSignal): Promise<HealthResult> {
    const started = Date.now();
    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/tags`, { signal });
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}`, latencyMs: Date.now() - started };
      const body = (await res.json()) as { models?: Array<{ name: string }> };
      const has = (body.models ?? []).some((m) => m.name === this.model || m.name.startsWith(`${this.model}:`) || this.model.startsWith(m.name));
      return { ok: has, message: has ? undefined : `model ${this.model} not found (run: ollama pull ${this.model})`, latencyMs: Date.now() - started, model: this.model };
    } catch (err) {
      return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
    }
  }
}
