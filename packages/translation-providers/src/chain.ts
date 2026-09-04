import type { ProviderType } from '@jumaah/shared';
import { ProviderError, isAbort, type TranslateRequest, type TranslateResult, type TranslationProvider } from './types.js';

export interface ChainAttempt {
  provider: ProviderType;
  ok: boolean;
  error?: string;
  code?: string;
  latencyMs: number;
  itemsTranslated: number;
}

export interface ChainResult {
  items: TranslateResult['items'];
  /** Which provider produced each item id. */
  providerByItem: Record<string, ProviderType>;
  modelByItem: Record<string, string | undefined>;
  attempts: ChainAttempt[];
  costUsd: number;
  usage: { inputTokens: number; outputTokens: number; characters: number };
}

export class ProviderChainError extends Error {
  constructor(
    public readonly attempts: ChainAttempt[],
    public readonly missingIds: string[],
  ) {
    super(`All providers failed (${attempts.map((a) => `${a.provider}:${a.code ?? 'ok'}`).join(', ')})`);
    this.name = 'ProviderChainError';
  }
}

export interface ChainOptions {
  /** Retries per provider for retryable errors (rate limit, network). */
  retries?: number;
  retryDelayMs?: number;
  /** Skip providers that need internet (edge offline mode). */
  offline?: boolean;
  onAttempt?: (attempt: ChainAttempt) => void;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new ProviderError('MANUAL', 'ABORTED', 'aborted'));
    });
  });

async function translateWithRetry(
  provider: TranslationProvider,
  req: TranslateRequest,
  retries: number,
  delayMs: number,
): Promise<TranslateResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await provider.translate(req);
    } catch (err) {
      lastErr = err;
      if (isAbort(err) || req.signal?.aborted) throw err;
      const retryable = err instanceof ProviderError ? err.retryable : false;
      if (!retryable || attempt === retries) throw err;
      await sleep(delayMs * Math.pow(2, attempt), req.signal);
    }
  }
  throw lastErr;
}

/**
 * Try providers in order. Items successfully translated by an earlier provider are not re-sent
 * to later ones; a provider that returns a partial result only hands the missing items forward.
 */
export async function translateWithChain(
  providers: TranslationProvider[],
  req: TranslateRequest,
  opts: ChainOptions = {},
): Promise<ChainResult> {
  const retries = opts.retries ?? 1;
  const delay = opts.retryDelayMs ?? 800;
  const attempts: ChainAttempt[] = [];
  const done = new Map<string, { text: string; provider: ProviderType; model?: string }>();
  let remaining = [...req.items];
  let costUsd = 0;
  const usage = { inputTokens: 0, outputTokens: 0, characters: 0 };

  for (const provider of providers) {
    if (remaining.length === 0) break;
    if (opts.offline && provider.requiresInternet) {
      attempts.push({ provider: provider.type, ok: false, code: 'OFFLINE', error: 'skipped: offline', latencyMs: 0, itemsTranslated: 0 });
      continue;
    }
    const started = Date.now();
    try {
      const batches = chunk(remaining, provider.supportsBatch ? provider.maxBatchItems : 1);
      let translatedCount = 0;
      for (const batch of batches) {
        const res = await translateWithRetry(provider, { ...req, items: batch }, retries, delay);
        for (const it of res.items) {
          if (!it.text?.trim()) continue;
          done.set(it.id, { text: it.text.trim(), provider: provider.type, model: res.model });
          translatedCount += 1;
        }
        costUsd += res.costUsd ?? 0;
        usage.inputTokens += res.usage?.inputTokens ?? 0;
        usage.outputTokens += res.usage?.outputTokens ?? 0;
        usage.characters += res.usage?.characters ?? 0;
      }
      const attempt: ChainAttempt = { provider: provider.type, ok: true, latencyMs: Date.now() - started, itemsTranslated: translatedCount };
      attempts.push(attempt);
      opts.onAttempt?.(attempt);
      remaining = remaining.filter((i) => !done.has(i.id));
    } catch (err) {
      if (isAbort(err) || req.signal?.aborted) throw err;
      const e = err instanceof ProviderError ? err : new ProviderError(provider.type, 'UNKNOWN', String((err as Error)?.message ?? err));
      const attempt: ChainAttempt = {
        provider: provider.type,
        ok: false,
        error: e.message,
        code: e.code,
        latencyMs: Date.now() - started,
        itemsTranslated: 0,
      };
      attempts.push(attempt);
      opts.onAttempt?.(attempt);
      // keep partial results from this provider (if any) and continue
      remaining = remaining.filter((i) => !done.has(i.id));
    }
  }

  if (remaining.length > 0) {
    throw new ProviderChainError(
      attempts,
      remaining.map((i) => i.id),
    );
  }

  const providerByItem: Record<string, ProviderType> = {};
  const modelByItem: Record<string, string | undefined> = {};
  const items = req.items.map((i) => {
    const d = done.get(i.id)!;
    providerByItem[i.id] = d.provider;
    modelByItem[i.id] = d.model;
    return { id: i.id, text: d.text };
  });
  return { items, providerByItem, modelByItem, attempts, costUsd: Math.round(costUsd * 10000) / 10000, usage };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const s = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s));
  return out;
}
