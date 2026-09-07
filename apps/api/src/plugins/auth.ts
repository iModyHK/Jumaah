import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import type { AppContext, RequestUser } from '../lib/context.js';

/** What the liveness cache remembers about a user for a minute: still allowed in, plus what an extension attached. */
interface Liveness {
  ok: boolean;
  ext: Record<string, unknown> | null;
}

const livenessKey = (userId: string) => `auth:user:${userId}`;

/** Drop the cached liveness of users whose rights just changed (account disabled, extension data changed). */
export async function forgetUserAuth(ctx: AppContext, userIds: string[]): Promise<void> {
  if (userIds.length) await ctx.redis.del(...userIds.map(livenessKey)).catch(() => undefined);
}

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', null);
  app.decorateRequest('tenantId', '');

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    const { hooks } = app.ctx;
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (request.query as { token?: string })?.token;
    if (!token) throw unauthorized('Missing token');

    // Tokens that are not JWTs (API keys) are an extension's business.
    const viaExtension = await hooks.authenticateToken?.(request, token);
    if (viaExtension) {
      request.user = viaExtension.user;
      request.tenantId = viaExtension.tenantId;
      return;
    }

    let claims;
    try {
      claims = await verifyAccessToken(app.ctx.config.JWT_SECRET, token);
    } catch {
      throw unauthorized('Invalid or expired token');
    }
    const user: RequestUser = { id: claims.sub, email: claims.email, role: claims.role, tenantId: claims.tid, impersonating: !!claims.imp, ext: claims.ext };
    request.user = user;

    // Cheap liveness check (disabled user / suspended mosque) cached in Redis for 60s. An extension may answer it
    // instead and attach data (which organisation the user administers) so rights follow the database, not the token.
    const cacheKey = livenessKey(user.id);
    const cached = await app.ctx.redis.get(cacheKey);
    let live: Liveness;
    if (cached === null) {
      const viaHook = await hooks.liveness?.(app.ctx, user.id);
      if (viaHook) live = { ok: viaHook.ok, ext: viaHook.ext ?? null };
      else {
        const dbUser = await app.ctx.db.user.findUnique({ where: { id: user.id }, select: { isActive: true, tenant: { select: { isActive: true } } } });
        live = { ok: !!dbUser?.isActive && (dbUser.tenant ? dbUser.tenant.isActive : true), ext: null };
      }
      await app.ctx.redis.set(cacheKey, JSON.stringify(live), 'EX', 60);
    } else if (cached === '0' || cached === '1') {
      live = { ok: cached === '1', ext: null }; // value written by an older API build
    } else {
      const parsed = JSON.parse(cached) as { ok: boolean; ext?: Record<string, unknown> | null; oid?: string | null };
      live = { ok: !!parsed.ok, ext: parsed.ext ?? (parsed.oid !== undefined ? { organisationId: parsed.oid } : null) };
    }
    if (!live.ok) throw unauthorized('Account disabled');
    if (live.ext) user.ext = { ...(user.ext ?? {}), ...live.ext };

    // Tenant resolution: regular users are bound to their mosque; super admins may target any mosque; an extension
    // may let some users switch to another mosque (organisation admins).
    const hdr = request.headers['x-tenant-id'];
    if (user.role === 'SUPER_ADMIN') {
      const q = (request.query as { tenantId?: string })?.tenantId;
      request.tenantId = (typeof hdr === 'string' && hdr) || q || user.tenantId || '';
    } else {
      if (!user.tenantId) throw forbidden('User has no tenant');
      if (typeof hdr === 'string' && hdr && hdr !== user.tenantId) {
        // An extension may allow the switch (organisation admins) or refuse it; users without such a right stay on
        // their own mosque, whatever the header says.
        request.tenantId = (await hooks.switchTenant?.(request, user, hdr)) ?? user.tenantId;
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
