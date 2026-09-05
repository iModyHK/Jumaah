/**
 * Integration tests against a real PostgreSQL + Redis (see docker compose / dev containers).
 * Requires the seed to have run (demo tenant).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createPrisma } from '@jumaah/db';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createRedis } from './lib/redis.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://jumaah:jumaah_dev_password@localhost:5432/jumaah?schema=public';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

let app: FastifyInstance;
let adminToken = '';
let translatorToken = '';
let imamToken = '';
let superToken = '';
let tenantId = '';
let khutbahId = '';
let sectionFirstId = '';
let paragraphIds: string[] = [];

async function login(email: string, password: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as { accessToken: string; refreshToken: string; user: { tenantId: string | null } };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL,
    REDIS_URL,
    JWT_SECRET: 'test-secret-test-secret-test-secret',
    ENCRYPTION_KEY: 'test-encryption-key-test-encryption',
    DEPLOYMENT_MODE: 'cloud',
    PUBLIC_BASE_URL: 'https://cloud.jumaah.test',
    TENANT_BASE_DOMAIN: 'jumaah.test',
    BACKUP_DIR: './.test-backups',
    RATE_LIMIT_AUTH: '1000',
    RATE_LIMIT_GENERAL: '10000',
  });
  const db = createPrisma(DATABASE_URL);
  app = await buildApp({ config, db, redis: createRedis(REDIS_URL, 'test'), pub: createRedis(REDIS_URL, 'tpub'), sub: createRedis(REDIS_URL, 'tsub') });
  await app.ready();
  const a = await login('admin@demo.mosque', 'Demo12345!');
  adminToken = a.accessToken;
  tenantId = a.user.tenantId!;
  translatorToken = (await login('translator@demo.mosque', 'Demo12345!')).accessToken;
  imamToken = (await login('imam@demo.mosque', 'Demo12345!')).accessToken;
  superToken = (await login('admin@jumaah.app', 'Admin12345!')).accessToken;
});

afterAll(async () => {
  if (khutbahId) await app.inject({ method: 'DELETE', url: `/api/khutbahs/${khutbahId}`, headers: auth(adminToken) });
  await app.close();
});

describe('health & auth', () => {
  it('reports health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json().checks).toEqual({ database: 'ok', redis: 'ok' });
  });

  it('rejects bad credentials and missing tokens', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@demo.mosque', password: 'wrong-password' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/khutbahs' })).statusCode).toBe(401);
  });

  it('refreshes tokens and returns /me', async () => {
    const a = await login('admin@demo.mosque', 'Demo12345!');
    const r = await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken: a.refreshToken } });
    expect(r.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth(r.json().accessToken) });
    expect(me.json().role).toBe('MOSQUE_ADMIN');
    // refresh tokens are single use
    expect((await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken: a.refreshToken } })).statusCode).toBe(401);
  });

  it('enforces roles', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/users', headers: auth(imamToken) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/tenants', headers: auth(adminToken) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/tenants', headers: auth(superToken) })).statusCode).toBe(200);
  });
});

describe('khutbah workflow: upload → translate (manual) → approve → broadcast → display', () => {
  it('creates a khutbah with auto-split paragraphs and Quran detection', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/khutbahs',
      headers: auth(adminToken),
      payload: {
        title: 'اختبار آلي',
        gregorianDate: '2026-09-11',
        targetLanguages: ['en', 'ur'],
        sections: [
          { type: 'FIRST', rawText: 'الحمد لله رب العالمين.\n\nقال تعالى: ﴿وَاتَّقُوا اللَّهَ﴾ [البقرة: 282]\n\nأما بعد فاتقوا الله.' },
          { type: 'SECOND', rawText: 'الحمد لله وحده.' },
          { type: 'DUA', rawText: 'اللهم اغفر لنا.' },
        ],
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const k = res.json();
    khutbahId = k.id;
    expect(k.status).toBe('DRAFT');
    expect(k.sections).toHaveLength(3);
    const first = k.sections.find((s: { type: string }) => s.type === 'FIRST');
    sectionFirstId = first.id;
    expect(first.paragraphs).toHaveLength(3);
    expect(first.paragraphs[1].kind).toBe('QURAN');
    expect(first.paragraphs[1].reference).toBe('البقرة:282');
    paragraphIds = k.sections.flatMap((s: { paragraphs: { id: string }[] }) => s.paragraphs.map((p) => p.id));
    expect(k.stats.perLanguage.en.pending).toBe(5);
  });

  it('is invisible to other tenants (isolation)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/khutbahs/${khutbahId}`, headers: { ...auth(superToken), 'x-tenant-id': 'some-other-tenant' } });
    expect(res.statusCode).toBe(404);
  });

  it('splits and merges paragraphs', async () => {
    const split = await app.inject({ method: 'POST', url: `/api/paragraphs/${paragraphIds[0]}/split`, headers: auth(adminToken), payload: { offset: 10 } });
    expect(split.statusCode, split.body).toBe(200);
    const first = split.json().sections.find((s: { type: string }) => s.type === 'FIRST');
    expect(first.paragraphs).toHaveLength(4);
    const merge = await app.inject({ method: 'POST', url: `/api/paragraphs/${first.paragraphs[0].id}/merge`, headers: auth(adminToken), payload: { withNextId: first.paragraphs[1].id } });
    expect(merge.statusCode, merge.body).toBe(200);
    expect(merge.json().sections.find((s: { type: string }) => s.type === 'FIRST').paragraphs).toHaveLength(3);
    expect(merge.json().sections.find((s: { type: string }) => s.type === 'FIRST').paragraphs[0].textAr).toBe('الحمد لله رب العالمين.');
  });

  it('replaces section text keeping translations of unchanged paragraphs', async () => {
    const t = await app.inject({ method: 'PUT', url: `/api/paragraphs/${paragraphIds[0]}/translations`, headers: auth(translatorToken), payload: { lang: 'en', text: 'All praise is due to Allah, Lord of the worlds.', status: 'APPROVED' } });
    expect(t.statusCode, t.body).toBe(200);
    const res = await app.inject({ method: 'PUT', url: `/api/khutbahs/${khutbahId}/sections/FIRST`, headers: auth(adminToken), payload: { rawText: 'الحمد لله رب العالمين.\n\nفقرة جديدة تماماً.' } });
    expect(res.statusCode, res.body).toBe(200);
    const first = res.json().sections.find((s: { type: string }) => s.type === 'FIRST');
    expect(first.paragraphs).toHaveLength(2);
    expect(first.paragraphs[0].translations.find((x: { lang: string }) => x.lang === 'en').status).toBe('APPROVED');
    expect(first.paragraphs[1].translations).toHaveLength(0);
    paragraphIds = res.json().sections.flatMap((s: { paragraphs: { id: string }[] }) => s.paragraphs.map((p) => p.id));
  });

  it('records versions and can restore', async () => {
    const versions = await app.inject({ method: 'GET', url: `/api/khutbahs/${khutbahId}/versions`, headers: auth(adminToken) });
    expect(versions.statusCode).toBe(200);
    expect(versions.json().length).toBeGreaterThanOrEqual(3);
  });

  it('imports translations in bulk and approves all → READY', async () => {
    const k = (await app.inject({ method: 'GET', url: `/api/khutbahs/${khutbahId}`, headers: auth(adminToken) })).json();
    const count = k.sections.reduce((n: number, s: { paragraphs: unknown[] }) => n + s.paragraphs.length, 0);
    for (const lang of ['en', 'ur']) {
      const imp = await app.inject({ method: 'POST', url: `/api/khutbahs/${khutbahId}/translations/import`, headers: auth(translatorToken), payload: { lang, texts: Array.from({ length: count }, (_, i) => `${lang} paragraph ${i + 1}`), status: 'REVIEWED' } });
      expect(imp.statusCode, imp.body).toBe(200);
    }
    const approve = await app.inject({ method: 'POST', url: `/api/khutbahs/${khutbahId}/approve-all`, headers: auth(translatorToken), payload: {} });
    expect(approve.statusCode, approve.body).toBe(200);
    const after = (await app.inject({ method: 'GET', url: `/api/khutbahs/${khutbahId}`, headers: auth(adminToken) })).json();
    expect(after.status).toBe('READY');
    expect(after.stats.perLanguage.en.approved).toBe(count);
  });

  it('review endpoint: rejecting a translation drops the khutbah back to REVIEW', async () => {
    const k = (await app.inject({ method: 'GET', url: `/api/khutbahs/${khutbahId}`, headers: auth(adminToken) })).json();
    const tr = k.sections[0].paragraphs[0].translations.find((x: { lang: string }) => x.lang === 'ur');
    const rej = await app.inject({ method: 'POST', url: `/api/translations/${tr.id}/review`, headers: auth(translatorToken), payload: { action: 'reject', note: 'wrong tone' } });
    expect(rej.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/khutbahs/${khutbahId}`, headers: auth(adminToken) })).json().status).toBe('REVIEW');
    const fix = await app.inject({ method: 'POST', url: `/api/translations/${tr.id}/review`, headers: auth(translatorToken), payload: { action: 'approve', text: 'اردو ترجمہ درست' } });
    expect(fix.statusCode).toBe(200);
    expect(fix.json().text).toBe('اردو ترجمہ درست');
    const hist = await app.inject({ method: 'GET', url: `/api/translations/${tr.id}/history`, headers: auth(adminToken) });
    expect(hist.json().length).toBeGreaterThanOrEqual(2);
  });

  it('translation job with no usable provider fails gracefully and estimate works', async () => {
    const est = await app.inject({ method: 'POST', url: `/api/khutbahs/${khutbahId}/translate/estimate`, headers: auth(adminToken), payload: { force: true } });
    expect(est.statusCode, est.body).toBe(200);
    // everything is APPROVED already: force only re-translates MACHINE/PENDING, so nothing is billable
    expect(est.json().paragraphs).toBe(0);
    expect(est.json().languages).toBe(2);
    expect(Array.isArray(est.json().perProvider)).toBe(true);
    const job = await app.inject({ method: 'POST', url: `/api/khutbahs/${khutbahId}/translate`, headers: auth(adminToken), payload: { force: true, languages: ['en'] } });
    expect(job.statusCode, job.body).toBe(202);
    let status = 'RUNNING';
    for (let i = 0; i < 40 && (status === 'RUNNING' || status === 'QUEUED'); i++) {
      await new Promise((r) => setTimeout(r, 250));
      status = (await app.inject({ method: 'GET', url: `/api/translation-jobs/${job.json().id}`, headers: auth(adminToken) })).json().status;
    }
    expect(['FAILED', 'DONE']).toContain(status);
    // approved translations must not have been overwritten by the failed job
    const k = (await app.inject({ method: 'GET', url: `/api/khutbahs/${khutbahId}`, headers: auth(adminToken) })).json();
    expect(k.sections[0].paragraphs[0].translations.find((x: { lang: string }) => x.lang === 'en').status).toBe('APPROVED');
  });

  it('imam starts a session, navigates, and displays receive state', async () => {
    const start = await app.inject({ method: 'POST', url: '/api/session/start', headers: auth(imamToken), payload: { khutbahId, deviceId: 'tablet-1' } });
    expect(start.statusCode, start.body).toBe(200);
    expect(start.json().state).toBe('LIVE');
    expect(start.json().currentIndex).toBe(0);

    // second device cannot start without force
    const clash = await app.inject({ method: 'POST', url: '/api/session/start', headers: auth(imamToken), payload: { khutbahId, deviceId: 'tablet-2' } });
    expect(clash.statusCode).toBe(409);

    const next = await app.inject({ method: 'POST', url: '/api/session/command', headers: auth(imamToken), payload: { command: { type: 'next' }, deviceId: 'tablet-1' } });
    expect(next.json().currentIndex).toBe(1);
    expect(next.json().seq).toBe(2);
    const improv = await app.inject({ method: 'POST', url: '/api/session/command', headers: auth(imamToken), payload: { command: { type: 'improv' } } });
    expect(improv.json().state).toBe('IMPROV');
    const second = await app.inject({ method: 'POST', url: '/api/session/command', headers: auth(imamToken), payload: { command: { type: 'section', section: 'SECOND' } } });
    expect(second.json().currentSection).toBe('SECOND');
    expect(second.json().state).toBe('LIVE');

    // public display bootstrap (no auth) sees the current paragraph and approved translations
    const pub = await app.inject({ method: 'GET', url: '/api/public/display/demo-main-display-token-0001' });
    expect(pub.statusCode).toBe(200);
    const body = pub.json();
    expect(body.session.currentParagraphId).toBe(second.json().currentParagraphId);
    const current = body.khutbah.paragraphs.find((p: { id: string }) => p.id === body.session.currentParagraphId);
    expect(current.translations.en.status).toBe('APPROVED');
    expect(body.display.languages).toEqual(['en', 'ur']);

    const end = await app.inject({ method: 'POST', url: '/api/session/end', headers: auth(imamToken) });
    expect(end.json().state).toBe('ENDED');
    expect((await app.inject({ method: 'GET', url: `/api/khutbahs/${khutbahId}`, headers: auth(adminToken) })).json().status).toBe('DELIVERED');
  });

  it('copies a khutbah', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/khutbahs/${khutbahId}/copy`, headers: auth(adminToken), payload: { includeTranslations: true } });
    expect(res.statusCode).toBe(201);
    expect(res.json().copiedFromId).toBe(khutbahId);
    expect(res.json().stats.perLanguage.en.reviewed).toBeGreaterThan(0);
    await app.inject({ method: 'DELETE', url: `/api/khutbahs/${res.json().id}`, headers: auth(adminToken) });
  });
});

describe('glossary, providers, displays, audit', () => {
  it('glossary CRUD', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/glossary', headers: auth(adminToken), payload: { term: 'اختبار', lang: 'en', mode: 'REPLACE', replacement: 'test-term' } });
    expect(c.statusCode).toBe(201);
    const dup = await app.inject({ method: 'POST', url: '/api/glossary', headers: auth(adminToken), payload: { term: 'اختبار', lang: 'en', mode: 'REPLACE', replacement: 'x' } });
    expect(dup.statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: `/api/glossary/${c.json().id}`, headers: auth(adminToken) })).statusCode).toBe(200);
  });

  it('stores provider keys encrypted and never returns them', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/providers', headers: auth(adminToken), payload: { type: 'OPENAI', name: 'test', apiKey: 'sk-test-1234567890', priority: 5 } });
    expect(c.statusCode, c.body).toBe(201);
    expect(c.json().hasApiKey).toBe(true);
    expect(c.json().apiKeyHint).toBe('sk-t…7890');
    expect(JSON.stringify(c.json())).not.toContain('sk-test-1234567890');
    const raw = await app.ctx.db.providerConfig.findUnique({ where: { id: c.json().id } });
    expect(raw?.apiKeyEncrypted).not.toContain('sk-test');
    const list = await app.inject({ method: 'GET', url: '/api/providers', headers: auth(adminToken) });
    // seeded tenant chain is ANTHROPIC → GOOGLE → OLLAMA; other configured providers are appended
    expect(list.json().chain).toContain('OPENAI');
    expect(list.json().chain).not.toContain('MANUAL');
    await app.inject({ method: 'DELETE', url: `/api/providers/${c.json().id}`, headers: auth(adminToken) });
  });

  it('display CRUD + token regeneration', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/displays', headers: auth(adminToken), payload: { name: 'شاشة اختبار', languages: ['en', 'bn'], layout: 'split' } });
    expect(c.statusCode, c.body).toBe(201);
    expect(c.json().url).toContain(`/display/${c.json().token}`);
    const tooMany = await app.inject({ method: 'POST', url: '/api/displays', headers: auth(adminToken), payload: { name: 'x', languages: ['en', 'bn', 'ur', 'tr', 'id'] } });
    expect(tooMany.statusCode).toBe(400);
    const regen = await app.inject({ method: 'POST', url: `/api/displays/${c.json().id}/regenerate-token`, headers: auth(adminToken) });
    expect(regen.json().token).not.toBe(c.json().token);
    expect((await app.inject({ method: 'GET', url: `/api/public/display/${c.json().token}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/public/display/${regen.json().token}` })).statusCode).toBe(200);
    await app.inject({ method: 'DELETE', url: `/api/displays/${c.json().id}`, headers: auth(adminToken) });
  });

  it('audit log captured the changes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/audit?entity=Khutbah', headers: auth(adminToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.some((i: { action: string }) => i.action === 'khutbah.create')).toBe(true);
  });

  it('backup create + restore round trip', async () => {
    const b = await app.inject({ method: 'POST', url: '/api/backups', headers: auth(adminToken), payload: { note: 'test' } });
    expect(b.statusCode, b.body).toBe(201);
    const list = await app.inject({ method: 'GET', url: '/api/backups', headers: auth(adminToken) });
    expect(list.json().length).toBeGreaterThan(0);
    const before = (await app.inject({ method: 'GET', url: '/api/khutbahs', headers: auth(adminToken) })).json().total;
    const r = await app.inject({ method: 'POST', url: `/api/backups/${b.json().id}/restore`, headers: auth(adminToken) });
    expect(r.statusCode, r.body).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/khutbahs', headers: auth(adminToken) })).json().total).toBe(before);
    // login still works after restore (users merged)
    await login('admin@demo.mosque', 'Demo12345!');
  });
});

describe('sync (edge ↔ cloud)', () => {
  it('rejects a bad sync key, pushes/pulls with a valid one, and is idempotent', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/sync/pull', headers: { 'x-sync-key': 'nope' }, payload: { tenantSlug: 'demo' } });
    expect(bad.statusCode).toBe(401);
    const key = 'demo-sync-key-change-me';
    const pull = await app.inject({ method: 'POST', url: '/api/sync/pull', headers: { 'x-sync-key': key }, payload: { tenantSlug: 'demo', since: null, limit: 5 } });
    expect(pull.statusCode, pull.body).toBe(200);
    expect(Array.isArray(pull.json().entries)).toBe(true);

    const entryId = `test-entry-${Date.now()}`;
    const payload = { id: 'sync-glossary-1', tenantId: 'other', term: 'مزامنة', lang: 'en', replacement: 'sync', mode: 'REPLACE', updatedAt: new Date().toISOString() };
    const push = await app.inject({
      method: 'POST',
      url: '/api/sync/push',
      headers: { 'x-sync-key': key },
      payload: { tenantSlug: 'demo', deviceId: 'edge-test', entries: [{ id: entryId, entity: 'GlossaryEntry', entityId: 'sync-glossary-1', op: 'UPSERT', payload, version: 1, occurredAt: new Date().toISOString() }] },
    });
    expect(push.statusCode, push.body).toBe(200);
    expect(push.json().applied).toBe(1);
    const row = await app.ctx.db.glossaryEntry.findUnique({ where: { id: 'sync-glossary-1' } });
    expect(row?.tenantId).toBe(tenantId); // tenant forced from the key, not from payload
    const again = await app.inject({ method: 'POST', url: '/api/sync/push', headers: { 'x-sync-key': key }, payload: { tenantSlug: 'demo', deviceId: 'edge-test', entries: [{ id: entryId, entity: 'GlossaryEntry', entityId: 'sync-glossary-1', op: 'UPSERT', payload, version: 1, occurredAt: new Date().toISOString() }] } });
    expect(again.json().skipped).toBe(1);

    // older update loses (LWW)
    const old = await app.inject({ method: 'POST', url: '/api/sync/push', headers: { 'x-sync-key': key }, payload: { tenantSlug: 'demo', deviceId: 'edge-test', entries: [{ id: `${entryId}-old`, entity: 'GlossaryEntry', entityId: 'sync-glossary-1', op: 'UPSERT', payload: { ...payload, replacement: 'OLD', updatedAt: new Date(Date.now() - 86400000).toISOString() }, version: 1, occurredAt: new Date().toISOString() }] } });
    expect(old.json().conflicts).toBe(1);
    expect((await app.ctx.db.glossaryEntry.findUnique({ where: { id: 'sync-glossary-1' } }))?.replacement).toBe('sync');
    await app.ctx.db.glossaryEntry.delete({ where: { id: 'sync-glossary-1' } });
    await app.ctx.db.syncApplied.deleteMany({ where: { id: { startsWith: entryId } } });
  });

  it('bootstrap export works with the sync key', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/sync/bootstrap', headers: { 'x-sync-key': 'demo-sync-key-change-me' }, payload: { tenantSlug: 'demo' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().format).toBe('jumaah-tenant-backup');
    expect(res.json().khutbahs.length).toBeGreaterThan(0);
  });
});

describe('hostname tenancy (hosted edition)', () => {
  const host = (h: string) => ({ host: h });

  it('/public/host names the mosque behind a tenant address and nothing elsewhere', async () => {
    const demo = await app.inject({ method: 'GET', url: '/api/public/host', headers: host('demo.jumaah.test') });
    expect(demo.statusCode).toBe(200);
    expect(demo.json()).toMatchObject({ tenantBaseDomain: 'jumaah.test', slug: 'demo', tenant: { slug: 'demo' } });
    const platform = await app.inject({ method: 'GET', url: '/api/public/host', headers: host('cloud.jumaah.test') });
    expect(platform.json()).toMatchObject({ tenantBaseDomain: 'jumaah.test', slug: null, tenant: null });
    const unknown = await app.inject({ method: 'GET', url: '/api/public/host', headers: host('no-such-mosque.jumaah.test') });
    expect(unknown.json()).toMatchObject({ slug: null, tenant: null });
  });

  it('login infers the mosque from the address and rejects a different one', async () => {
    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', headers: host('demo.jumaah.test'), payload: { email: 'admin@demo.mosque', password: 'Demo12345!' } });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().user.tenantSlug).toBe('demo');
    const wrongHost = await app.inject({ method: 'POST', url: '/api/auth/login', headers: host('other.jumaah.test'), payload: { email: 'admin@demo.mosque', password: 'Demo12345!' } });
    expect(wrongHost.statusCode).toBe(401);
    const conflicting = await app.inject({ method: 'POST', url: '/api/auth/login', headers: host('other.jumaah.test'), payload: { email: 'admin@demo.mosque', password: 'Demo12345!', tenantSlug: 'demo' } });
    expect(conflicting.statusCode).toBe(401);
    // the super admin has no mosque and may sign in on a mosque address to support it
    const sup = await app.inject({ method: 'POST', url: '/api/auth/login', headers: host('demo.jumaah.test'), payload: { email: 'admin@jumaah.app', password: 'Admin12345!' } });
    expect(sup.statusCode, sup.body).toBe(200);
    expect(sup.json().user.role).toBe('SUPER_ADMIN');
  });

  it('screen, phone and invitation links use the mosque address', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/displays', headers: auth(adminToken) });
    expect(list.statusCode).toBe(200);
    for (const d of list.json() as Array<{ url: string; publicUrl: string }>) {
      expect(d.url.startsWith('https://demo.jumaah.test/display/')).toBe(true);
      expect(d.publicUrl).toBe('https://demo.jumaah.test/display/m/demo');
    }
    const pub = await app.inject({ method: 'GET', url: '/api/public/display/demo-main-display-token-0001' });
    expect(pub.json().display.publicUrl).toBe('https://demo.jumaah.test/display/m/demo');
    const inv = await app.inject({ method: 'POST', url: '/api/users/invite', headers: auth(adminToken), payload: { email: `host-test-${Date.now()}@example.com`, role: 'TRANSLATOR' } });
    expect(inv.statusCode, inv.body).toBe(201);
    expect(inv.json().inviteUrl.startsWith('https://demo.jumaah.test/admin/invite/')).toBe(true);
    await app.ctx.db.invitation.delete({ where: { id: inv.json().id } });
  });

  it('CORS allows mosque origins under the base domain and rejects look-alikes', async () => {
    const good = await app.inject({ method: 'OPTIONS', url: '/api/health', headers: { origin: 'https://alnoor.jumaah.test', 'access-control-request-method': 'GET' } });
    expect(good.headers['access-control-allow-origin']).toBe('https://alnoor.jumaah.test');
    const bad = await app.inject({ method: 'OPTIONS', url: '/api/health', headers: { origin: 'https://alnoor.jumaah.test.evil.com', 'access-control-request-method': 'GET' } });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('hosted plans: platform AI gate and metering', () => {
  const setPlan = (plan: string, status = 'ACTIVE', endsAt: Date | null = null) => app.ctx.db.tenant.update({ where: { id: tenantId }, data: { plan: plan as never, subscriptionStatus: status as never, subscriptionEndsAt: endsAt } });
  const month = new Date().toISOString().slice(0, 7);
  let providerId = '';
  // The demo mosque has providers of its own; those are never gated, so they are switched off while the gate is tested.
  let ownProviders: string[] = [];

  beforeAll(async () => {
    const own = await app.ctx.db.providerConfig.findMany({ where: { tenantId, enabled: true }, select: { id: true } });
    ownProviders = own.map((x) => x.id);
    await app.ctx.db.providerConfig.updateMany({ where: { id: { in: ownProviders } }, data: { enabled: false } });
  });

  afterAll(async () => {
    await setPlan('PRO');
    if (providerId) await app.ctx.db.providerConfig.deleteMany({ where: { id: providerId } });
    await app.ctx.db.providerConfig.updateMany({ where: { id: { in: ownProviders } }, data: { enabled: true } });
    await app.ctx.db.aiUsage.deleteMany({ where: { tenantId } });
  });

  it('reports the allowance of the demo mosque (Pro, active)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tenant/ai-usage', headers: auth(adminToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ applies: true, plan: 'PRO', allowed: true, aiIncluded: true, maxLanguages: null, month, usedParagraphs: 0 });
  });

  it('a plan without AI cannot start platform translation, but the estimate still answers', async () => {
    await setPlan('BASIC');
    const est = await app.inject({ method: 'POST', url: `/api/khutbahs/${khutbahId}/translate/estimate`, headers: auth(adminToken), payload: { languages: ['en'] } });
    expect(est.statusCode, est.body).toBe(200);
    expect(est.json().ai).toMatchObject({ applies: true, allowed: false, reason: 'NOT_INCLUDED' });
    const job = await app.inject({ method: 'POST', url: `/api/khutbahs/${khutbahId}/translate`, headers: auth(adminToken), payload: { languages: ['en'] } });
    expect(job.statusCode).toBe(403);
    expect(job.json().error.code).toBe('AI_NOT_INCLUDED');
    // the edge relay is gated on the cloud as well
    const relay = await app.inject({ method: 'POST', url: '/api/sync/translate', headers: { 'x-sync-key': 'demo-sync-key-change-me' }, payload: { tenantSlug: 'demo', items: [{ id: 'p1', text: 'الحمد لله' }], targetLangs: ['en'], glossary: [] } });
    expect(relay.statusCode).toBe(403);
    expect(relay.json().error.code).toBe('AI_NOT_INCLUDED');
  });

  it('Standard enforces the language limit and the monthly allowance against platform providers', async () => {
    await setPlan('STANDARD', 'ACTIVE', new Date(Date.now() + 30 * 86_400_000));
    const p = await app.ctx.db.providerConfig.create({ data: { tenantId: null, type: 'OLLAMA', name: 'platform test', baseUrl: 'http://127.0.0.1:9', model: 'x', priority: 5, enabled: true } });
    providerId = p.id;
    const tooMany = await app.inject({ method: 'POST', url: `/api/khutbahs/${khutbahId}/translate`, headers: auth(adminToken), payload: { languages: ['en', 'ur', 'bn', 'so', 'fr'] } });
    expect(tooMany.statusCode, tooMany.body).toBe(403);
    expect(tooMany.json().error.code).toBe('AI_LANGUAGES');
    await app.ctx.db.aiUsage.create({ data: { tenantId, month, lang: 'en', source: 'JOB', providerType: 'OLLAMA', paragraphs: 900, characters: 1 } });
    const usage = await app.inject({ method: 'GET', url: '/api/tenant/ai-usage', headers: auth(adminToken) });
    expect(usage.json()).toMatchObject({ plan: 'STANDARD', usedParagraphs: 900, remainingParagraphs: 0, allowed: false, reason: 'QUOTA' });
    const quota = await app.inject({ method: 'POST', url: `/api/khutbahs/${khutbahId}/translate`, headers: auth(adminToken), payload: { languages: ['en'] } });
    expect(quota.statusCode).toBe(403);
    expect(quota.json().error.code).toBe('AI_QUOTA');
    await app.ctx.db.aiUsage.deleteMany({ where: { tenantId } });
  });

  it('an ended subscription keeps AI for the grace period, then switches it off', async () => {
    // a mosque with its own provider is not gated even on a plan without AI
    await setPlan('BASIC');
    await app.ctx.db.providerConfig.updateMany({ where: { id: { in: ownProviders } }, data: { enabled: true } });
    const own = await app.inject({ method: 'POST', url: `/api/khutbahs/${khutbahId}/translate/estimate`, headers: auth(adminToken), payload: { languages: ['en'] } });
    expect(own.statusCode, own.body).toBe(200);
    expect(own.json().ai.allowed).toBe(false);
    expect(own.json().perProvider.length).toBeGreaterThan(0);
    await app.ctx.db.providerConfig.updateMany({ where: { id: { in: ownProviders } }, data: { enabled: false } });

    await setPlan('STANDARD', 'ACTIVE', new Date(Date.now() - 2 * 86_400_000));
    let res = await app.inject({ method: 'GET', url: '/api/tenant/ai-usage', headers: auth(adminToken) });
    expect(res.json()).toMatchObject({ state: 'grace', allowed: true });
    await setPlan('STANDARD', 'ACTIVE', new Date(Date.now() - 9 * 86_400_000));
    res = await app.inject({ method: 'GET', url: '/api/tenant/ai-usage', headers: auth(adminToken) });
    expect(res.json()).toMatchObject({ state: 'expired', allowed: false, reason: 'EXPIRED' });
  });
});

describe('hosted plans: trial defaults and platform overview', () => {
  let createdId = '';
  afterAll(async () => {
    if (createdId) await app.ctx.db.tenant.delete({ where: { id: createdId } }).catch(() => undefined);
  });

  it('a new mosque starts a 30-day Standard trial', async () => {
    const slug = `trial-${Date.now()}`;
    const res = await app.inject({ method: 'POST', url: '/api/tenants', headers: auth(superToken), payload: { name: 'Trial mosque', slug, adminEmail: `${slug}@example.com`, adminName: 'Admin', languages: ['en'] } });
    expect(res.statusCode, res.body).toBe(201);
    const t = res.json().tenant;
    createdId = t.id;
    expect(t.plan).toBe('STANDARD');
    expect(t.subscriptionStatus).toBe('TRIAL');
    const days = (new Date(t.subscriptionEndsAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30);
  });

  it('the platform overview lists every mosque with plan state and usage', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/platform/ai-usage', headers: auth(superToken) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { month: string; applies: boolean; items: Array<{ slug: string; plan: string; state: string; usedParagraphs: number; allowed: boolean }> };
    expect(body.applies).toBe(true);
    expect(body.month).toMatch(/^\d{4}-\d{2}$/);
    const demo = body.items.find((i) => i.slug === 'demo');
    expect(demo).toMatchObject({ plan: 'PRO', state: 'active', allowed: true });
    expect(body.items.some((i) => i.plan === 'STANDARD' && i.state === 'active')).toBe(true);
    const asAdmin = await app.inject({ method: 'GET', url: '/api/platform/ai-usage', headers: auth(adminToken) });
    expect(asAdmin.statusCode).toBe(403);
  });
});

describe('branding: gated by plan, filtered on public info', () => {
  const setPlan = (plan: string) => app.ctx.db.tenant.update({ where: { id: tenantId }, data: { plan: plan as never, subscriptionStatus: 'ACTIVE', subscriptionEndsAt: null } });
  let originalSettings: unknown;
  beforeAll(async () => {
    originalSettings = (await app.ctx.db.tenant.findUniqueOrThrow({ where: { id: tenantId } })).settings;
  });
  afterAll(async () => {
    await app.ctx.db.tenant.update({ where: { id: tenantId }, data: { plan: 'PRO', settings: originalSettings as never } });
  });

  it('lists features by plan', async () => {
    await setPlan('STANDARD');
    const res = await app.inject({ method: 'GET', url: '/api/tenant/features', headers: auth(adminToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ plan: 'STANDARD', state: 'active', features: { colours: true, css: false, poster: true } });
  });

  it('rejects branding above the plan and accepts what the plan includes', async () => {
    await setPlan('BASIC');
    const denied = await app.inject({ method: 'PATCH', url: '/api/tenant', headers: auth(adminToken), payload: { settings: { branding: { primary: '#123456' } } } });
    expect(denied.statusCode, denied.body).toBe(403);
    expect(denied.json().error.code).toBe('FEATURE_NOT_IN_PLAN');
    const ok = await app.inject({ method: 'PATCH', url: '/api/tenant', headers: auth(adminToken), payload: { settings: { branding: { logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' } } } });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().settings.branding.logoDataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('public info shows only what the plan allows and keeps stored values for later', async () => {
    await setPlan('PRO');
    const saved = await app.inject({ method: 'PATCH', url: '/api/tenant', headers: auth(adminToken), payload: { settings: { branding: { primary: '#123456', css: '.j-idle-name{opacity:.9}', hideMark: true } } } });
    expect(saved.statusCode, saved.body).toBe(200);
    let pub = await app.inject({ method: 'GET', url: '/api/public/tenant/demo' });
    expect(pub.json().tenant.branding).toMatchObject({ logoUrl: 'data:image/png;base64,iVBORw0KGgo=', primary: '#123456', css: '.j-idle-name{opacity:.9}', hideMark: true });
    await setPlan('BASIC');
    pub = await app.inject({ method: 'GET', url: '/api/public/tenant/demo' });
    expect(pub.json().tenant.branding).toMatchObject({ logoUrl: 'data:image/png;base64,iVBORw0KGgo=', primary: null, css: null, hideMark: false });
    const stored = await app.ctx.db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect((stored.settings as { branding: { primary: string } }).branding.primary).toBe('#123456');
  });
});

describe('signage: date and announcements between khutbahs, by plan and by date', () => {
  const setPlan = (plan: string) => app.ctx.db.tenant.update({ where: { id: tenantId }, data: { plan: plan as never, subscriptionStatus: 'ACTIVE', subscriptionEndsAt: null } });
  let originalSettings: unknown;
  beforeAll(async () => {
    originalSettings = (await app.ctx.db.tenant.findUniqueOrThrow({ where: { id: tenantId } })).settings;
  });
  afterAll(async () => {
    await app.ctx.db.tenant.update({ where: { id: tenantId }, data: { plan: 'PRO', settings: originalSettings as never } });
  });

  it('Basic cannot switch on signage; Standard can', async () => {
    await setPlan('BASIC');
    const denied = await app.inject({ method: 'PATCH', url: '/api/tenant', headers: auth(adminToken), payload: { settings: { signage: { showDate: true } } } });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('FEATURE_NOT_IN_PLAN');
    await setPlan('STANDARD');
    const today = new Date().toISOString().slice(0, 10);
    const ok = await app.inject({
      method: 'PATCH',
      url: '/api/tenant',
      headers: auth(adminToken),
      payload: {
        settings: {
          signage: {
            showDate: true,
            announcements: [
              { id: 'a1', textAr: 'درس بعد العشاء', textEn: 'Lesson after Isha', enabled: true },
              { id: 'a2', textAr: 'انتهى', textEn: 'Expired', until: '2020-01-01', enabled: true },
              { id: 'a3', textAr: 'مستقبلي', textEn: 'Future', from: '2999-01-01', enabled: true },
              { id: 'a4', textAr: 'معطل', textEn: 'Disabled', enabled: false },
              { id: 'a5', textAr: 'اليوم', textEn: 'Today only', from: today, until: today, enabled: true },
            ],
          },
        },
      },
    });
    expect(ok.statusCode, ok.body).toBe(200);
  });

  it('public info carries only active announcements, and nothing once the plan drops signage', async () => {
    let pub = await app.inject({ method: 'GET', url: '/api/public/tenant/demo' });
    expect(pub.json().tenant.signage.showDate).toBe(true);
    expect(pub.json().tenant.signage.announcements.map((a: { id: string }) => a.id)).toEqual(['a1', 'a5']);
    await setPlan('BASIC');
    pub = await app.inject({ method: 'GET', url: '/api/public/tenant/demo' });
    expect(pub.json().tenant.signage).toEqual({ showDate: false, announcements: [] });
  });

  it('rejects an announcement without any text', async () => {
    await setPlan('STANDARD');
    const bad = await app.inject({ method: 'PATCH', url: '/api/tenant', headers: auth(adminToken), payload: { settings: { signage: { announcements: [{ id: 'x', textAr: ' ', textEn: '' }] } } } });
    expect(bad.statusCode).toBe(400);
  });
});

describe('paid-edition extras: public archive, handouts and insight by plan', () => {
  const setPlan = (plan: string) => app.ctx.db.tenant.update({ where: { id: tenantId }, data: { plan: plan as never, subscriptionStatus: 'ACTIVE', subscriptionEndsAt: null } });
  let originalSettings: unknown;
  let originalStatus = '';
  beforeAll(async () => {
    originalSettings = (await app.ctx.db.tenant.findUniqueOrThrow({ where: { id: tenantId } })).settings;
    originalStatus = (await app.ctx.db.khutbah.findUniqueOrThrow({ where: { id: khutbahId } })).status;
  });
  afterAll(async () => {
    await app.ctx.db.tenant.update({ where: { id: tenantId }, data: { plan: 'PRO', settings: originalSettings as never } });
    await app.ctx.db.khutbah.update({ where: { id: khutbahId }, data: { status: originalStatus as never } });
  });

  it('Basic cannot publish the archive, print handouts or read insight; the public archive stays hidden', async () => {
    await setPlan('BASIC');
    const on = await app.inject({ method: 'PATCH', url: '/api/tenant', headers: auth(adminToken), payload: { settings: { archive: { enabled: true } } } });
    expect(on.statusCode).toBe(403);
    expect(on.json().error.code).toBe('FEATURE_NOT_IN_PLAN');
    expect((await app.inject({ method: 'GET', url: `/api/khutbahs/${khutbahId}/handout`, headers: auth(adminToken) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/insight', headers: auth(adminToken) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/public/archive/demo' })).statusCode).toBe(404);
  });

  it('Standard publishes delivered khutbahs only, with approved translations only', async () => {
    await setPlan('STANDARD');
    const on = await app.inject({ method: 'PATCH', url: '/api/tenant', headers: auth(adminToken), payload: { settings: { archive: { enabled: true } } } });
    expect(on.statusCode, on.body).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/public/tenant/demo' })).json().tenant.archiveEnabled).toBe(true);

    await app.ctx.db.khutbah.update({ where: { id: khutbahId }, data: { status: 'READY' } });
    let list = await app.inject({ method: 'GET', url: '/api/public/archive/demo' });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().items.some((k: { id: string }) => k.id === khutbahId)).toBe(false);
    expect((await app.inject({ method: 'GET', url: `/api/public/archive/demo/${khutbahId}` })).statusCode).toBe(404);

    await app.ctx.db.khutbah.update({ where: { id: khutbahId }, data: { status: 'DELIVERED' } });
    list = await app.inject({ method: 'GET', url: '/api/public/archive/demo' });
    expect(list.json().items.some((k: { id: string }) => k.id === khutbahId)).toBe(true);
    const one = await app.inject({ method: 'GET', url: `/api/public/archive/demo/${khutbahId}` });
    expect(one.statusCode, one.body).toBe(200);
    expect(one.json().khutbah.id).toBe(khutbahId);
    const paras = one.json().khutbah.paragraphs as Array<{ translations: Record<string, { text: string; status: string }> }>;
    expect(paras.length).toBeGreaterThan(0);
    for (const p of paras) for (const tr of Object.values(p.translations)) if (tr.status !== 'APPROVED') expect(tr.text).toBe('');
  });

  it('handout and insight answer on Standard, and a finished session shows up in insight', async () => {
    const h = await app.inject({ method: 'GET', url: `/api/khutbahs/${khutbahId}/handout`, headers: auth(adminToken) });
    expect(h.statusCode, h.body).toBe(200);
    expect(h.json()).toMatchObject({ tenant: { name: expect.any(String) }, khutbah: { id: khutbahId } });

    const start = await app.inject({ method: 'POST', url: '/api/session/start', headers: auth(imamToken), payload: { khutbahId, force: true, deviceId: 'insight-test' } });
    expect(start.statusCode, start.body).toBe(200);
    const end = await app.inject({ method: 'POST', url: '/api/session/end', headers: auth(imamToken) });
    expect(end.statusCode, end.body).toBe(200);

    const ins = await app.inject({ method: 'GET', url: '/api/insight', headers: auth(adminToken) });
    expect(ins.statusCode, ins.body).toBe(200);
    const body = ins.json() as { sessions: Array<{ id: string; khutbahId: string; peakDisplays: number; peakPhones: number; uniquePhones: number; endedAt: string | null }>; summary: { sessions: number } };
    const mine = body.sessions.find((s) => s.id === start.json().sessionId);
    expect(mine).toMatchObject({ khutbahId, peakDisplays: 0, peakPhones: 0, uniquePhones: 0 });
    expect(mine?.endedAt).toBeTruthy();
    expect(body.summary.sessions).toBeGreaterThan(0);
  });

  it('switching the archive off hides it again (always allowed)', async () => {
    const off = await app.inject({ method: 'PATCH', url: '/api/tenant', headers: auth(adminToken), payload: { settings: { archive: { enabled: false } } } });
    expect(off.statusCode, off.body).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/public/archive/demo' })).statusCode).toBe(404);
  });
});

describe('custom domains (Pro) and organisation accounts (hosted edition)', () => {
  const setPlan = (plan: string) => app.ctx.db.tenant.update({ where: { id: tenantId }, data: { plan: plan as never, subscriptionStatus: 'ACTIVE', subscriptionEndsAt: null } });
  const domain = `khutbah-${Date.now().toString(36)}.example.org`;
  const secondSlug = `org-second-${Date.now().toString(36)}`;
  let orgId = '';
  let secondTenantId = '';

  afterAll(async () => {
    await app.ctx.db.user.updateMany({ where: { tenantId }, data: { organisationId: null } });
    await app.ctx.db.tenant.update({ where: { id: tenantId }, data: { plan: 'PRO', customDomain: null, customDomainVerifiedAt: null, organisationId: null } });
    if (secondTenantId) await app.ctx.db.tenant.delete({ where: { id: secondTenantId } });
    if (orgId) await app.ctx.db.organisation.deleteMany({ where: { id: orgId } });
    await app.ctx.redis.del(`host:custom:${domain}`);
  });

  it('Standard cannot set a domain; Pro can, and Jumaah addresses are refused', async () => {
    await setPlan('STANDARD');
    const st = await app.inject({ method: 'GET', url: '/api/tenant/domain', headers: auth(adminToken) });
    expect(st.statusCode).toBe(200);
    expect(st.json()).toMatchObject({ available: false, reason: 'NOT_IN_PLAN', domain: null, target: 'demo.jumaah.test' });
    expect((await app.inject({ method: 'PUT', url: '/api/tenant/domain', headers: auth(adminToken), payload: { domain } })).statusCode).toBe(400);
    await setPlan('PRO');
    expect((await app.inject({ method: 'PUT', url: '/api/tenant/domain', headers: auth(adminToken), payload: { domain: 'evil.jumaah.test' } })).statusCode).toBe(400);
    const ok = await app.inject({ method: 'PUT', url: '/api/tenant/domain', headers: auth(adminToken), payload: { domain: domain.toUpperCase() } });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toMatchObject({ available: true, domain, verified: false, target: 'demo.jumaah.test' });
  });

  it('an unverified domain is not served; a verified one names the mosque for hosts, links, login and CORS', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/public/domain-check?domain=${domain}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/public/host', headers: { host: domain } })).json().tenant).toBeNull();
    // real DNS knows nothing about this made-up name
    const v = await app.inject({ method: 'POST', url: '/api/tenant/domain/verify', headers: auth(adminToken) });
    expect(v.statusCode, v.body).toBe(200);
    expect(v.json().verified).toBe(false);
    expect(v.json().error).toBeTruthy();
    // pretend the CNAME check passed (tests have no DNS to point at the platform)
    await app.ctx.db.tenant.update({ where: { id: tenantId }, data: { customDomainVerifiedAt: new Date() } });
    await app.ctx.redis.del(`host:custom:${domain}`);
    expect((await app.inject({ method: 'GET', url: `/api/public/domain-check?domain=${domain}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/public/host', headers: { host: domain } })).json()).toMatchObject({ slug: 'demo', tenant: { slug: 'demo' } });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { host: domain }, payload: { email: 'admin@demo.mosque', password: 'Demo12345!' } });
    expect(login.statusCode, login.body).toBe(200);
    expect(login.json().user.tenantSlug).toBe('demo');
    const list = await app.inject({ method: 'GET', url: '/api/displays', headers: auth(adminToken) });
    for (const d of list.json() as Array<{ url: string; publicUrl: string }>) {
      expect(d.url.startsWith(`https://${domain}/display/`)).toBe(true);
      expect(d.publicUrl).toBe(`https://${domain}/display/m/demo`);
    }
    const cors = await app.inject({ method: 'OPTIONS', url: '/api/health', headers: { origin: `https://${domain}`, 'access-control-request-method': 'GET' } });
    expect(cors.headers['access-control-allow-origin']).toBe(`https://${domain}`);
    // a plan without the feature switches the domain off without deleting it
    await setPlan('STANDARD');
    await app.ctx.redis.del(`host:custom:${domain}`);
    expect((await app.inject({ method: 'GET', url: `/api/public/domain-check?domain=${domain}` })).statusCode).toBe(404);
    await setPlan('PRO');
    await app.ctx.redis.del(`host:custom:${domain}`);
  });

  it('the super admin creates an organisation, attaches mosques within its limit and names an admin', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/organisations', headers: auth(superToken), payload: { name: 'Awqaf Test', slug: `awqaf-${Date.now().toString(36)}`, maxTenants: 2 } });
    expect(created.statusCode, created.body).toBe(201);
    orgId = created.json().id;
    const add1 = await app.inject({ method: 'POST', url: `/api/organisations/${orgId}/tenants`, headers: auth(superToken), payload: { tenantId } });
    expect(add1.statusCode, add1.body).toBe(200);
    expect(add1.json().tenants).toHaveLength(1);
    expect(add1.json().tenants[0]).toMatchObject({ id: tenantId, plan: 'ENTERPRISE' });

    const t2 = await app.inject({ method: 'POST', url: '/api/tenants', headers: auth(superToken), payload: { name: 'Second Mosque', slug: secondSlug, adminEmail: `admin@${secondSlug}.test`, adminName: 'Second Admin', adminPassword: 'Second12345!', languages: ['en'] } });
    expect(t2.statusCode, t2.body).toBe(201);
    secondTenantId = t2.json().tenant.id;
    const add2 = await app.inject({ method: 'POST', url: `/api/organisations/${orgId}/tenants`, headers: auth(superToken), payload: { tenantId: secondTenantId } });
    expect(add2.statusCode, add2.body).toBe(200);
    expect(add2.json().tenants).toHaveLength(2);

    // the limit: shrink it to one and try to re-attach a detached mosque
    expect((await app.inject({ method: 'DELETE', url: `/api/organisations/${orgId}/tenants/${secondTenantId}`, headers: auth(superToken) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PATCH', url: `/api/organisations/${orgId}`, headers: auth(superToken), payload: { maxTenants: 1 } })).statusCode).toBe(200);
    const full = await app.inject({ method: 'POST', url: `/api/organisations/${orgId}/tenants`, headers: auth(superToken), payload: { tenantId: secondTenantId } });
    expect(full.statusCode).toBe(409);
    expect((await app.inject({ method: 'PATCH', url: `/api/organisations/${orgId}`, headers: auth(superToken), payload: { maxTenants: 2 } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/organisations/${orgId}/tenants`, headers: auth(superToken), payload: { tenantId: secondTenantId } })).statusCode).toBe(200);

    const admin = await app.inject({ method: 'POST', url: `/api/organisations/${orgId}/admins`, headers: auth(superToken), payload: { email: 'admin@demo.mosque' } });
    expect(admin.statusCode, admin.body).toBe(200);
    expect(admin.json().admins).toHaveLength(1);
    expect((await app.inject({ method: 'POST', url: `/api/organisations/${orgId}/admins`, headers: auth(superToken), payload: { email: 'nobody@example.org' } })).statusCode).toBe(404);
    // a mosque admin cannot touch organisations
    expect((await app.inject({ method: 'GET', url: '/api/organisations', headers: auth(adminToken) })).statusCode).toBe(403);
  });

  it('an organisation admin switches between member mosques, shares the AI pool, and not beyond', async () => {
    const l = await login('admin@demo.mosque', 'Demo12345!');
    expect(l.user).toMatchObject({ organisationId: orgId });
    const orgTok = l.accessToken;
    const mine = await app.inject({ method: 'GET', url: '/api/organisation', headers: auth(orgTok) });
    expect(mine.statusCode, mine.body).toBe(200);
    expect(mine.json().tenants.map((t: { id: string }) => t.id).sort()).toEqual([tenantId, secondTenantId].sort());
    const other = await app.inject({ method: 'GET', url: '/api/tenant', headers: { ...auth(orgTok), 'x-tenant-id': secondTenantId } });
    expect(other.statusCode, other.body).toBe(200);
    expect(other.json().id).toBe(secondTenantId);
    expect((await app.inject({ method: 'GET', url: '/api/tenant', headers: { ...auth(orgTok), 'x-tenant-id': 'not-a-member' } })).statusCode).toBe(403);
    // a staff member who is not an organisation admin stays pinned to their own mosque
    const pinned = await app.inject({ method: 'GET', url: '/api/tenant', headers: { ...auth(translatorToken), 'x-tenant-id': secondTenantId } });
    expect(pinned.statusCode, pinned.body).toBe(200);
    expect(pinned.json().id).toBe(tenantId);
    // the allowance of a member mosque is the organisation's pool
    const usage = await app.inject({ method: 'GET', url: '/api/tenant/ai-usage', headers: { ...auth(orgTok), 'x-tenant-id': secondTenantId } });
    expect(usage.statusCode, usage.body).toBe(200);
    expect(usage.json()).toMatchObject({ plan: 'ENTERPRISE', monthlyParagraphs: 22500 });
    // detaching the mosque takes the right away
    expect((await app.inject({ method: 'DELETE', url: `/api/organisations/${orgId}/tenants/${tenantId}`, headers: auth(superToken) })).statusCode).toBe(200);
    expect((await login('admin@demo.mosque', 'Demo12345!')).user.organisationId).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/api/organisation', headers: auth(orgTok) })).statusCode).toBe(403);
  });
});
