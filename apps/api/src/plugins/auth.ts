import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import type { AppContext, RequestUser } from '../lib/context.js';
import { tenantInOrganisation } from '../services/organisation.service.js';

/** What the liveness cache remembers about a user for a minute: still allowed in, and which organisation they administer. */
interface Liveness {
  ok: boolean;
  oid: string | null;
}

const livenessKey = (userId: string) => `auth:user:${userId}`;

/** Drop the cached liveness of users whose rights just changed (organisation admin added/removed, account disabled). */
export async function forgetUserAuth(ctx: AppContext, userIds: string[]): Promise<void> {
  if (userIds.length) await ctx.redis.del(...userIds.map(livenessKey)).catch(() => undefined);
}

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', null);
  app.decorateRequest('tenantId', '');

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (request.query as { token?: string })?.token;
    if (!token) throw unauthorized('Missing token');
    let claims;
    try {
      claims = await verifyAccessToken(app.ctx.config.JWT_SECRET, token);
    } catch {
      throw unauthorized('Invalid or expired token');
    }
    const user: RequestUser = { id: claims.sub, email: claims.email, role: claims.role, tenantId: claims.tid, impersonating: !!claims.imp, organisationId: claims.oid ?? null };
    request.user = user;

    // Cheap liveness check (suspended user / tenant) cached in Redis for 60s. The same lookup tells us which
    // organisation the user administers right now, so organisation rights follow the database, not the token.
    const cacheKey = livenessKey(user.id);
    const cached = await app.ctx.redis.get(cacheKey);
    let live: Liveness;
    if (cached === null) {
      const dbUser = await app.ctx.db.user.findUnique({ where: { id: user.id }, select: { isActive: true, organisationId: true, tenant: { select: { isActive: true, subscriptionStatus: true } } } });
      const ok = !!dbUser?.isActive && (dbUser.tenant ? dbUser.tenant.isActive && dbUser.tenant.subscriptionStatus !== 'SUSPENDED' : true);
      live = { ok, oid: ok ? (dbUser?.organisationId ?? null) : null };
      await app.ctx.redis.set(cacheKey, JSON.stringify(live), 'EX', 60);
    } else if (cached === '0' || cached === '1') {
      // value written by an older API build
      live = { ok: cached === '1', oid: user.organisationId ?? null };
    } else {
      live = JSON.parse(cached) as Liveness;
    }
    if (!live.ok) throw unauthorized('Account disabled');
    user.organisationId = live.oid;

    // Tenant resolution: regular users are bound to their tenant; super admins may target any tenant; organisation
    // admins may target any mosque of their organisation (hosted edition).
    const hdr = request.headers['x-tenant-id'];
    if (user.role === 'SUPER_ADMIN') {
      const q = (request.query as { tenantId?: string })?.tenantId;
      request.tenantId = (typeof hdr === 'string' && hdr) || q || user.tenantId || '';
    } else {
      if (!user.tenantId) throw forbidden('User has no tenant');
      if (user.organisationId && typeof hdr === 'string' && hdr && hdr !== user.tenantId) {
        if (!(await tenantInOrganisation(app.ctx, hdr, user.organisationId))) throw forbidden('Mosque is not in your organisation');
        request.tenantId = hdr;
      } else {
        request.tenantId = user.tenantId;
      }
    }
  });

  app.decorate('requireRole', (...roles: RequestUser['role'][]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await app.authenticate(request, reply);
      const u = request.user!;
      if (u.role === 'SUPER_ADMIN') {
        if (!request.tenantId && !roles.includes('SUPER_ADMIN')) throw forbidden('x-tenant-id header required');
        return;
      }
      if (!roles.includes(u.role)) throw forbidden(`Requires role: ${roles.join(' | ')}`);
    };
  });
}

// Share the decorators with sibling plugins (equivalent to wrapping with fastify-plugin).
(authPlugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export const ADMIN_ROLES = ['SUPER_ADMIN', 'MOSQUE_ADMIN'] as const;
export const EDITOR_ROLES = ['SUPER_ADMIN', 'MOSQUE_ADMIN', 'TRANSLATOR'] as const;
export const ALL_STAFF = ['SUPER_ADMIN', 'MOSQUE_ADMIN', 'TRANSLATOR', 'IMAM'] as const;
