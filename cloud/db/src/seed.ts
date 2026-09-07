/* eslint-disable no-console */
/** Jumaah Cloud seed: the core demo data, then the demo mosque on a paid plan with a sync key and platform settings. */
import { seed as coreSeed } from '@jumaah/db/seed';
import { sha256 } from '@jumaah/db';
import { PrismaClient } from '../generated/client/index.js';
import { asCoreDb } from './index.js';

/** Fixed sync key so docs / e2e tests can reference it. */
export const DEMO_SYNC_KEY = 'demo-sync-key-change-me';

export async function seedCloud(prisma: PrismaClient): Promise<void> {
  const { tenantId } = await coreSeed(asCoreDb(prisma));
  await prisma.tenant.update({ where: { id: tenantId }, data: { plan: 'PRO', subscriptionStatus: 'ACTIVE', syncKeyHash: sha256(DEMO_SYNC_KEY) } });
  await prisma.platformSetting.upsert({
    where: { key: 'edge.latestImageTag' },
    update: {},
    create: { key: 'edge.latestImageTag', value: { tag: process.env.IMAGE_TAG ?? '1.2.0' } },
  });
  console.log('Cloud seed: demo mosque on PRO, sync key', DEMO_SYNC_KEY);
}

if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  const prisma = new PrismaClient();
  seedCloud(prisma)
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
