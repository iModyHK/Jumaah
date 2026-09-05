import type { Paragraph, Prisma, TranslationJob } from '@jumaah/db';
import { ROOMS, type CostEstimate, type ProviderType } from '@jumaah/shared';
import {
  ProviderChainError,
  cacheKey,
  translateWithChain,
  type GlossaryEntry,
  type TranslationProvider,
} from '@jumaah/translation-providers';
import type { AppContext } from '../lib/context.js';
import type { Actor } from '../lib/audit.js';
import { audit, outbox } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { jobDto } from '../lib/serialize.js';
import { aiDenied, getAiAllowance, platformAiDenied, recordAiUsage } from './plan.service.js';
import { isOnline, loadGlossary, resolveChain } from './provider.service.js';
import { notifyKhutbahChanged } from './session.service.js';

export interface TranslateOptions {
  languages?: string[];
  paragraphIds?: string[];
  providerChain?: ProviderType[];
  force?: boolean;
  includeSpecialBlocks?: boolean;
}

const running = new Map<string, AbortController>();

async function collectWork(ctx: AppContext, tenantId: string, khutbahId: string, opts: TranslateOptions) {
  const khutbah = await ctx.db.khutbah.findFirst({
    where: { id: khutbahId, tenantId, deletedAt: null },
    include: { sections: { include: { paragraphs: { include: { translations: true }, orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } } },
  });
  if (!khutbah) throw notFound('Khutbah');
  const languages = (opts.languages?.length ? opts.languages : khutbah.targetLanguages).filter((l) => l !== 'ar');
  if (languages.length === 0) throw badRequest('No target languages');
  const wanted = opts.paragraphIds ? new Set(opts.paragraphIds) : null;
  const work: Array<{ paragraph: Paragraph; sectionType: string; lang: string }> = [];
  let skippedSpecial = 0;
  for (const s of khutbah.sections) {
    for (const p of s.paragraphs) {
      if (wanted && !wanted.has(p.id)) continue;
      if (p.kind !== 'TEXT' && !opts.includeSpecialBlocks) {
        skippedSpecial += 1;
        continue;
      }
      for (const lang of languages) {
        const existing = p.translations.find((t) => t.lang === lang);
        if (existing && (existing.status === 'APPROVED' || existing.status === 'REVIEWED')) continue;
        if (existing && existing.status === 'MACHINE' && !opts.force) continue;
        work.push({ paragraph: p, sectionType: s.type, lang });
      }
    }
  }
  return { khutbah, languages, work, skippedSpecial };
}

export async function estimateCost(ctx: AppContext, tenantId: string, khutbahId: string, opts: TranslateOptions): Promise<CostEstimate> {
  const { languages, work } = await collectWork(ctx, tenantId, khutbahId, opts);
  // Hosted edition: report the allowance and leave platform providers out of the estimate when the plan excludes them.
  const ai = ctx.config.isCloud ? await getAiAllowance(ctx, tenantId) : undefined;
  const { providers } = await resolveChain(ctx, tenantId, opts.providerChain, { platformAi: ai ? !platformAiDenied(ai, languages.length, work.length) : true });
  const glossary = await loadGlossary(ctx.db, tenantId);
  let cachedUnits = 0;
  const uniqueParagraphs = new Map<string, Paragraph>();
  for (const w of work) uniqueParagraphs.set(w.paragraph.id, w.paragraph);
  // Cache hits are provider-specific; count against the first provider in the chain.
  const first = providers[0];
  if (first) {
    for (const w of work) {
      const { key } = cacheKey({ text: w.paragraph.textAr, targetLang: w.lang, providerType: first.type, model: null, glossary });
      const hit = await ctx.db.translationCache.findUnique({ where: { key } });
      if (hit) cachedUnits += 1;
    }
  }
  const characters = [...uniqueParagraphs.values()].reduce((n, p) => n + p.textAr.length, 0);
  const perLang = languages.length;
  return {
    characters,
    paragraphs: uniqueParagraphs.size,
    languages: perLang,
    cachedUnits,
    perProvider: providers.map((p) => p.estimateCost({ characters, items: uniqueParagraphs.size, languages: perLang })),
    ai,
  };
}

export async function startJob(ctx: AppContext, tenantId: string, khutbahId: string, opts: TranslateOptions, actor: Actor): Promise<TranslationJob> {
  const { khutbah, languages, work } = await collectWork(ctx, tenantId, khutbahId, opts);
  // Hosted edition: platform providers join the chain only within the mosque's plan; its own providers are never gated.
  const ai = ctx.config.isCloud ? await getAiAllowance(ctx, tenantId) : null;
  const denied = ai ? platformAiDenied(ai, languages.length, work.length) : null;
  const { chain } = await resolveChain(ctx, tenantId, opts.providerChain, { platformAi: !denied });
  if (chain.length === 0) {
    if (denied) throw aiDenied(denied, { plan: ai!.plan, state: ai!.state, maxLanguages: ai!.maxLanguages, remaining: ai!.remainingParagraphs, needed: work.length });
    throw badRequest('No translation providers configured');
  }
  const existing = await ctx.db.translationJob.findFirst({ where: { tenantId, khutbahId, status: { in: ['QUEUED', 'RUNNING'] } } });
  if (existing) throw badRequest('A translation job is already running for this khutbah');
  const job = await ctx.db.translationJob.create({
    data: {
      tenantId,
      khutbahId,
      status: 'QUEUED',
      total: work.length,
      languages,
      providerChain: chain,
      force: !!opts.force,
      paragraphIds: opts.paragraphIds ?? [],
      createdById: actor.id,
    },
  });
  if (khutbah.status === 'DRAFT') await ctx.db.khutbah.update({ where: { id: khutbahId }, data: { status: 'TRANSLATING' } });
  await audit(ctx.db, tenantId, actor, 'translation.job.start', 'TranslationJob', job.id, null, { languages, chain, total: work.length });
  void runJob(ctx, job.id, opts).catch((err) => ctx.log.error({ err, jobId: job.id }, 'translation job crashed'));
  return job;
}

export async function cancelJob(ctx: AppContext, tenantId: string, jobId: string): Promise<TranslationJob> {
  const job = await ctx.db.translationJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) throw notFound('Job');
  running.get(jobId)?.abort();
  if (job.status === 'QUEUED' || job.status === 'RUNNING') {
    return ctx.db.translationJob.update({ where: { id: jobId }, data: { status: 'CANCELLED', finishedAt: new Date() } });
  }
  return job;
}

function emitProgress(ctx: AppContext, tenantId: string, job: TranslationJob) {
  const dto = jobDto(job);
  ctx.io.to(ROOMS.admin(tenantId)).emit('job:progress', {
    id: dto.id,
    khutbahId: dto.khutbahId,
    status: dto.status,
    total: dto.total,
    done: dto.done,
    failed: dto.failed,
    cached: dto.cached,
    error: dto.error,
  });
}

async function runJob(ctx: AppContext, jobId: string, opts: TranslateOptions): Promise<void> {
  const controller = new AbortController();
  running.set(jobId, controller);
  let job = await ctx.db.translationJob.findUniqueOrThrow({ where: { id: jobId } });
  const tenantId = job.tenantId;
  try {
    job = await ctx.db.translationJob.update({ where: { id: jobId }, data: { status: 'RUNNING', startedAt: new Date() } });
    emitProgress(ctx, tenantId, job);
    const { khutbah, work } = await collectWork(ctx, tenantId, job.khutbahId, { ...opts, languages: job.languages, paragraphIds: job.paragraphIds.length ? job.paragraphIds : undefined });
    const ai = ctx.config.isCloud ? await getAiAllowance(ctx, tenantId) : null;
    const { providers, configs } = await resolveChain(ctx, tenantId, job.providerChain as ProviderType[], { platformAi: ai ? ai.allowed : true });
    // Platform-owned providers are metered (hosted edition); a mosque's own providers are not.
    const platformTypes = new Set(configs.filter((c) => c.tenantId === null).map((c) => c.type));
    let quotaLeft = ai?.remainingParagraphs ?? Number.POSITIVE_INFINITY;
    const glossary = await loadGlossary(ctx.db, tenantId);
    const offline = ctx.config.isEdge && !(await isOnline(ctx));
    const tenant = await ctx.db.tenant.findUnique({ where: { id: tenantId } });

    // Group by language; each group goes through the chain in batches.
    const byLang = new Map<string, typeof work>();
    for (const w of work) byLang.set(w.lang, [...(byLang.get(w.lang) ?? []), w]);

    let done = 0;
    let failed = 0;
    let cached = 0;
    const errors: string[] = [];

    for (const [lang, items] of byLang) {
      if (controller.signal.aborted) break;
      // 1) cache
      const toTranslate: typeof items = [];
      for (const w of items) {
        const hit = await lookupCache(ctx, w.paragraph.textAr, lang, providers, glossary);
        if (hit) {
          await saveTranslation(ctx, tenantId, w.paragraph.id, lang, hit.text, hit.providerType, { cached: true }, job.createdById);
          cached += 1;
          done += 1;
        } else toTranslate.push(w);
      }
      job = await ctx.db.translationJob.update({ where: { id: jobId }, data: { done, cached, failed } });
      emitProgress(ctx, tenantId, job);
      if (toTranslate.length === 0) continue;

      // 2) provider chain, in batches of 20 so progress is visible
      for (let i = 0; i < toTranslate.length; i += 20) {
        if (controller.signal.aborted) break;
        const batch = toTranslate.slice(i, i + 20);
        // Hard cap: once the month's platform allowance is gone, the remaining paragraphs fail instead of costing money.
        if (platformTypes.size > 0 && quotaLeft < batch.length && !providers.some((p) => !platformTypes.has(p.type))) {
          failed += batch.length;
          if (!errors.some((e) => e.includes('AI_QUOTA'))) errors.push(`${lang}: platform AI allowance for this month is used up (AI_QUOTA)`);
          job = await ctx.db.translationJob.update({ where: { id: jobId }, data: { done, cached, failed } });
          emitProgress(ctx, tenantId, job);
          continue;
        }
        try {
          const res = await translateWithChain(
            providers,
            {
              items: batch.map((w) => ({ id: w.paragraph.id, text: w.paragraph.textAr, kind: w.paragraph.kind })),
              sourceLang: 'ar',
              targetLang: lang,
              glossary,
              context: { tenantName: tenant?.name, khutbahTitle: khutbah.title, sectionType: batch[0]?.sectionType },
              signal: controller.signal,
            },
            { offline, retries: 1, onAttempt: (a) => ctx.log.info({ jobId, lang, ...a }, 'provider attempt') },
          );
          const metered = new Map<ProviderType, { paragraphs: number; characters: number }>();
          for (const it of res.items) {
            const providerType = res.providerByItem[it.id];
            const model = res.modelByItem[it.id];
            const source = batch.find((w) => w.paragraph.id === it.id)!.paragraph.textAr;
            await saveTranslation(ctx, tenantId, it.id, lang, it.text, providerType, { model }, job.createdById);
            await storeCache(ctx, tenantId, source, lang, providerType, model ?? null, glossary, it.text);
            done += 1;
            if (platformTypes.has(providerType)) {
              const m = metered.get(providerType) ?? { paragraphs: 0, characters: 0 };
              m.paragraphs += 1;
              m.characters += source.length;
              metered.set(providerType, m);
            }
          }
          for (const [providerType, m] of metered) {
            await recordAiUsage(ctx.db, tenantId, { khutbahId: job.khutbahId, lang, source: 'JOB', providerType, ...m });
            quotaLeft -= m.paragraphs;
          }
        } catch (err) {
          if (controller.signal.aborted) break;
          failed += batch.length;
          const msg = err instanceof ProviderChainError ? err.message : (err as Error).message;
          errors.push(`${lang}: ${msg}`);
          ctx.log.warn({ jobId, lang, err: msg }, 'batch failed');
        }
        job = await ctx.db.translationJob.update({ where: { id: jobId }, data: { done, cached, failed } });
        emitProgress(ctx, tenantId, job);
      }
    }

    const status = controller.signal.aborted ? 'CANCELLED' : failed > 0 && done === 0 ? 'FAILED' : 'DONE';
    job = await ctx.db.translationJob.update({
      where: { id: jobId },
      data: { status, done, cached, failed, finishedAt: new Date(), error: errors.length ? errors.slice(0, 5).join(' | ') : null },
    });
    if (status !== 'CANCELLED') {
      await ctx.db.khutbah.updateMany({ where: { id: job.khutbahId, tenantId, status: { in: ['DRAFT', 'TRANSLATING'] } }, data: { status: 'REVIEW' } });
    }
    await notifyKhutbahChanged(ctx, tenantId, job.khutbahId);
    emitProgress(ctx, tenantId, job);
  } catch (err) {
    job = await ctx.db.translationJob.update({ where: { id: jobId }, data: { status: 'FAILED', finishedAt: new Date(), error: (err as Error).message } });
    emitProgress(ctx, tenantId, job);
  } finally {
    running.delete(jobId);
  }
}

async function lookupCache(ctx: AppContext, text: string, lang: string, providers: TranslationProvider[], glossary: GlossaryEntry[]) {
  for (const p of providers) {
    const { key } = cacheKey({ text, targetLang: lang, providerType: p.type, model: null, glossary });
    const hit = await ctx.db.translationCache.findUnique({ where: { key } });
    if (hit) {
      await ctx.db.translationCache.update({ where: { id: hit.id }, data: { hits: { increment: 1 } } });
      return { text: hit.text, providerType: hit.providerType };
    }
  }
  return null;
}

async function storeCache(ctx: AppContext, tenantId: string, text: string, lang: string, providerType: ProviderType, _model: string | null, glossary: GlossaryEntry[], translated: string) {
  const { key, sourceHash } = cacheKey({ text, targetLang: lang, providerType, model: null, glossary });
  await ctx.db.translationCache.upsert({
    where: { key },
    update: { text: translated },
    create: { key, sourceHash, lang, providerType, text: translated, tenantId: glossary.length ? tenantId : null },
  });
}

/** Upsert a translation row (MACHINE status), keep history, record outbox. Used by jobs and the cloud relay. */
export async function saveTranslation(
  ctx: AppContext,
  tenantId: string,
  paragraphId: string,
  lang: string,
  text: string,
  providerType: ProviderType,
  meta: { model?: string; cached?: boolean },
  userId: string | null,
) {
  const existing = await ctx.db.translation.findUnique({ where: { paragraphId_lang: { paragraphId, lang } } });
  const providerMeta = { ...meta } as Prisma.InputJsonValue;
  const row = existing
    ? await ctx.db.translation.update({
        where: { id: existing.id },
        data: { text, status: 'MACHINE', providerType, providerMeta, version: { increment: 1 }, reviewedById: null, approvedById: null, reviewNote: null },
      })
    : await ctx.db.translation.create({ data: { paragraphId, tenantId, lang, text, status: 'MACHINE', providerType, providerMeta } });
  await ctx.db.translationVersion.create({
    data: { translationId: row.id, tenantId, version: row.version, text, status: 'MACHINE', providerType, changedById: userId },
  });
  await outbox(ctx.db, tenantId, 'Translation', row.id, 'UPSERT', row, row.version);
  return row;
}

/** Used by the cloud `/sync/translate` endpoint: translate arbitrary items with the tenant's/global chain (no DB writes). */
export async function translateAdHoc(
  ctx: AppContext,
  tenantId: string,
  items: Array<{ id: string; text: string; kind?: 'TEXT' | 'QURAN' | 'HADITH' }>,
  targetLangs: string[],
  glossary: GlossaryEntry[],
) {
  // The relay spends the cloud's keys, so the mosque's plan decides (edge servers are gated here, not locally).
  const ai = ctx.config.isCloud ? await getAiAllowance(ctx, tenantId) : null;
  const denied = ai ? platformAiDenied(ai, targetLangs.length, items.length * targetLangs.length) : null;
  const { providers, configs } = await resolveChain(ctx, tenantId, undefined, { platformAi: !denied });
  if (providers.length === 0) {
    if (denied) throw aiDenied(denied, { plan: ai!.plan, state: ai!.state, maxLanguages: ai!.maxLanguages, remaining: ai!.remainingParagraphs });
    throw badRequest('No providers configured on the cloud');
  }
  const platformTypes = new Set(configs.filter((c) => c.tenantId === null).map((c) => c.type));
  const results: Record<string, Array<{ id: string; text: string; provider: ProviderType; model?: string }>> = {};
  let costUsd = 0;
  for (const lang of targetLangs) {
    const res = await translateWithChain(providers, { items, sourceLang: 'ar', targetLang: lang, glossary }, { retries: 1 });
    costUsd += res.costUsd;
    results[lang] = res.items.map((i) => ({ id: i.id, text: i.text, provider: res.providerByItem[i.id], model: res.modelByItem[i.id] }));
    if (ai) {
      const metered = new Map<ProviderType, { paragraphs: number; characters: number }>();
      for (const i of res.items) {
        const providerType = res.providerByItem[i.id];
        if (!platformTypes.has(providerType)) continue;
        const m = metered.get(providerType) ?? { paragraphs: 0, characters: 0 };
        m.paragraphs += 1;
        m.characters += items.find((x) => x.id === i.id)?.text.length ?? 0;
        metered.set(providerType, m);
      }
      for (const [providerType, m] of metered) await recordAiUsage(ctx.db, tenantId, { lang, source: 'RELAY', providerType, ...m });
    }
  }
  return { results, costUsd };
}
