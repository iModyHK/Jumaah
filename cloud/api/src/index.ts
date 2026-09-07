/**
 * Jumaah Cloud as an extension of the Community API: the hooks that gate features by plan, meter the platform's AI,
 * name mosques by host, authenticate API keys and organisation admins, plus the routes of the hosted edition.
 */
import type { ApiExtension, AppContext } from '@jumaah/api';
import type { CloudConfig } from './config.js';
import { cloudHooks, registerContext } from './hooks.js';
import { cloudCtx } from './context.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { billingRoutes } from './routes/billing.js';
import { domainRoutes } from './routes/domains.js';
import { handoutRoutes } from './routes/handout.js';
import { insightRoutes } from './routes/insight.js';
import { networkRoutes } from './routes/network.js';
import { organisationRoutes } from './routes/organisations.js';
import { platformConfigRoutes } from './routes/platform-config.js';
import { publicCloudRoutes } from './routes/public-cloud.js';
import { signupRoutes } from './routes/signup.js';
import { syncServerRoutes } from './routes/sync-server.js';
import { tenantCloudRoutes } from './routes/tenants-cloud.js';
import { startBillingScheduler } from './services/billing.service.js';

export { loadCloudConfig, type CloudConfig } from './config.js';
export { cloudCtx, type CloudContext } from './context.js';

export function cloudExtension(config: CloudConfig): ApiExtension {
  return {
    name: 'jumaah-cloud',
    hooks: cloudHooks(config),
    async register(api) {
      registerContext(api.ctx);
      for (const r of [tenantCloudRoutes, domainRoutes, organisationRoutes, networkRoutes, apiKeyRoutes, billingRoutes, signupRoutes, platformConfigRoutes, handoutRoutes, insightRoutes, publicCloudRoutes, syncServerRoutes]) await api.register(r);
    },
    onReady(ctx: AppContext) {
      registerContext(ctx);
      // Renewal invoices, trial notices and overdue checks run in the background.
      startBillingScheduler(cloudCtx(ctx));
    },
  };
}
