import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import type { RequestUser } from '../lib/context.js';

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
    const user: RequestUser = { id: claims.sub, email: claims.email, role: claims.role, tenantId: claims.tid, impersonating: !!claims.imp };
    request.user = user;

    // Tenant resolution: regular users are bound to their tenant; super admins may target any tenant.
    if (user.role === 'SUPER_ADMIN') {
      const hdr = request.headers['x-tenant-id'];
      const q = (request.query as { tenantId?: string })?.tenantId;
      request.tenantId = (typeof hdr === 'string' && hdr) || q || user.tenantId || '';
    } else {
      if (!user.tenantId) throw forbidden('User has no tenant');
      request.tenantId = user.tenantId;
    }

    // Cheap liveness check (suspended user / tenant) cached in Redis for 60s.
    const cacheKey = `auth:user:${user.id}`;
    const cached = await app.ctx.redis.get(cacheKey);
    if (cached === '0') throw unauthorized('Account disabled');
    if (cached === null) {
      const dbUser = await app.ctx.db.user.findUnique({ where: { id: user.id }, select: { isActive: true, tenant: { select: { isActive: true, subscriptionStatus: true } } } });
      const ok = !!dbUser?.isActive && (dbUser.tenant ? dbUser.tenant.isActive && dbUser.tenant.subscriptionStatus !== 'SUSPENDED' : true);
      await app.ctx.redis.set(cacheKey, ok ? '1' : '0', 'EX', 60);
      if (!ok) throw unauthorized('Account disabled');
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
