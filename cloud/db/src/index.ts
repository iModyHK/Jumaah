/**
 * Database client of Jumaah Cloud: the core models plus the hosted edition's (plans, billing, organisations, API
 * keys, webhooks, network, AI usage, platform settings). The schema is composed from the Community core schema
 * (scripts/compose-schema.mjs) and generated into ../generated/client, so it never collides with @jumaah/db.
 */
import { PrismaClient, Prisma } from '../generated/client/index.js';
import type { PrismaClient as CorePrismaClient } from '@jumaah/db';

export * from '../generated/client/index.js';
export { Prisma };
export { encryptSecret, decryptSecret, apiKeyHint, sha256, randomToken, hashPassword, verifyPassword } from '@jumaah/db';
export { applySyncEntries, type SyncEntry } from '@jumaah/db';

export type CloudPrismaClient = PrismaClient;
export type CloudDb = PrismaClient | Prisma.TransactionClient;
export type Db = CloudDb;

export function createPrisma(url?: string): PrismaClient {
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

/** The core services are typed against the Community client; the cloud client is a superset of it. */
export function asCoreDb(db: PrismaClient): CorePrismaClient {
  return db as unknown as CorePrismaClient;
}
/** The other way round: core services hand the client back typed as the core; the cloud code needs its own models. */
export function cloudDb(db: CorePrismaClient | Prisma.TransactionClient): PrismaClient {
  return db as unknown as PrismaClient;
}
