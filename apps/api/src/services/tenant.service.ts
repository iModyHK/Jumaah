/**
 * Creating a mosque (tenant) with its first admin: used by the super admin's console and by the public sign-up of
 * the hosted edition. Every new mosque starts a 30-day trial of the chosen plan.
 */
import { hashPassword, randomToken, sha256 } from '@jumaah/db';
import { TRIAL_DAYS, type BillingCycle, type SubscriptionPlan } from '@jumaah/core';
import { audit, type Actor } from '../lib/audit.js';
import type { AppContext } from '../lib/context.js';
import { conflict } from '../lib/errors.js';
import { RESERVED_HOST_LABELS } from '../lib/host.js';

export interface CreateTenantInput {
  name: string;
  slug: string;
  timezone: string;
  locale: 'ar' | 'en';
  plan: SubscriptionPlan;
  cycle?: BillingCycle;
  adminEmail: string;
  adminName: string;
  /** Generated when omitted (the super admin console shows it once). */
  adminPassword?: string;
  languages: string[];
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

/** Why a slug cannot be used, or null when it can. */
export async function slugProblem(ctx: AppContext, slug: string): Promise<'invalid' | 'reserved' | 'taken' | null> {
  if (!SLUG_RE.test(slug)) return 'invalid';
  // An existing mosque wins over the reserved list, so "my mosque" lookups find every real address.
  if (await ctx.db.tenant.findUnique({ where: { slug }, select: { id: true } })) return 'taken';
  if (RESERVED_HOST_LABELS.has(slug) || slug.startsWith('jumaah')) return 'reserved';
  return null;
}

export async function createTenantWithAdmin(ctx: AppContext, input: CreateTenantInput, actor: Actor, action: 'tenant.create' | 'tenant.signup' = 'tenant.create') {
  const problem = await slugProblem(ctx, input.slug);
  if (problem === 'taken') throw conflict('Slug already used', { code: 'SLUG_TAKEN' });
  if (problem) throw conflict('This address cannot be used', { code: problem === 'reserved' ? 'SLUG_RESERVED' : 'SLUG_INVALID' });
  const syncKey = randomToken(24);
  const password = input.adminPassword ?? randomToken(9);
  const tenant = await ctx.db.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        timezone: input.timezone,
        locale: input.locale,
        // Hosted edition: every new mosque gets a 30-day trial of the chosen plan; billing takes over afterwards.
        plan: input.plan,
        subscriptionStatus: 'TRIAL',
        subscriptionEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
        billingCycle: input.cycle ?? 'MONTHLY',
        syncKeyHash: sha256(syncKey),
        languages: { create: input.languages.map((code, i) => ({ code, order: i })) },
      },
      include: { languages: true },
    });
    await tx.user.create({ data: { tenantId: t.id, email: input.adminEmail.toLowerCase(), name: input.adminName, role: 'MOSQUE_ADMIN', passwordHash: await hashPassword(password) } });
    await tx.syncState.create({ data: { tenantId: t.id, deviceId: 'cloud' } });
    return t;
  });
  await audit(ctx.db, tenant.id, actor, action, 'Tenant', tenant.id, null, { name: tenant.name, slug: tenant.slug, plan: tenant.plan });
  return { tenant, syncKey, password, generatedPassword: !input.adminPassword };
}
