import type { AppContext } from '@jumaah/api';
import type { CloudPrismaClient } from '@jumaah/cloud-db';
import type { CloudConfig } from './config.js';

/** The core context as the cloud sees it: the cloud client (a superset of the core's) and the cloud settings. */
export interface CloudContext extends Omit<AppContext, 'db' | 'config'> {
  db: CloudPrismaClient;
  config: CloudConfig;
}

/** The cloud server builds the app with the cloud client and config, so this is only a view of the same object. */
export function cloudCtx(ctx: AppContext): CloudContext {
  return ctx as unknown as CloudContext;
}

/** Back to the core's view of the same context, for the core functions the cloud calls. */
export function coreCtx(ctx: CloudContext): AppContext {
  return ctx as unknown as AppContext;
}
