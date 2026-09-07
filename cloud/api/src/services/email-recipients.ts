import type { Locale } from '@jumaah/api';
import type { CloudContext } from '../context.js';

/** Addresses that should hear about a mosque's invoices: its billing email, else every active mosque admin. */
export async function billingRecipients(ctx: CloudContext, tenantId: string): Promise<Array<{ to: string; locale: Locale }>> {
  const t = await ctx.db.tenant.findUnique({ where: { id: tenantId }, select: { billingEmail: true, locale: true, users: { where: { role: 'MOSQUE_ADMIN', isActive: true }, select: { email: true, locale: true } } } });
  if (!t) return [];
  const locale = (t.locale === 'en' ? 'en' : 'ar') as Locale;
  if (t.billingEmail) return [{ to: t.billingEmail, locale }];
  return t.users.map((u) => ({ to: u.email, locale: (u.locale === 'en' ? 'en' : 'ar') as Locale }));
}

export async function organisationRecipients(ctx: CloudContext, organisationId: string): Promise<Array<{ to: string; locale: Locale }>> {
  const o = await ctx.db.organisation.findUnique({ where: { id: organisationId }, select: { billingEmail: true, admins: { where: { isActive: true }, select: { email: true, locale: true } } } });
  if (!o) return [];
  if (o.billingEmail) return [{ to: o.billingEmail, locale: 'ar' }];
  return o.admins.map((u) => ({ to: u.email, locale: (u.locale === 'en' ? 'en' : 'ar') as Locale }));
}
