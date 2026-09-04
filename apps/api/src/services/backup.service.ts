import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import path from 'node:path';
import type { Prisma } from '@jumaah/db';
import type { AppContext } from '../lib/context.js';
import type { Actor } from '../lib/audit.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';

export const BACKUP_FORMAT = 'jumaah-tenant-backup';
export const BACKUP_FORMAT_VERSION = 1;

interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  imageTag: string;
  tenant: unknown;
  languages: unknown[];
  users: unknown[];
  khutbahs: unknown[];
  sections: unknown[];
  paragraphs: unknown[];
  translations: unknown[];
  translationVersions: unknown[];
  khutbahVersions: unknown[];
  glossary: unknown[];
  providers: unknown[];
  displays: unknown[];
}

function backupDir(ctx: AppContext, tenantId: string): string {
  return path.resolve(ctx.config.BACKUP_DIR, tenantId);
}

/**
 * Backups are portable JSON (gzip) exports of every tenant-scoped table, restorable with Prisma alone.
 * This avoids shipping pg_dump in the API image and works identically on edge and cloud.
 */
export async function createBackup(ctx: AppContext, tenantId: string, actor: Actor, note?: string) {
  const db = ctx.db;
  const { tenant, payload } = await exportTenant(ctx, tenantId);
  const dir = backupDir(ctx, tenantId);
  await mkdir(dir, { recursive: true });
  const filename = `backup-${tenant.slug}-${payload.createdAt.replace(/[:.]/g, '-')}.json.gz`;
  const gz = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  await writeFile(path.join(dir, filename), gz);
  const row = await db.backup.create({
    data: { tenantId, filename, sizeBytes: gz.length, note: note ?? null, createdBy: actor.id },
  });
  await audit(db, tenantId, actor, 'backup.create', 'Backup', row.id, null, { filename, sizeBytes: gz.length });
  await pruneOld(ctx, tenantId);
  return row;
}

/** Full in-memory export of a tenant (used by backups and by edge bootstrap over sync). */
export async function exportTenant(ctx: AppContext, tenantId: string) {
  const db = ctx.db;
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw notFound('Tenant');
  const where = { tenantId };
  const [languages, users, khutbahs, sections, paragraphs, translations, translationVersions, khutbahVersions, glossary, providers, displays] =
    await Promise.all([
      db.tenantLanguage.findMany({ where }),
      db.user.findMany({ where }),
      db.khutbah.findMany({ where }),
      db.khutbahSection.findMany({ where }),
      db.paragraph.findMany({ where }),
      db.translation.findMany({ where }),
      db.translationVersion.findMany({ where }),
      db.khutbahVersion.findMany({ where }),
      db.glossaryEntry.findMany({ where }),
      db.providerConfig.findMany({ where }),
      db.display.findMany({ where }),
    ]);
  const payload: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    imageTag: ctx.config.IMAGE_TAG,
    tenant,
    languages,
    users,
    khutbahs,
    sections,
    paragraphs,
    translations,
    translationVersions,
    khutbahVersions,
    glossary,
    providers,
    displays,
  };
  return { tenant, payload };
}

async function pruneOld(ctx: AppContext, tenantId: string) {
  const rows = await ctx.db.backup.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  for (const old of rows.slice(ctx.config.BACKUP_KEEP)) {
    await unlink(path.join(backupDir(ctx, tenantId), old.filename)).catch(() => undefined);
    await ctx.db.backup.delete({ where: { id: old.id } });
  }
}

export async function backupStream(ctx: AppContext, tenantId: string, backupId: string) {
  const row = await ctx.db.backup.findFirst({ where: { id: backupId, tenantId } });
  if (!row) throw notFound('Backup');
  const file = path.join(backupDir(ctx, tenantId), row.filename);
  await stat(file).catch(() => {
    throw notFound('Backup file');
  });
  return { row, stream: createReadStream(file) };
}

export async function readBackup(ctx: AppContext, tenantId: string, backupId: string): Promise<BackupFile> {
  const row = await ctx.db.backup.findFirst({ where: { id: backupId, tenantId } });
  if (!row) throw notFound('Backup');
  const buf = await readFile(path.join(backupDir(ctx, tenantId), row.filename));
  return parseBackup(buf);
}

export function parseBackup(buf: Buffer): BackupFile {
  let json: string;
  try {
    json = gunzipSync(buf).toString('utf8');
  } catch {
    json = buf.toString('utf8');
  }
  const data = JSON.parse(json) as BackupFile;
  if (data.format !== BACKUP_FORMAT) throw badRequest('Not a Jumaah backup file');
  return data;
}

const dateFields = new Set(['createdAt', 'updatedAt', 'gregorianDate', 'lastSeenAt', 'lastLoginAt', 'lastTestedAt', 'deletedAt', 'subscriptionEndsAt']);
function revive<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of Object.keys(out)) {
    if (dateFields.has(k) && typeof out[k] === 'string') out[k] = new Date(out[k] as string);
  }
  return out as T;
}

/**
 * Restore replaces the tenant's content (khutbahs, translations, glossary, providers, displays, languages).
 * Users are merged by email (existing password hashes are kept). The tenant row itself keeps id/slug.
 */
export async function restoreBackup(ctx: AppContext, tenantId: string, data: BackupFile, actor: Actor) {
  const db = ctx.db;
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw notFound('Tenant');
  const strip = <T extends Record<string, unknown>>(rows: unknown[]) => rows.map((r) => ({ ...revive(r as T), tenantId }));

  await db.$transaction(
    async (tx) => {
      await tx.liveSession.deleteMany({ where: { tenantId } });
      await tx.translationJob.deleteMany({ where: { tenantId } });
      await tx.khutbah.deleteMany({ where: { tenantId } });
      await tx.glossaryEntry.deleteMany({ where: { tenantId } });
      await tx.providerConfig.deleteMany({ where: { tenantId } });
      await tx.display.deleteMany({ where: { tenantId } });
      await tx.tenantLanguage.deleteMany({ where: { tenantId } });

      const t = revive(data.tenant as Record<string, unknown>);
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          name: t.name as string,
          timezone: t.timezone as string,
          locale: t.locale as string,
          settings: (t.settings as Prisma.InputJsonValue) ?? {},
        },
      });
      if (data.languages.length) await tx.tenantLanguage.createMany({ data: strip(data.languages) as Prisma.TenantLanguageCreateManyInput[] });
      if (data.khutbahs.length) await tx.khutbah.createMany({ data: strip(data.khutbahs) as Prisma.KhutbahCreateManyInput[] });
      if (data.sections.length) await tx.khutbahSection.createMany({ data: strip(data.sections) as Prisma.KhutbahSectionCreateManyInput[] });
      if (data.paragraphs.length) await tx.paragraph.createMany({ data: strip(data.paragraphs) as Prisma.ParagraphCreateManyInput[] });
      if (data.translations.length) await tx.translation.createMany({ data: strip(data.translations) as Prisma.TranslationCreateManyInput[] });
      if (data.translationVersions.length)
        await tx.translationVersion.createMany({ data: strip(data.translationVersions) as Prisma.TranslationVersionCreateManyInput[] });
      if (data.khutbahVersions.length) await tx.khutbahVersion.createMany({ data: strip(data.khutbahVersions) as Prisma.KhutbahVersionCreateManyInput[] });
      if (data.glossary.length) await tx.glossaryEntry.createMany({ data: strip(data.glossary) as Prisma.GlossaryEntryCreateManyInput[] });
      if (data.providers.length) await tx.providerConfig.createMany({ data: strip(data.providers) as Prisma.ProviderConfigCreateManyInput[] });
      if (data.displays.length) await tx.display.createMany({ data: strip(data.displays) as Prisma.DisplayCreateManyInput[] });

      for (const raw of data.users as Array<Record<string, unknown>>) {
        const u = revive(raw);
        const existing = await tx.user.findFirst({ where: { tenantId, email: u.email as string } });
        if (existing) {
          await tx.user.update({ where: { id: existing.id }, data: { name: u.name as string, role: u.role as never, isActive: u.isActive as boolean } });
        } else {
          await tx.user.create({
            data: {
              id: u.id as string,
              tenantId,
              email: u.email as string,
              name: u.name as string,
              role: u.role as never,
              passwordHash: u.passwordHash as string,
              locale: (u.locale as string) ?? 'ar',
              isActive: (u.isActive as boolean) ?? true,
            },
          });
        }
      }
    },
    { timeout: 120_000 },
  );
  await ctx.redis.del(`session:${tenantId}`);
  await audit(db, tenantId, actor, 'backup.restore', 'Tenant', tenantId, null, { createdAt: data.createdAt, khutbahs: data.khutbahs.length });
}
