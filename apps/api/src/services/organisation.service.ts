/**
 * Organisation accounts (hosted edition): one login managing several mosques. Member mosques carry the ENTERPRISE
 * plan; an organisation admin (a MOSQUE_ADMIN whose user row names the organisation) may target any member mosque
 * with the x-tenant-id header, exactly as a super admin does, but only inside the organisation.
 */
import type { Db } from '@jumaah/db';
import type { OrganisationDto } from '@jumaah/shared';
import type { AppContext } from '../lib/context.js';

const CACHE_TTL_S = 60;
const membersKey = (organisationId: string) => `org:members:${organisationId}`;

/** Ids of the mosques in an organisation (cached a minute; invalidated on membership changes). */
export async function organisationTenantIds(ctx: AppContext, organisationId: string): Promise<string[]> {
  const key = membersKey(organisationId);
  try {
    const cached = await ctx.redis.get(key);
    if (cached) return JSON.parse(cached) as string[];
  } catch {
    /* fall through */
  }
  const rows = await ctx.db.tenant.findMany({ where: { organisationId }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  await ctx.redis.set(key, JSON.stringify(ids), 'EX', CACHE_TTL_S).catch(() => undefined);
  return ids;
}

export async function forgetOrganisationMembers(ctx: AppContext, organisationId: string): Promise<void> {
  await ctx.redis.del(membersKey(organisationId)).catch(() => undefined);
}

export async function tenantInOrganisation(ctx: AppContext, tenantId: string, organisationId: string): Promise<boolean> {
  return (await organisationTenantIds(ctx, organisationId)).includes(tenantId);
}

const ORG_INCLUDE = {
  tenants: { orderBy: { name: 'asc' as const }, select: { id: true, name: true, slug: true, plan: true, subscriptionStatus: true, subscriptionEndsAt: true, customDomain: true, isActive: true } },
  admins: { orderBy: { email: 'asc' as const }, select: { id: true, email: true, name: true, tenantId: true } },
};

export async function organisationDto(db: Db, id: string): Promise<OrganisationDto | null> {
  const o = await db.organisation.findUnique({ where: { id }, include: ORG_INCLUDE });
  if (!o) return null;
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    maxTenants: o.maxTenants,
    createdAt: o.createdAt.toISOString(),
    tenants: o.tenants.map((t) => ({ ...t, subscriptionEndsAt: t.subscriptionEndsAt?.toISOString() ?? null })),
    admins: o.admins,
  };
}

export async function listOrganisations(db: Db): Promise<OrganisationDto[]> {
  const rows = await db.organisation.findMany({ orderBy: { name: 'asc' }, include: ORG_INCLUDE });
  return rows.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    maxTenants: o.maxTenants,
    createdAt: o.createdAt.toISOString(),
    tenants: o.tenants.map((t) => ({ ...t, subscriptionEndsAt: t.subscriptionEndsAt?.toISOString() ?? null })),
    admins: o.admins,
  }));
}
