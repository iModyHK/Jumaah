import type { FastifyInstance, FastifyRequest } from 'fastify';
import { hashPassword, randomToken, sha256, verifyPassword } from '@jumaah/db';
import { acceptInviteSchema, changePasswordSchema, forgotPasswordSchema, loginSchema, refreshSchema, resetPasswordSchema, type AuthResponse, type AuthUser } from '@jumaah/core';
import { tenantBaseUrlFor } from '../lib/host.js';
import { sendEmailLater } from '../services/email.service.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound, unauthorized } from '../lib/errors.js';
import { signAccessToken } from '../lib/jwt.js';
import { parse } from '../lib/validate.js';

export function actorOf(request: FastifyRequest) {
  const u = request.user;
  // API keys are not users: their audit rows carry the key's name and no user id (the user foreign key would fail).
  return { id: u?.apiKey ? null : (u?.id ?? null), email: u?.email ?? null, ip: request.ip, userAgent: request.headers['user-agent'] ?? null };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.ctx;

  async function issueTokens(user: { id: string; email: string; role: AuthUser['role']; tenantId: string | null; locale: string; name: string; organisationId?: string | null }, request: FastifyRequest, imp?: string): Promise<AuthResponse> {
    const tenant = user.tenantId ? await db.tenant.findUnique({ where: { id: user.tenantId }, select: { slug: true, name: true } }) : null;
    const accessToken = await signAccessToken(config.JWT_SECRET, { sub: user.id, email: user.email, role: user.role, tid: user.tenantId, imp, oid: user.organisationId ?? null }, config.accessTokenTtlSeconds);
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
        organisationId: user.organisationId ?? null,
      },
    };
  }

  app.post('/login', { config: { rateLimit: { max: config.RATE_LIMIT_AUTH, timeWindow: '1 minute' } } }, async (request) => {
    const body = parse(loginSchema, request.body);
    const email = body.email.toLowerCase();
    const candidates = await db.user.findMany({ where: { email, isActive: true }, include: { tenant: true } });
    // Hosted edition: the mosque is implied by the address (alnoor.jumaah.net). A slug in the body must agree with it.
    if (request.hostSlug && body.tenantSlug && body.tenantSlug !== request.hostSlug) throw unauthorized('Invalid credentials');
    const slug = body.tenantSlug ?? request.hostSlug ?? undefined;
    // The same email may exist in several mosques (and as a super admin without a tenant). Without a slug the
    // login is only unambiguous when exactly one account matches; never fall back to "the first one".
    let user = slug ? candidates.find((u) => u.tenant?.slug === slug) : undefined;
    // Super admins have no tenant; on a mosque address they may still sign in to support that mosque.
    if (!user && slug && request.hostSlug) user = candidates.find((u) => !u.tenantId && u.role === 'SUPER_ADMIN');
    if (!user && !slug && candidates.length === 1) user = candidates[0];
    if (!user && !slug && candidates.length > 1) throw badRequest('Multiple accounts use this email; specify tenantSlug');
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
      organisationId: u.organisationId,
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

  // ---- Password reset ----
  const RESET_MINUTES = 60;

  /** Always answers ok: whether the address exists is never revealed. The mosque comes from the address or the body. */
  app.post('/forgot', { config: { rateLimit: { max: config.RATE_LIMIT_AUTH, timeWindow: '1 minute' } } }, async (request) => {
    const body = parse(forgotPasswordSchema, request.body);
    const email = body.email.toLowerCase();
    const slug = request.hostSlug ?? body.tenantSlug ?? null;
    const users = await db.user.findMany({ where: { email, isActive: true, ...(slug ? { tenant: { slug } } : {}) }, include: { tenant: { select: { name: true, slug: true, customDomain: true, customDomainVerifiedAt: true, isActive: true } } } });
    for (const u of users) {
      if (u.tenant && !u.tenant.isActive) continue;
      const token = randomToken(32);
      await db.passwordReset.create({ data: { userId: u.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) } });
      const base = u.tenant ? tenantBaseUrlFor(config, u.tenant) : config.PUBLIC_BASE_URL.replace(/\/$/, '');
      sendEmailLater(app.ctx, { to: u.email, locale: u.locale === 'en' ? 'en' : 'ar', template: 'passwordReset', tenantId: u.tenantId, data: { name: u.name, resetUrl: `${base}/admin/reset/${token}`, mosqueName: u.tenant?.name ?? null, expiresMinutes: RESET_MINUTES } });
      await audit(db, u.tenantId, { id: null, ip: request.ip }, 'auth.password.forgot', 'User', u.id);
    }
    return { ok: true };
  });

  app.get('/reset/:token', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const token = (request.params as { token: string }).token;
    const row = await db.passwordReset.findUnique({ where: { tokenHash: sha256(token) }, include: { user: { include: { tenant: { select: { name: true, slug: true } } } } } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw notFound('Reset link');
    return { email: row.user.email, tenant: row.user.tenant };
  });

  app.post('/reset', { config: { rateLimit: { max: config.RATE_LIMIT_AUTH, timeWindow: '1 minute' } } }, async (request) => {
    const body = parse(resetPasswordSchema, request.body);
    const row = await db.passwordReset.findUnique({ where: { tokenHash: sha256(body.token) }, include: { user: true } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw notFound('Reset link');
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(body.password) } });
      await tx.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      await tx.passwordReset.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } });
      await tx.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    await audit(db, row.user.tenantId, { id: row.userId, ip: request.ip }, 'auth.password.reset', 'User', row.userId);
    return { ok: true };
  });
}
