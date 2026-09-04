import type { ProviderType } from '@jumaah/shared';
import type { CostLine } from './types.js';

/** USD per 1M tokens (LLMs) or per 1M characters (MT engines). Update as vendors change pricing. */
export const LLM_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
};

export const MT_PRICING_PER_MILLION_CHARS: Partial<Record<ProviderType, number>> = {
  GOOGLE: 20,
  DEEPL: 25,
};

/** Arabic is token-dense: roughly 1 token per 2.7 characters on modern tokenizers. */
const AR_CHARS_PER_TOKEN = 2.7;
/** Translated output tends to be ~1.3x the Arabic character count; ~3.5 chars/token for most scripts. */
const OUTPUT_EXPANSION = 1.3;
const OUT_CHARS_PER_TOKEN = 3.5;
/** Fixed prompt overhead per request (system prompt + glossary + JSON scaffolding). */
const PROMPT_OVERHEAD_TOKENS = 700;

export function estimateLlmCost(
  type: ProviderType,
  model: string,
  input: { characters: number; items: number; languages: number },
  batchSize = 20,
): CostLine {
  const pricing = LLM_PRICING[model] ?? { input: 5, output: 25 };
  const requests = Math.max(1, Math.ceil(input.items / batchSize)) * input.languages;
  const inputTokens = (input.characters / AR_CHARS_PER_TOKEN) * input.languages + requests * PROMPT_OVERHEAD_TOKENS;
  const outputTokens = ((input.characters * OUTPUT_EXPANSION) / OUT_CHARS_PER_TOKEN) * input.languages;
  const usd = (inputTokens / 1e6) * pricing.input + (outputTokens / 1e6) * pricing.output;
  return {
    type,
    model,
    estimatedUsd: round(usd),
    note: `~${Math.round(inputTokens)} in / ~${Math.round(outputTokens)} out tokens`,
  };
}

export function estimateMtCost(type: ProviderType, input: { characters: number; languages: number }): CostLine {
  const perMillion = MT_PRICING_PER_MILLION_CHARS[type] ?? 0;
  return {
    type,
    estimatedUsd: round((input.characters * input.languages * perMillion) / 1e6),
    note: `${input.characters * input.languages} characters billed`,
  };
}

export function freeCost(type: ProviderType, note = 'Local / no cost'): CostLine {
  return { type, estimatedUsd: 0, note };
}

export function actualLlmCost(model: string, usage: { inputTokens?: number; outputTokens?: number }): number {
  const pricing = LLM_PRICING[model] ?? { input: 5, output: 25 };
  return round(((usage.inputTokens ?? 0) / 1e6) * pricing.input + ((usage.outputTokens ?? 0) / 1e6) * pricing.output);
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
