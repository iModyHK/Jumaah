/**
 * Outgoing email over SMTP (SMTP_* in the environment, or whatever the emailConfig hook supplies). Every send is recorded in
 * EmailLog; without SMTP configured the message is logged as SKIPPED so nothing else breaks. Sends run in the
 * background: callers never wait for the mail server.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import type { AppContext } from '../lib/context.js';
import type { Config } from '../config.js';
import type { EmailConfig } from '../lib/extensions.js';
import { renderTemplate, type Locale, type TemplateData, type TemplateName } from './email-templates.js';

/** SMTP settings from the environment (SMTP_* / MAIL_*). */
export function envEmailConfig(config: Config): EmailConfig {
  return { host: config.SMTP_HOST ?? null, port: config.SMTP_PORT, secure: config.SMTP_SECURE, user: config.SMTP_USER ?? null, pass: config.SMTP_PASS ?? null, fromName: config.MAIL_FROM_NAME ?? null, fromEmail: config.MAIL_FROM_EMAIL ?? null, replyTo: config.MAIL_REPLY_TO ?? null };
}

async function emailConfigOf(ctx: AppContext): Promise<EmailConfig> {
  return (await ctx.hooks.emailConfig?.(ctx)) ?? envEmailConfig(ctx.config);
}

export interface MailTransport {
  sendMail(msg: { from: string; to: string; replyTo?: string; subject: string; text: string; html: string }): Promise<unknown>;
}

let cached: { key: string; transport: Transporter } | null = null;

function transportFor(email: EmailConfig): Transporter | null {
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

export function emailConfigured(email: EmailConfig): boolean {
  return !!(email.host && email.fromEmail);
}

/** Core templates are typed; extension templates take any data. */
export interface SendOptions<K extends string> {
  to: string;
  locale: Locale;
  template: K;
  data: K extends TemplateName ? TemplateData[K] : Record<string, unknown>;
  tenantId?: string | null;
  /** Injected in tests. */
  transport?: MailTransport | null;
}

/** Render and send one message; returns the log row's status. */
export async function sendEmail<K extends string>(ctx: AppContext, opts: SendOptions<K>): Promise<'SENT' | 'SKIPPED' | 'FAILED'> {
  const email = await emailConfigOf(ctx);
  const rendered = renderTemplate(opts.template, opts.locale, opts.data, ctx.hooks.emailTemplates);
  const transport = opts.transport === undefined ? transportFor(email) : opts.transport;
  const to = opts.to.trim().toLowerCase();
  const log = (status: 'SENT' | 'SKIPPED' | 'FAILED', error: string | null) =>
    ctx.db.emailLog.create({ data: { to, subject: rendered.subject, template: opts.template, tenantId: opts.tenantId ?? null, status, error } }).catch(() => undefined);
  if (!transport || !email.fromEmail) {
    await log('SKIPPED', 'SMTP not configured');
    return 'SKIPPED';
  }
  try {
    await transport.sendMail({
      from: email.fromName ? `"${email.fromName.replace(/"/g, '')}" <${email.fromEmail}>` : email.fromEmail,
      to,
      replyTo: email.replyTo ?? undefined,
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
export function sendEmailLater<K extends string>(ctx: AppContext, opts: SendOptions<K>): void {
  sendEmail(ctx, opts).catch((err) => ctx.log.warn({ err }, 'email send crashed'));
}
