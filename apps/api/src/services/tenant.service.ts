/**
 * Creating a mosque (tenant) with its first admin: used by the super admin's console (and by an extension's public
 * sign-up). Extensions may add columns (a plan, a sync key) through the tenantCreateData hook.
 */
import { hashPassword, randomToken } from '@jumaah/db';
import { audit, type Actor } from '../lib/audit.js';
import type { AppContext } from '../lib/context.js';
import { conflict } from '../lib/errors.js';
import { RESERVED_SLUGS } from '../lib/host.js';

export interface CreateTenantInput {
  name: string;
  slug: string;
  timezone: string;
  locale: 'ar' | 'en';
  /** Extension fields (plan, cycle, …) travel through to the tenantCreateData hook. */
  [extra: string]: unknown;
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
  if (RESERVED_SLUGS.has(slug) || ctx.hooks.reservedSlugs?.has(slug) || slug.startsWith('jumaah')) return 'reserved';
  return null;
}

export async function createTenantWithAdmin(ctx: AppContext, input: CreateTenantInput, actor: Actor, action: 'tenant.create' | 'tenant.signup' = 'tenant.create') {
  const problem = await slugProblem(ctx, input.slug);
  if (problem === 'taken') throw conflict('Slug already used', { code: 'SLUG_TAKEN' });
  if (problem) throw conflict('This address cannot be used', { code: problem === 'reserved' ? 'SLUG_RESERVED' : 'SLUG_INVALID' });
  const password = input.adminPassword ?? randomToken(9);
  const extra = ctx.hooks.tenantCreateData?.(input) ?? { data: {} };
  const tenant = await ctx.db.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        timezone: input.timezone,
        locale: input.locale,
        ...(extra.data as object),
        languages: { create: input.languages.map((code, i) => ({ code, order: i })) },
      },
      include: { languages: true },
    });
    await tx.user.create({ data: { tenantId: t.id, email: input.adminEmail.toLowerCase(), name: input.adminName, role: 'MOSQUE_ADMIN', passwordHash: await hashPassword(password) } });
    return t;
  });
  await ctx.hooks.afterTenantCreate?.(ctx, tenant);
  await audit(ctx.db, tenant.id, actor, action, 'Tenant', tenant.id, null, { name: tenant.name, slug: tenant.slug, ...(extra.data as object) });
  return { tenant, password, generatedPassword: !input.adminPassword, secrets: extra.secrets ?? {} };
}
