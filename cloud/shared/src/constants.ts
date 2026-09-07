/** Plans, limits and features of Jumaah Cloud (hosted edition). */
import { NO_FEATURES, type Features } from '@jumaah/core';

export type PlanFeatures = Features;

export const SUBSCRIPTION_PLANS = ['FREE', 'BASIC', 'STANDARD', 'PRO', 'ENTERPRISE'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

/**
 * What each hosted plan includes. Only the platform's own AI providers are gated by this; a mosque's own keys and
 * the self-hosted (community) edition are never limited. Allowances are counted in paragraph translations
 * (one paragraph into one language); PARAGRAPHS_PER_KHUTBAH_UNIT turns them into "khutbah translations" for people.
 */
export interface PlanLimits {
  /** Platform AI translation included. */
  ai: boolean;
  /** Distinct AI target languages allowed per job; null = unlimited. */
  maxLanguages: number | null;
  /** Paragraph translations per calendar month on platform AI; null = unlimited. */
  monthlyParagraphs: number | null;
}
export const PARAGRAPHS_PER_KHUTBAH_UNIT = 15;
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  FREE: { ai: false, maxLanguages: 0, monthlyParagraphs: 0 },
  BASIC: { ai: false, maxLanguages: 0, monthlyParagraphs: 0 },
  STANDARD: { ai: true, maxLanguages: 4, monthlyParagraphs: 60 * PARAGRAPHS_PER_KHUTBAH_UNIT },
  PRO: { ai: true, maxLanguages: null, monthlyParagraphs: 150 * PARAGRAPHS_PER_KHUTBAH_UNIT },
  ENTERPRISE: { ai: true, maxLanguages: null, monthlyParagraphs: 1500 * PARAGRAPHS_PER_KHUTBAH_UNIT },
};
/** Paid-edition features by plan (the feature matrix of the plan document). */
export const PLAN_FEATURES: Record<SubscriptionPlan, PlanFeatures> = {
  FREE: NO_FEATURES,
  BASIC: { ...NO_FEATURES, logoUpload: true, poster: true },
  STANDARD: { ...NO_FEATURES, logoUpload: true, colours: true, poster: true, signage: true, archive: true, handouts: true, insight: true, networkRead: true },
  PRO: { logoUpload: true, colours: true, css: true, hideMark: true, poster: true, signage: true, archive: true, handouts: true, insight: true, networkRead: true, networkPublish: true, api: true, customDomain: true },
  ENTERPRISE: { logoUpload: true, colours: true, css: true, hideMark: true, poster: true, signage: true, archive: true, handouts: true, insight: true, networkRead: true, networkPublish: true, api: true, customDomain: true },
};
/** Organisation account (ENTERPRISE plan): mosques one organisation may manage by default. */
export const ORG_MAX_TENANTS = 10;
/** Days after subscriptionEndsAt during which platform AI keeps working, so a late payment never blanks a Friday. */
export const AI_GRACE_DAYS = 7;
/** Length of the trial a new hosted mosque starts with. */
export const TRIAL_DAYS = 30;

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const DEPLOYMENT_MODES = ['edge', 'cloud'] as const;
export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number];

/** Webhook events a mosque can subscribe to (hosted edition, plans with the API feature). */
export const WEBHOOK_EVENTS = ['khutbah.created', 'khutbah.updated', 'translations.approved', 'session.started', 'session.ended', 'ping'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
