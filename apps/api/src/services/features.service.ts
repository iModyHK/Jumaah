/**
 * Feature switches of a mosque. The core never lists preparation, review, imam control, screens, phones, offline or
 * backups here: they are always available. Community Edition has a fixed set (COMMUNITY_FEATURES); an extension may
 * derive the set from a plan through the `features` hook.
 */
import { COMMUNITY_FEATURES, type Branding, type Features, type Signage, type TenantPublicBranding, type TenantPublicSignage } from '@jumaah/core';
import type { AppContext } from '../lib/context.js';
import { HttpError } from '../lib/errors.js';
import type { TenantRow } from '../lib/extensions.js';

export interface TenantFeaturesDto {
  features: Features;
  /** What an extension adds (plan name, subscription state). */
  ext?: Record<string, unknown>;
}

/** Features the mosque may use right now. */
export function tenantFeatures(ctx: AppContext, t: TenantRow): TenantFeaturesDto {
  return ctx.hooks.features?.(t) ?? { features: COMMUNITY_FEATURES };
}

export function featureDenied(feature: keyof Features): HttpError {
  return new HttpError(403, 'FEATURE_NOT_AVAILABLE', `"${feature}" is not available on this mosque`, { feature });
}

/** Throws unless the mosque's features include the one asked for. */
export function assertFeature(ctx: AppContext, feature: keyof Features, t: TenantRow): void {
  if (!tenantFeatures(ctx, t).features[feature]) throw featureDenied(feature);
}

const BRANDING_FEATURE: Record<keyof Branding, keyof Features> = { logoDataUrl: 'logoUpload', primary: 'colours', accent: 'colours', css: 'css', hideMark: 'hideMark' };

/** Rejects branding fields the mosque's features do not include. Clearing a field (null / false) is always allowed. */
export function assertBrandingAllowed(branding: Branding | undefined, features: Features): void {
  if (!branding) return;
  for (const key of Object.keys(branding) as Array<keyof Branding>) {
    const v = branding[key];
    if (v === undefined || v === null || v === false || v === '') continue;
    const f = BRANDING_FEATURE[key];
    if (!features[f]) throw featureDenied(f);
  }
}

/** Signage settings may only be written when the screens between khutbahs are included (clearing is always fine). */
export function assertSignageAllowed(signage: Signage | undefined, features: Features): void {
  if (!signage) return;
  const wantsSomething = !!signage.showDate || (signage.announcements ?? []).length > 0;
  if (wantsSomething && !features.signage) throw featureDenied('signage');
}

/** Local calendar date (YYYY-MM-DD) in the mosque's timezone, for announcement windows. */
export function localDateKey(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Screens between khutbahs: nothing without the feature; otherwise the date flag and today's active announcements. */
export function effectiveSignage(settings: Record<string, unknown>, features: Features, timezone: string | undefined, now: Date = new Date()): TenantPublicSignage {
  if (!features.signage) return { showDate: false, announcements: [] };
  const s = ((settings.signage as Signage | undefined) ?? {}) as Signage;
  const today = localDateKey(now, timezone ?? 'Asia/Riyadh');
  const announcements = (s.announcements ?? [])
    .filter((a) => a.enabled !== false && (!a.from || a.from <= today) && (!a.until || a.until >= today) && (a.textAr.trim() || a.textEn.trim()))
    .map((a) => ({ id: a.id, textAr: a.textAr.trim(), textEn: a.textEn.trim() }));
  return { showDate: !!s.showDate, announcements };
}

/**
 * What screens and phones may actually show: stored branding filtered by the features, so a lapsed feature falls
 * back to the neutral look without anyone editing settings. `logoUrl` (a plain URL) is core and always kept.
 */
export function effectiveBranding(settings: Record<string, unknown>, features: Features): TenantPublicBranding {
  const b = ((settings.branding as Branding | undefined) ?? {}) as Branding;
  const logoUrl = (features.logoUpload && b.logoDataUrl) || (settings.logoUrl as string | undefined) || null;
  return {
    logoUrl,
    primary: features.colours ? (b.primary ?? null) : null,
    accent: features.colours ? (b.accent ?? null) : null,
    css: features.css ? (b.css ?? null) : null,
    hideMark: features.hideMark ? !!b.hideMark : false,
  };
}
