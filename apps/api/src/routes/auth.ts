import type { FastifyInstance, FastifyRequest } from 'fastify';
import { hashPassword, randomToken, sha256, verifyPassword } from '@jumaah/db';
import { acceptInviteSchema, changePasswordSchema, loginSchema, refreshSchema, type AuthResponse, type AuthUser } from '@jumaah/shared';
import { audit } from '../lib/audit.js';
import { badRequest, notFound, unauthorized } from '../lib/errors.js';
import { signAccessToken } from '../lib/jwt.js';
import { parse } from '../lib/validate.js';

export function actorOf(request: FastifyRequest) {
  return { id: request.user?.id ?? null, email: request.user?.email ?? null, ip: request.ip, userAgent: request.headers['user-agent'] ?? null };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.ctx;

  async function issueTokens(user: { id: string; email: string; role: AuthUser['role']; tenantId: string | null; locale: string; name: string }, request: FastifyRequest, imp?: string): Promise<AuthResponse> {
    const tenant = user.tenantId ? await db.tenant.findUnique({ where: { id: user.tenantId }, select: { slug: true, name: true } }) : null;
    const accessToken = await signAccessToken(config.JWT_SECRET, { sub: user.id, email: user.email, role: user.role, tid: user.tenantId, imp }, config.accessTokenTtlSeconds);
    const refresh = randomToken(48);
    await db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refresh),
        expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86400000),
        userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
        ip: request.ip,
      },
    });
    return {
      accessToken,
      refreshToken: refresh,
      expiresIn: config.accessTokenTtlSeconds,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenantSlug: tenant?.slug ?? null,
        tenantName: tenant?.name ?? null,
        locale: user.locale as 'ar' | 'en',
      },
    };
  }

  app.post('/login', { config: { rateLimit: { max: config.RATE_LIMIT_AUTH, timeWindow: '1 minute' } } }, async (request) => {
    const body = parse(loginSchema, request.body);
    const email = body.email.toLowerCase();
    const candidates = await db.user.findMany({ where: { email, isActive: true }, include: { tenant: true } });
    // The same email may exist in several mosques (and as a super admin without a tenant). Without a slug the
    // login is only unambiguous when exactly one account matches; never fall back to "the first one".
    let user = body.tenantSlug ? candidates.find((u) => u.tenant?.slug === body.tenantSlug) : undefined;
    if (!user && !body.tenantSlug && candidates.length === 1) user = candidates[0];
    if (!user && !body.tenantSlug && candidates.length > 1) throw badRequest('Multiple accounts use this email; specify tenantSlug');
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      await audit(db, null, { id: null, ip: request.ip }, 'auth.login.failed', 'User', null, null, { email });
      throw unauthorized('Invalid credentials');
    }
    if (user.tenant && (!user.tenant.isActive || user.tenant.subscriptionStatus === 'SUSPENDED')) throw unauthorized('Tenant suspended');
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(db, user.tenantId, { id: user.id, ip: request.ip }, 'auth.login', 'User', user.id);
    return issueTokens(user, request);
  });

  app.post('/refresh', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request) => {
    const { refreshToken } = parse(refreshSchema, request.body);
    const row = await db.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) }, include: { user: true } });
    if (!row || row.revokedAt || row.expiresAt < new Date() || !row.user.isActive) throw unauthorized('Invalid refresh token');
    await db.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return issueTokens(row.user, request);
  });

  app.post('/logout', async (request) => {
    const { refreshToken } = parse(refreshSchema, request.body);
    await db.refreshToken.updateMany({ where: { tokenHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  });

  app.get('/me', { preHandler: app.authenticate }, async (request) => {
    const u = await db.user.findUnique({ where: { id: request.user!.id }, include: { tenant: { select: { slug: true, name: true, locale: true } } } });
    if (!u) throw notFound('User');
    const me: AuthUser = {
      id: u.id,
      email: u.email,
      name: u.name,
      role: request.user!.role,
      tenantId: request.tenantId || u.tenantId,
      tenantSlug: u.tenant?.slug ?? null,
      tenantName: u.tenant?.name ?? null,
      locale: u.locale as 'ar' | 'en',
    };
    return me;
  });

  app.post('/change-password', { preHandler: app.authenticate }, async (request) => {
    const body = parse(changePasswordSchema, request.body);
    const u = await db.user.findUniqueOrThrow({ where: { id: request.user!.id } });
    if (!(await verifyPassword(body.currentPassword, u.passwordHash))) throw unauthorized('Current password is wrong');
    await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
    await db.refreshToken.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(db, u.tenantId, actorOf(request), 'auth.password.change', 'User', u.id);
    return { ok: true };
  });

  app.patch('/locale', { preHandler: app.authenticate }, async (request) => {
    const locale = (request.body as { locale?: string })?.locale;
    if (locale !== 'ar' && locale !== 'en') throw badRequest('locale must be ar|en');
    await db.user.update({ where: { id: request.user!.id }, data: { locale } });
    return { ok: true };
  });

  app.get('/invite/:token', async (request) => {
    const token = (request.params as { token: string }).token;
    const inv = await db.invitation.findUnique({ where: { tokenHash: sha256(token) }, include: { tenant: { select: { name: true, slug: true } } } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw notFound('Invitation');
    return { email: inv.email, name: inv.name, role: inv.role, tenant: inv.tenant };
  });

  app.post('/accept-invite', { config: { rateLimit: { max: config.RATE_LIMIT_AUTH, timeWindow: '1 minute' } } }, async (request) => {
    const body = parse(acceptInviteSchema, request.body);
    const inv = await db.invitation.findUnique({ where: { tokenHash: sha256(body.token) } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw notFound('Invitation');
    const user = await db.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { tenantId_email: { tenantId: inv.tenantId, email: inv.email } } });
      const u = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { name: body.name, passwordHash: await hashPassword(body.password), role: inv.role, isActive: true } })
        : await tx.user.create({ data: { tenantId: inv.tenantId, email: inv.email, name: body.name, role: inv.role, passwordHash: await hashPassword(body.password) } });
      await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
      return u;
    });
    await audit(db, inv.tenantId, { id: user.id, ip: request.ip }, 'auth.invite.accept', 'User', user.id);
    return issueTokens(user, request);
  });
}
