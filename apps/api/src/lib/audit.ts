import type { Db, Prisma } from '@jumaah/db';

export interface Actor {
  id: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** Entities that participate in edge<->cloud sync. */
export type SyncEntity =
  | 'Tenant'
  | 'TenantLanguage'
  | 'Khutbah'
  | 'KhutbahSection'
  | 'Paragraph'
  | 'Translation'
  | 'GlossaryEntry'
  | 'Display'
  | 'KhutbahVersion';

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

export async function audit(
  db: Db,
  tenantId: string | null,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | null,
  before?: unknown,
  after?: unknown,
): Promise<void> {
  await db.auditLog.create({
    data: {
      tenantId,
      userId: actor.id,
      action,
      entity,
      entityId,
      before: toJson(before),
      after: toJson(after),
      ip: actor.ip ?? null,
      userAgent: actor.userAgent?.slice(0, 300) ?? null,
    },
  });
}

/**
 * Outbox: record a local change so the sync worker can push it to the other side.
 * `payload` must be the full row (LWW conflict resolution compares `updatedAt`).
 */
export async function outbox(
  db: Db,
  tenantId: string,
  entity: SyncEntity,
  entityId: string,
  op: 'UPSERT' | 'DELETE',
  payload: unknown,
  version = 1,
): Promise<void> {
  if (process.env.SYNC_DISABLED === '1') return;
  await db.outbox.create({
    data: { tenantId, entity, entityId, op, payload: toJson(payload) ?? {}, version },
  });
}
