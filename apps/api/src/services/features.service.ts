/**
 * Paid-edition features by plan. Unlike the AI gate this applies on every server, because the features themselves
 * (branding, signage, archive, …) are what distinguishes the paid edition from the free core. A community server
 * simply has the FREE plan; the core it needs is never listed in PLAN_FEATURES.
 */
import { PLAN_FEATURES, type Branding, type PlanFeatures, type Signage, type SubscriptionPlan, type TenantPublicBranding, type TenantPublicSignage } from '@jumaah/shared';
import { HttpError } from '../lib/errors.js';
import { subscriptionState, type SubscriptionLike } from './plan.service.js';

export interface TenantFeaturesDto {
  plan: SubscriptionPlan;
  state: 'active' | 'grace' | 'expired' | 'suspended';
  features: PlanFeatures;
}

/** Features the mosque may use right now: the plan's list while the subscription is active or in grace, else none. */
export function tenantFeatures(t: SubscriptionLike, now: Date = new Date()): TenantFeaturesDto {
  const plan = (t.plan in PLAN_FEATURES ? t.plan : 'FREE') as SubscriptionPlan;
  const state = subscriptionState(t, now);
  const live = state === 'active' || state === 'grace';
  return { plan, state, features: live ? PLAN_FEATURES[plan] : PLAN_FEATURES.FREE };
}

export function featureDenied(feature: keyof PlanFeatures, plan: SubscriptionPlan): HttpError {
  return new HttpError(403, 'FEATURE_NOT_IN_PLAN', `"${feature}" is not included in the ${plan} plan`, { feature, plan });
}

const BRANDING_FEATURE: Record<keyof Branding, keyof PlanFeatures> = { logoDataUrl: 'logoUpload', primary: 'colours', accent: 'colours', css: 'css', hideMark: 'hideMark' };

/** Rejects branding fields the plan does not include. Clearing a field (null / false) is always allowed. */
export function assertBrandingAllowed(branding: Branding | undefined, t: SubscriptionLike): void {
  if (!branding) return;
  const { plan, features } = tenantFeatures(t);
  for (const key of Object.keys(branding) as Array<keyof Branding>) {
    const v = branding[key];
    if (v === undefined || v === null || v === false || v === '') continue;
    const f = BRANDING_FEATURE[key];
    if (!features[f]) throw featureDenied(f, plan);
  }
}

/** Signage settings may only be written by plans that include screens between khutbahs (clearing is always fine). */
export function assertSignageAllowed(signage: Signage | undefined, t: SubscriptionLike): void {
  if (!signage) return;
  const { plan, features } = tenantFeatures(t);
  const wantsSomething = !!signage.showDate || (signage.announcements ?? []).length > 0;
  if (wantsSomething && !features.signage) throw featureDenied('signage', plan);
}

/** Local calendar date (YYYY-MM-DD) in the mosque's timezone, for announcement windows. */
export function localDateKey(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Screens between khutbahs: nothing on plans without signage; otherwise the date flag and today's active announcements. */
export function effectiveSignage(settings: Record<string, unknown>, t: SubscriptionLike & { timezone?: string }, now: Date = new Date()): TenantPublicSignage {
  const { features } = tenantFeatures(t, now);
  if (!features.signage) return { showDate: false, announcements: [] };
  const s = ((settings.signage as Signage | undefined) ?? {}) as Signage;
  const today = localDateKey(now, t.timezone ?? 'Asia/Riyadh');
  const announcements = (s.announcements ?? [])
    .filter((a) => a.enabled !== false && (!a.from || a.from <= today) && (!a.until || a.until >= today) && (a.textAr.trim() || a.textEn.trim()))
    .map((a) => ({ id: a.id, textAr: a.textAr.trim(), textEn: a.textEn.trim() }));
  return { showDate: !!s.showDate, announcements };
}

/**
 * What screens and phones may actually show: stored branding filtered by the plan, so a lapsed subscription
 * falls back to the neutral look without anyone editing settings. `logoUrl` (a plain URL) is core and always kept.
 */
export function effectiveBranding(settings: Record<string, unknown>, t: SubscriptionLike): TenantPublicBranding {
  const b = ((settings.branding as Branding | undefined) ?? {}) as Branding;
  const { features } = tenantFeatures(t);
  const logoUrl = (features.logoUpload && b.logoDataUrl) || (settings.logoUrl as string | undefined) || null;
  return {
    logoUrl,
    primary: features.colours ? (b.primary ?? null) : null,
    accent: features.colours ? (b.accent ?? null) : null,
    css: features.css ? (b.css ?? null) : null,
    hideMark: features.hideMark ? !!b.hideMark : false,
  };
}
