import { decryptSecret, type Db, type ProviderConfig } from '@jumaah/db';
import type { ProviderType } from '@jumaah/shared';
import {
  ProviderError,
  createProvider,
  isAbort,
  type CostLine,
  type GlossaryEntry,
  type HealthResult,
  type TranslateRequest,
  type TranslateResult,
  type TranslationProvider,
} from '@jumaah/translation-providers';
import type { AppContext } from '../lib/context.js';

/** Edge-side provider that forwards paragraphs to the cloud, which runs its own (central-key) chain. */
export class CloudRelayProvider implements TranslationProvider {
  readonly type = 'CLOUD' as const;
  readonly name = 'Cloud relay';
  readonly supportsBatch = true;
  readonly maxBatchItems = 100;
  readonly requiresInternet = true;

  constructor(
    private readonly cloudUrl: string,
    private readonly tenantSlug: string,
    private readonly syncKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async translate(req: TranslateRequest): Promise<TranslateResult> {
    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchFn(`${this.cloudUrl}/api/sync/translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sync-key': this.syncKey },
        signal: req.signal ?? AbortSignal.timeout(120_000),
        body: JSON.stringify({
          tenantSlug: this.tenantSlug,
          items: req.items.map((i) => ({ id: i.id, text: i.text, kind: i.kind ?? 'TEXT' })),
          targetLangs: [req.targetLang],
          glossary: req.glossary ?? [],
        }),
      });
    } catch (err) {
      if (isAbort(err)) throw err;
      throw new ProviderError('CLOUD', 'NETWORK', (err as Error).message, true, err);
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError('CLOUD', 'AUTH', 'sync key rejected');
    if (res.status === 429) throw new ProviderError('CLOUD', 'RATE_LIMITED', 'HTTP 429', true);
    if (!res.ok) throw new ProviderError('CLOUD', 'UNKNOWN', `HTTP ${res.status}: ${await res.text()}`, res.status >= 500);
    const body = (await res.json()) as {
      results: Record<string, Array<{ id: string; text: string; provider: ProviderType; model?: string }>>;
      costUsd?: number;
    };
    const items = body.results?.[req.targetLang] ?? [];
    return { items: items.map((i) => ({ id: i.id, text: i.text })), provider: 'CLOUD', model: items[0]?.model, costUsd: body.costUsd ?? 0, latencyMs: Date.now() - started };
  }

  estimateCost(): CostLine {
    return { type: 'CLOUD', estimatedUsd: 0, note: 'Billed centrally by the platform' };
  }

  async healthCheck(signal?: AbortSignal): Promise<HealthResult> {
    const started = Date.now();
    try {
      const res = await this.fetchFn(`${this.cloudUrl}/api/sync/version`, { headers: { 'x-sync-key': this.syncKey }, signal: signal ?? AbortSignal.timeout(5000) });
      return { ok: res.ok, message: res.ok ? undefined : `HTTP ${res.status}`, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
    }
  }
}

export function providerFromConfig(ctx: AppContext, cfg: ProviderConfig): TranslationProvider {
  if (cfg.type === 'CLOUD') {
    if (!ctx.config.cloudApiUrl || !ctx.config.EDGE_TENANT_SLUG || !ctx.config.EDGE_SYNC_KEY) {
      throw new ProviderError('CLOUD', 'NOT_CONFIGURED', 'CLOUD_API_URL / EDGE_SYNC_KEY missing');
    }
    return new CloudRelayProvider(ctx.config.cloudApiUrl, ctx.config.EDGE_TENANT_SLUG, ctx.config.EDGE_SYNC_KEY);
  }
  const apiKey = cfg.apiKeyEncrypted ? decryptSecret(cfg.apiKeyEncrypted, ctx.config.ENCRYPTION_KEY) : null;
  return createProvider({
    type: cfg.type,
    name: cfg.name,
    apiKey,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    options: (cfg.options as Record<string, unknown>) ?? {},
  });
}

export interface ResolvedChain {
  providers: TranslationProvider[];
  configs: ProviderConfig[];
  chain: ProviderType[];
}

/**
 * Build the ordered provider chain for a tenant.
 * Order: explicit override > tenant.settings.defaultProviderChain > priority (tenant providers, then global).
 * On edge with cloud configured, a CLOUD relay is appended (or placed where the chain names it).
 */
export async function resolveChain(ctx: AppContext, tenantId: string, override?: ProviderType[]): Promise<ResolvedChain> {
  const [tenant, configs] = await Promise.all([
    ctx.db.tenant.findUnique({ where: { id: tenantId } }),
    ctx.db.providerConfig.findMany({
      where: { enabled: true, OR: [{ tenantId }, { tenantId: null }] },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);
  // Tenant-specific config wins over a global one of the same type.
  const byType = new Map<ProviderType, ProviderConfig>();
  for (const c of configs) {
    const existing = byType.get(c.type);
    if (!existing || (existing.tenantId === null && c.tenantId === tenantId)) byType.set(c.type, c);
  }
  const cloudAvailable = ctx.config.isEdge && !!ctx.config.cloudApiUrl && !!ctx.config.EDGE_SYNC_KEY;
  if (cloudAvailable && !byType.has('CLOUD')) {
    byType.set('CLOUD', {
      id: 'virtual-cloud',
      tenantId,
      type: 'CLOUD',
      name: 'Cloud relay',
      apiKeyEncrypted: null,
      apiKeyHint: null,
      baseUrl: null,
      model: null,
      priority: 50,
      enabled: true,
      options: {},
      lastTestedAt: null,
      lastTestOk: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  const settingsChain = ((tenant?.settings as { defaultProviderChain?: ProviderType[] })?.defaultProviderChain ?? []).filter((t) => byType.has(t));
  const priorityOrder = [...byType.values()].sort((a, b) => a.priority - b.priority).map((c) => c.type);
  const base = override?.length ? override.filter((t) => byType.has(t)) : settingsChain.length ? settingsChain : priorityOrder;
  // Anything configured but not named in the chain is appended as a last resort (MANUAL always last).
  const chain = [...base, ...priorityOrder.filter((t) => !base.includes(t))].filter((t) => t !== 'MANUAL');
  const ordered = chain.map((t) => byType.get(t)!);
  const providers: TranslationProvider[] = [];
  const used: ProviderConfig[] = [];
  for (const cfg of ordered) {
    try {
      providers.push(providerFromConfig(ctx, cfg));
      used.push(cfg);
    } catch (err) {
      ctx.log.warn({ provider: cfg.type, err: (err as Error).message }, 'provider skipped');
    }
  }
  return { providers, configs: used, chain: used.map((c) => c.type) };
}

export async function loadGlossary(db: Db, tenantId: string): Promise<GlossaryEntry[]> {
  const rows = await db.glossaryEntry.findMany({ where: { tenantId } });
  return rows.map((r) => ({ term: r.term, lang: r.lang, replacement: r.replacement, mode: r.mode, note: r.note }));
}

/** True when the edge server can currently reach the cloud (cached 30s). */
export async function isOnline(ctx: AppContext): Promise<boolean> {
  if (!ctx.config.cloudApiUrl) return false;
  const key = 'net:online';
  const cached = await ctx.redis.get(key);
  if (cached !== null) return cached === '1';
  let ok = false;
  try {
    const res = await fetch(`${ctx.config.cloudApiUrl}/api/health`, { signal: AbortSignal.timeout(4000) });
    ok = res.ok;
  } catch {
    ok = false;
  }
  await ctx.redis.set(key, ok ? '1' : '0', 'EX', 30);
  return ok;
}
