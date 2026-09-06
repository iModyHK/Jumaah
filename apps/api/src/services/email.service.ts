/**
 * Outgoing email over SMTP (settings from the portal or SMTP_* in the environment). Every send is recorded in
 * EmailLog; without SMTP configured the message is logged as SKIPPED so nothing else breaks. Sends run in the
 * background: callers never wait for the mail server.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import type { AppContext } from '../lib/context.js';
import { renderTemplate, type Locale, type TemplateData, type TemplateName } from './email-templates.js';
import { platformConfig, type PlatformConfig } from './platform-config.service.js';

export interface MailTransport {
  sendMail(msg: { from: string; to: string; replyTo?: string; subject: string; text: string; html: string }): Promise<unknown>;
}

let cached: { key: string; transport: Transporter } | null = null;

function transportFor(email: PlatformConfig['email']): Transporter | null {
  if (!email.host || !email.fromEmail) return null;
  const key = JSON.stringify([email.host, email.port, email.secure, email.user, email.pass]);
  if (cached && cached.key === key) return cached.transport;
  const transport = nodemailer.createTransport({
    host: email.host,
    port: email.port,
    secure: email.secure,
    auth: email.user ? { user: email.user, pass: email.pass ?? '' } : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });
  cached = { key, transport };
  return transport;
}

export function emailConfigured(email: PlatformConfig['email']): boolean {
  return !!(email.host && email.fromEmail);
}

export interface SendOptions<K extends TemplateName> {
  to: string;
  locale: Locale;
  template: K;
  data: TemplateData[K];
  tenantId?: string | null;
  /** Injected in tests. */
  transport?: MailTransport | null;
}

/** Render and send one message; returns the log row's status. */
export async function sendEmail<K extends TemplateName>(ctx: AppContext, opts: SendOptions<K>): Promise<'SENT' | 'SKIPPED' | 'FAILED'> {
  const cfg = await platformConfig(ctx);
  const rendered = renderTemplate(opts.template, opts.locale, opts.data);
  const transport = opts.transport === undefined ? transportFor(cfg.email) : opts.transport;
  const to = opts.to.trim().toLowerCase();
  const log = (status: 'SENT' | 'SKIPPED' | 'FAILED', error: string | null) =>
    ctx.db.emailLog.create({ data: { to, subject: rendered.subject, template: opts.template, tenantId: opts.tenantId ?? null, status, error } }).catch(() => undefined);
  if (!transport || !cfg.email.fromEmail) {
    await log('SKIPPED', 'SMTP not configured');
    return 'SKIPPED';
  }
  try {
    await transport.sendMail({
      from: cfg.email.fromName ? `"${cfg.email.fromName.replace(/"/g, '')}" <${cfg.email.fromEmail}>` : cfg.email.fromEmail,
      to,
      replyTo: cfg.email.replyTo ?? undefined,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    await log('SENT', null);
    return 'SENT';
  } catch (err) {
    const message = (err as Error).message.slice(0, 300);
    ctx.log.warn({ err: message, to, template: opts.template }, 'email failed');
    await log('FAILED', message);
    return 'FAILED';
  }
}

/** Fire-and-forget variant for request handlers. */
export function sendEmailLater<K extends TemplateName>(ctx: AppContext, opts: SendOptions<K>): void {
  sendEmail(ctx, opts).catch((err) => ctx.log.warn({ err }, 'email send crashed'));
}

/** Addresses that should hear about a mosque's invoices: its billing email, else every active mosque admin. */
export async function billingRecipients(ctx: AppContext, tenantId: string): Promise<Array<{ to: string; locale: Locale }>> {
  const t = await ctx.db.tenant.findUnique({ where: { id: tenantId }, select: { billingEmail: true, locale: true, users: { where: { role: 'MOSQUE_ADMIN', isActive: true }, select: { email: true, locale: true } } } });
  if (!t) return [];
  const locale = (t.locale === 'en' ? 'en' : 'ar') as Locale;
  if (t.billingEmail) return [{ to: t.billingEmail, locale }];
  return t.users.map((u) => ({ to: u.email, locale: (u.locale === 'en' ? 'en' : 'ar') as Locale }));
}

export async function organisationRecipients(ctx: AppContext, organisationId: string): Promise<Array<{ to: string; locale: Locale }>> {
  const o = await ctx.db.organisation.findUnique({ where: { id: organisationId }, select: { billingEmail: true, admins: { where: { isActive: true }, select: { email: true, locale: true } } } });
  if (!o) return [];
  if (o.billingEmail) return [{ to: o.billingEmail, locale: 'ar' }];
  return o.admins.map((u) => ({ to: u.email, locale: (u.locale === 'en' ? 'en' : 'ar') as Locale }));
}
