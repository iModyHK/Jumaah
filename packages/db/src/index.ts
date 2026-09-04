import { PrismaClient, Prisma } from '@prisma/client';

export * from '@prisma/client';
export { Prisma };
export * from './crypto.js';
export * from './sync.js';

declare global {
  // eslint-disable-next-line no-var
  var __jumaahPrisma: PrismaClient | undefined;
}

export function createPrisma(url?: string): PrismaClient {
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

/** Process-wide singleton (safe with tsx watch / vitest reloads). */
export const prisma: PrismaClient = globalThis.__jumaahPrisma ?? createPrisma();
if (process.env.NODE_ENV !== 'production') globalThis.__jumaahPrisma = prisma;

/**
 * Run a callback inside a transaction with PostgreSQL row-level-security context set to a tenant.
 * All RLS policies read `current_setting('app.tenant_id', true)`.
 * The application role used at runtime is `jumaah_app` (created in migration 0001); the superuser
 * role used for migrations bypasses RLS.
 */
export async function withTenant<T>(
  client: PrismaClient,
  tenantId: string | null,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId ?? '');
    return fn(tx);
  });
}

export type Db = PrismaClient | Prisma.TransactionClient;
