import type { FastifyInstance } from 'fastify';
import { cloudCtx } from '../context.js';
import { networkSchema } from '@jumaah/cloud-shared';
import { parse } from '@jumaah/api';
import { ADMIN_ROLES, ALL_STAFF } from '@jumaah/api';
import { assertNetworkAllowed } from '../services/features.js';
import { networkStatus, publishTranslations, setNetworkSettings } from '../services/network.service.js';
import { actorOf } from '@jumaah/api';

/** Shared translation network: the mosque's switches and numbers. */
export async function networkRoutes(app: FastifyInstance): Promise<void> {
  const ctx = cloudCtx(app.ctx);
  const { db } = ctx;

  app.get('/network', { preHandler: app.requireRole(...ALL_STAFF) }, async (request) => networkStatus(ctx, request.tenantId));

  /** Switch reading / publishing. Switching publishing on publishes every approved translation; off removes them. */
  app.put('/network', { preHandler: app.requireRole(...ADMIN_ROLES) }, async (request) => {
    const body = parse(networkSchema, request.body);
    const t = await db.tenant.findUniqueOrThrow({ where: { id: request.tenantId } });
    assertNetworkAllowed(body, t);
    return setNetworkSettings(ctx, request.tenantId, body, actorOf(request));
  });

  /** Re-publish every approved translation (after bulk approvals, or to refresh corrected text). */
  app.post('/network/publish-all', { preHandler: app.requireRole(...ADMIN_ROLES) }, async (request) => {
    const t = await db.tenant.findUniqueOrThrow({ where: { id: request.tenantId } });
    assertNetworkAllowed({ publish: true }, t);
    const publishedNow = await publishTranslations(ctx, request.tenantId);
    return { ...(await networkStatus(ctx, request.tenantId)), publishedNow };
  });
}
