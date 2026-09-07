/**
 * Hosted-edition plans: whether a mosque may use the platform's AI providers, and how much it has used this month.
 *
 * Scope, deliberately narrow: only providers owned by the platform (ProviderConfig.tenantId = null) on a cloud server are
 * gated. A mosque's own keys, and every self-hosted (community) server, are never limited. Edge servers that relay to
 * the cloud are gated on the cloud side, where the platform keys live.
 */
import type { CloudDb as Db, ProviderType } from '@jumaah/cloud-db';
import { AI_GRACE_DAYS, PLAN_LIMITS, type AiAllowanceDto, type AiDenyReason, type SubscriptionPlan, type SubscriptionStatus } from '@jumaah/cloud-shared';
import type { CloudContext as AppContext } from '../context.js';
import { HttpError } from '@jumaah/api';

export interface SubscriptionLike {
  plan: SubscriptionPlan | string;
  subscriptionStatus: SubscriptionStatus | string;
  subscriptionEndsAt: Date | null;
}

/** Calendar month the counters refer to, in UTC. */
export function monthKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function graceEndsAt(endsAt: Date | null): Date | null {
  return endsAt ? new Date(endsAt.getTime() + AI_GRACE_DAYS * 86_400_000) : null;
}

/** active = paid or on trial; grace = ended within the grace window; expired / suspended = AI off. */
export function subscriptionState(t: SubscriptionLike, now: Date = new Date()): AiAllowanceDto['state'] {
  if (t.subscriptionStatus === 'SUSPENDED') return 'suspended';
  const ends = t.subscriptionEndsAt;
  if (!ends) return t.subscriptionStatus === 'PAST_DUE' ? 'grace' : 'active';
  if (now < ends) return 'active';
  const grace = graceEndsAt(ends)!;
  return now < grace ? 'grace' : 'expired';
}

export function limitsOf(plan: string) {
  return PLAN_LIMITS[(plan in PLAN_LIMITS ? plan : 'FREE') as SubscriptionPlan];
}

/** Pure decision from a tenant row and this month's usage; exported for tests. */
export function allowanceOf(t: SubscriptionLike, usedParagraphs: number, applies: boolean, now: Date = new Date()): AiAllowanceDto {
  const plan = (t.plan in PLAN_LIMITS ? t.plan : 'FREE') as SubscriptionPlan;
  const limits = limitsOf(plan);
  const state = subscriptionState(t, now);
  const remaining = limits.monthlyParagraphs === null ? null : Math.max(0, limits.monthlyParagraphs - usedParagraphs);
  let reason: AiDenyReason | null = null;
  if (!limits.ai) reason = 'NOT_INCLUDED';
  else if (state === 'suspended') reason = 'SUSPENDED';
  else if (state === 'expired') reason = 'EXPIRED';
  else if (remaining !== null && remaining <= 0) reason = 'QUOTA';
  return {
    applies,
    plan,
    status: t.subscriptionStatus as SubscriptionStatus,
    state,
    aiIncluded: limits.ai,
    maxLanguages: limits.maxLanguages,
    monthlyParagraphs: limits.monthlyParagraphs,
    usedParagraphs,
    remainingParagraphs: remaining,
    month: monthKey(now),
    endsAt: t.subscriptionEndsAt?.toISOString() ?? null,
    graceEndsAt: graceEndsAt(t.subscriptionEndsAt)?.toISOString() ?? null,
    allowed: !applies || reason === null,
    reason: applies ? reason : null,
  };
}

/**
 * Paragraphs translated by platform AI this month. For a mosque inside an organisation the allowance is pooled, so
 * the usage of every member mosque counts.
 */
export async function usedThisMonth(db: Db, tenantId: string, month = monthKey(), organisationId: string | null = null): Promise<number> {
  const where = organisationId ? { month, tenant: { organisationId } } : { tenantId, month };
  const agg = await db.aiUsage.aggregate({ where, _sum: { paragraphs: true } });
  return agg._sum.paragraphs ?? 0;
}

/** The mosque's allowance right now. On self-hosted servers `applies` is false and everything is allowed. */
export async function getAiAllowance(ctx: AppContext, tenantId: string): Promise<AiAllowanceDto> {
  const tenant = await ctx.db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { plan: true, subscriptionStatus: true, subscriptionEndsAt: true, organisationId: true } });
  const applies = ctx.config.isCloud;
  const used = applies ? await usedThisMonth(ctx.db, tenantId, monthKey(), tenant.organisationId) : 0;
  return allowanceOf(tenant, used, applies);
}

const MESSAGES: Record<AiDenyReason, string> = {
  NOT_INCLUDED: 'Machine translation is not included in this plan',
  EXPIRED: 'The subscription has expired; machine translation is switched off',
  SUSPENDED: 'The subscription is suspended',
  QUOTA: "This month's machine translation allowance is used up",
  LANGUAGES: 'The plan allows fewer AI languages than requested',
};

export function aiDenied(reason: AiDenyReason, details?: unknown): HttpError {
  return new HttpError(403, `AI_${reason}`, MESSAGES[reason], details);
}

/**
 * Throws when a job that would use platform AI is not allowed: plan without AI, ended or suspended subscription,
 * more languages than the plan permits, or not enough allowance left for the paragraphs requested.
 */
export function assertAiAllowed(a: AiAllowanceDto, languages: number, paragraphs: number): void {
  const reason = platformAiDenied(a, languages, paragraphs);
  if (!reason) return;
  if (reason === 'LANGUAGES') throw aiDenied(reason, { maxLanguages: a.maxLanguages, requested: languages });
  if (reason === 'QUOTA') throw aiDenied(reason, { needed: paragraphs, remaining: a.remainingParagraphs, monthlyParagraphs: a.monthlyParagraphs });
  throw aiDenied(reason, { plan: a.plan, state: a.state });
}

/**
 * Why a job of this size may not use platform AI, or null when it may. Used to decide whether platform providers
 * join the chain at all: a mosque with its own providers keeps translating through them whatever its plan says.
 */
export function platformAiDenied(a: AiAllowanceDto, languages: number, paragraphs: number): AiDenyReason | null {
  if (!a.applies) return null;
  if (!a.allowed) return a.reason;
  if (a.maxLanguages !== null && languages > a.maxLanguages) return 'LANGUAGES';
  if (a.remainingParagraphs !== null && paragraphs > a.remainingParagraphs) return 'QUOTA';
  return null;
}

export async function recordAiUsage(
  db: Db,
  tenantId: string,
  u: { khutbahId?: string | null; lang: string; source: 'JOB' | 'RELAY'; providerType: ProviderType; paragraphs: number; characters: number },
): Promise<void> {
  if (u.paragraphs <= 0) return;
  await db.aiUsage.create({ data: { tenantId, month: monthKey(), khutbahId: u.khutbahId ?? null, lang: u.lang, source: u.source, providerType: u.providerType, paragraphs: u.paragraphs, characters: u.characters } });
}
