import type { GlossaryMode, ParagraphKind, ProviderType } from '@jumaah/shared';

export interface GlossaryEntry {
  term: string;
  /** '*' = all target languages */
  lang: string;
  replacement?: string | null;
  mode: GlossaryMode;
  note?: string | null;
}

export interface TranslationItem {
  id: string;
  text: string;
  kind?: ParagraphKind;
}

export interface TranslateContext {
  tenantName?: string;
  khutbahTitle?: string;
  sectionType?: string;
  /** Free-form instructions from the mosque (tone, dialect, audience). */
  instructions?: string;
}

export interface TranslateRequest {
  items: TranslationItem[];
  sourceLang: string;
  targetLang: string;
  glossary?: GlossaryEntry[];
  context?: TranslateContext;
  signal?: AbortSignal;
}

export interface TranslatedItem {
  id: string;
  text: string;
}

export interface TranslateUsage {
  inputTokens?: number;
  outputTokens?: number;
  characters?: number;
}

export interface TranslateResult {
  items: TranslatedItem[];
  provider: ProviderType;
  model?: string;
  usage?: TranslateUsage;
  costUsd?: number;
  latencyMs?: number;
}

export interface CostLine {
  type: ProviderType;
  estimatedUsd: number;
  model?: string;
  note?: string;
}

export interface HealthResult {
  ok: boolean;
  message?: string;
  latencyMs?: number;
  model?: string;
}

export interface ProviderSettings {
  type: ProviderType;
  name?: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  options?: Record<string, unknown>;
  /** Injected fetch for tests. */
  fetch?: typeof fetch;
}

/**
 * Unified provider contract. Implementations must be stateless per call and safe to reuse.
 * `translate` must return one item per input item (same ids) or throw a ProviderError.
 */
export interface TranslationProvider {
  readonly type: ProviderType;
  readonly name: string;
  /** Whether it can translate several paragraphs in one request. */
  readonly supportsBatch: boolean;
  readonly maxBatchItems: number;
  /** false for on-prem engines (Ollama, LibreTranslate, Manual). */
  readonly requiresInternet: boolean;
  translate(req: TranslateRequest): Promise<TranslateResult>;
  estimateCost(input: { characters: number; items: number; languages: number }): CostLine;
  healthCheck(signal?: AbortSignal): Promise<HealthResult>;
}

export type ProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'AUTH'
  | 'RATE_LIMITED'
  | 'UNSUPPORTED_LANG'
  | 'NETWORK'
  | 'BAD_RESPONSE'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'MANUAL_REQUIRED'
  | 'UNKNOWN';

export class ProviderError extends Error {
  constructor(
    public readonly provider: ProviderType,
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly inner?: unknown,
  ) {
    super(`[${provider}] ${code}: ${message}`);
    this.name = 'ProviderError';
  }
}

export function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || (err as { code?: string }).code === 'ABORT_ERR');
}
