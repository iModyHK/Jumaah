import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
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

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';
const BATCH = 20;

const ItemsSchema = z.object({
  items: z.array(z.object({ id: z.string(), text: z.string() })),
});

export class AnthropicProvider implements TranslationProvider {
  readonly type = 'ANTHROPIC' as const;
  readonly name: string;
  readonly supportsBatch = true;
  readonly maxBatchItems = BATCH;
  readonly requiresInternet = true;
  private readonly client: Anthropic | null;
  private readonly model: string;
  private readonly effort: 'low' | 'medium' | 'high';

  constructor(settings: ProviderSettings) {
    this.name = settings.name ?? 'Anthropic Claude';
    this.model = settings.model || DEFAULT_ANTHROPIC_MODEL;
    this.effort = (settings.options?.effort as 'low' | 'medium' | 'high') ?? 'medium';
    this.client = settings.apiKey
      ? new Anthropic({
          apiKey: settings.apiKey,
          baseURL: settings.baseUrl || undefined,
          maxRetries: 2,
          timeout: 120_000,
          fetch: settings.fetch,
        })
      : null;
  }

  async translate(req: TranslateRequest): Promise<TranslateResult> {
    if (!this.client) throw new ProviderError('ANTHROPIC', 'NOT_CONFIGURED', 'API key missing');
    const started = Date.now();
    const system = buildSystemPrompt(req);
    try {
      const message = await this.client.messages.parse(
        {
          model: this.model,
          max_tokens: 16000,
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          output_config: { effort: this.effort, format: zodOutputFormat(ItemsSchema) },
          messages: [{ role: 'user', content: buildUserMessage(req) }],
        },
        { signal: req.signal },
      );
      if (message.stop_reason === 'refusal') {
        throw new ProviderError('ANTHROPIC', 'BAD_RESPONSE', `Model declined: ${message.stop_details?.explanation ?? 'refusal'}`);
      }
      const items: Array<{ id: string; text: string }> = message.parsed_output
        ? (message.parsed_output as { items: Array<{ id: string; text: string }> }).items
        : parseItemsJson(textOf(message));
      const usage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
      return {
        items: items.map((i) => ({ id: i.id, text: i.text })),
        provider: 'ANTHROPIC',
        model: this.model,
        usage,
        costUsd: actualLlmCost(this.model, usage),
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (isAbort(err)) throw err;
      if (err instanceof Anthropic.AuthenticationError) throw new ProviderError('ANTHROPIC', 'AUTH', err.message, false, err);
      if (err instanceof Anthropic.RateLimitError) throw new ProviderError('ANTHROPIC', 'RATE_LIMITED', err.message, true, err);
      if (err instanceof Anthropic.APIConnectionError) throw new ProviderError('ANTHROPIC', 'NETWORK', err.message, true, err);
      if (err instanceof Anthropic.APIError)
        throw new ProviderError('ANTHROPIC', 'UNKNOWN', `${err.status} ${err.message}`, (err.status ?? 0) >= 500, err);
      throw new ProviderError('ANTHROPIC', 'BAD_RESPONSE', (err as Error).message, false, err);
    }
  }

  estimateCost(input: { characters: number; items: number; languages: number }): CostLine {
    return estimateLlmCost('ANTHROPIC', this.model, input, BATCH);
  }

  async healthCheck(signal?: AbortSignal): Promise<HealthResult> {
    if (!this.client) return { ok: false, message: 'API key missing' };
    const started = Date.now();
    try {
      await this.client.models.retrieve(this.model, {}, { signal });
      return { ok: true, latencyMs: Date.now() - started, model: this.model };
    } catch (err) {
      return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
    }
  }
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
