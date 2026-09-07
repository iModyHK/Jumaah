/**
 * Paid-edition features by plan. Unlike the AI gate this applies on every hosted mosque, because the features
 * themselves (colours, archive, insight, …) are what the plans sell. Community Edition has its own fixed set.
 */
import { featureDenied as coreFeatureDenied, type TenantRow } from '@jumaah/api';
import { HttpError } from '@jumaah/api';
import type { ArchiveSettings, NetworkSettings, PlanFeatures, SubscriptionPlan } from '@jumaah/cloud-shared';
import { PLAN_FEATURES } from '@jumaah/cloud-shared';
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

/** The core's feature hook: a tenant row carries the plan columns on a cloud server. */
export function featuresOf(t: TenantRow): { features: PlanFeatures; ext: Record<string, unknown> } {
  const f = tenantFeatures(t as unknown as SubscriptionLike);
  return { features: f.features, ext: { plan: f.plan, state: f.state } };
}

export function featureDenied(feature: keyof PlanFeatures, plan: SubscriptionPlan): HttpError {
  return new HttpError(403, 'FEATURE_NOT_AVAILABLE', `"${String(feature)}" is not included in the ${plan} plan`, { feature, plan });
}
void coreFeatureDenied;

/** Throws FEATURE_NOT_IN_PLAN unless the mosque's current plan includes the feature. */
export function assertFeature(feature: keyof PlanFeatures, t: SubscriptionLike): void {
  const { plan, features } = tenantFeatures(t);
  if (!features[feature]) throw featureDenied(feature, plan);
}

/** The public archive may only be switched on by plans that include it (switching it off is always fine). */
export function assertArchiveAllowed(archive: ArchiveSettings | undefined, t: SubscriptionLike): void {
  if (!archive?.enabled) return;
  const { plan, features } = tenantFeatures(t);
  if (!features.archive) throw featureDenied('archive', plan);
}

/** Is the public archive page open right now: the plan includes it and the mosque switched it on. */
export function archiveEnabled(settings: Record<string, unknown>, t: SubscriptionLike): boolean {
  return tenantFeatures(t).features.archive && !!(settings.archive as ArchiveSettings | undefined)?.enabled;
}

/** Reading the network needs networkRead, publishing needs networkPublish; switching either off is always fine. */
export function assertNetworkAllowed(network: NetworkSettings | undefined, t: SubscriptionLike): void {
  if (!network) return;
  const { plan, features } = tenantFeatures(t);
  if (network.publish && !features.networkPublish) throw featureDenied('networkPublish', plan);
  if (network.read === true && !features.networkRead) throw featureDenied('networkRead', plan);
}
