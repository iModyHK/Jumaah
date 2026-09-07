/** Jumaah Cloud's additions to the admin app: pages, cards, navigation and strings of the hosted edition. */
import type { CostEstimate } from '@jumaah/core';
import type { AiAllowanceDto } from '@jumaah/cloud-shared';
import ar from '@jumaah/cloud-shared/i18n/ar.json';
import en from '@jumaah/cloud-shared/i18n/en.json';
import type { AdminExtensions } from '@jumaah/admin';
import { AiPlanCard } from './components/AiPlanCard';
import { ArchiveCard } from './components/ArchiveCard';
import { BillingCard } from './components/BillingCard';
import { DomainCard } from './components/DomainCard';
import { HandoutAction } from './components/HandoutAction';
import { InsightCard } from './components/InsightCard';
import { NetworkCard } from './components/NetworkCard';
import { OrgSwitcher } from './components/OrgSwitcher';
import { PlatformBillingCard } from './components/PlatformBillingCard';
import { PlatformConfigCard } from './components/PlatformConfigCard';
import { AiUsageOverview, LatestImageTagCard } from './components/PlatformExt';
import { SubscriptionBanner } from './components/SubscriptionBanner';
import { TenantActions, TenantCreateFields, TenantPlanCell } from './components/TenantsExt';
import { ApiPage } from './pages/ApiPage';
import { HandoutPage } from './pages/HandoutPage';
import { OrganisationPage } from './pages/OrganisationPage';
import { OrganisationsPage } from './pages/OrganisationsPage';
import { orgOf } from './cloud-tenant';

const ADMIN = ['SUPER_ADMIN', 'MOSQUE_ADMIN'] as const;

/** Wraps NetworkCard, which takes no tenant. */
function NetworkSettings() {
  return <NetworkCard />;
}

export const cloudAdminExtensions: AdminExtensions = {
  routes: [
    { path: '/khutbahs/:id/handout', element: <HandoutPage />, needsTenant: true, standalone: true },
    { path: 'organisation', element: <OrganisationPage /> },
    { path: 'api', element: <ApiPage />, roles: ADMIN, needsTenant: true },
    { path: 'organisations', element: <OrganisationsPage />, roles: ['SUPER_ADMIN'] },
  ],
  nav: [
    { to: '/api', key: 'nav.api', icon: '⌁', admin: true, needsTenant: true },
    { to: '/organisation', key: 'nav.organisation', icon: '🏛', visible: (user) => !!orgOf(user) },
    { to: '/organisations', key: 'nav.organisations', icon: '🏛', superOnly: true },
  ],
  dashboardTop: [SubscriptionBanner],
  dashboardBottom: [InsightCard],
  settingsCards: [
    { id: 'archive', key: 'archive.title', Component: ArchiveCard },
    { id: 'domain', key: 'domain.title', Component: DomainCard },
    { id: 'network', key: 'network.title', Component: NetworkSettings },
    { id: 'billing', key: 'settings.subscription', Component: BillingCard },
  ],
  platformCards: [LatestImageTagCard, AiUsageOverview, PlatformBillingCard, PlatformConfigCard],
  providersTop: [AiPlanCard],
  editorActions: [HandoutAction],
  tenants: { cell: { header: 'tenants.plan', Component: TenantPlanCell }, actions: TenantActions, createFields: TenantCreateFields },
  topBarSwitcher: OrgSwitcher,
  translateGate(estimate: CostEstimate | null | undefined, languages, t) {
    const ai = estimate?.ext?.ai as AiAllowanceDto | undefined;
    if (!ai?.applies) return { message: null, blocked: false, note: null };
    const message =
      !ai.allowed && ai.reason
        ? t(`plan.deny.${ai.reason}`, { plan: t(`tenants.plans.${ai.plan}`), count: ai.maxLanguages ?? 0 })
        : ai.maxLanguages !== null && languages.length > ai.maxLanguages
          ? t('plan.deny.LANGUAGES', { count: ai.maxLanguages })
          : null;
    const blocked = !!message && (estimate?.perProvider.length ?? 0) === 0;
    const note = ai.allowed && ai.monthlyParagraphs !== null ? t('plan.remaining', { remaining: ai.remainingParagraphs, total: ai.monthlyParagraphs }) : null;
    return { message: message ? `${message} ${blocked ? t('plan.manualHint') : t('plan.ownProvidersHint')}` : null, blocked, note };
  },
  lockedFeatureLabel(_feature, ext, t) {
    const plan = ext?.plan as string | undefined;
    return plan ? t('branding.locked', { plan: t(`tenants.plans.${plan}`) }) : null;
  },
  i18n: { ar: ar as Record<string, unknown>, en: en as Record<string, unknown> },
};
