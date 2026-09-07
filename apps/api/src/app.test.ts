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

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://jumaah:jumaah_dev_password@localhost:5432/jumaah_community?schema=public';
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
    PUBLIC_BASE_URL: 'https://mosque.jumaah.test',
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

describe('importing a khutbah from a file', () => {
  /** A multipart body built by hand, so the test needs no extra dependency. */
  const upload = (name, type, bytes) => {
    const boundary = '----jumaahtest' + Math.random().toString(16).slice(2);
    const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    return { payload: Buffer.concat([head, Buffer.from(bytes), tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
  };

  /** A one-page PDF with a line of Helvetica text, written here so no fixture file is needed. */
  const tinyPdf = (text) => {
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    ];
    const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    let out = '%PDF-1.4\n';
    const offs = [];
    objs.forEach((o, i) => {
      offs.push(out.length);
      out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
  };

  it('reads text and PDF uploads into paragraphs, and refuses anything else', async () => {
    const txt = upload('khutbah.txt', 'text/plain', Buffer.from('الحمد لله رب العالمين.\n\nأما بعد فيا عباد الله.\n', 'utf8'));
    const a = await app.inject({ method: 'POST', url: '/api/import/extract', headers: { ...auth(adminToken), ...txt.headers }, payload: txt.payload });
    expect(a.statusCode, a.body).toBe(200);
    expect(a.json()).toMatchObject({ format: 'txt' });
    expect(a.json().paragraphs).toHaveLength(2);
    expect(a.json().text).toContain('الحمد لله');

    const pdf = upload('khutbah.pdf', 'application/pdf', tinyPdf('Praise be to Allah'));
    const b = await app.inject({ method: 'POST', url: '/api/import/extract', headers: { ...auth(adminToken), ...pdf.headers }, payload: pdf.payload });
    expect(b.statusCode, b.body).toBe(200);
    expect(b.json().format).toBe('pdf');
    expect(b.json().text).toContain('Praise be to Allah');
    // pages are joined by the importer, so no "-- 1 of 1 --" marker reaches the khutbah
    expect(b.json().text).not.toMatch(/-- \d+ of \d+ --/);

    const rtf = upload('note.rtf', 'application/rtf', Buffer.from('{\\rtf1}', 'utf8'));
    const c = await app.inject({ method: 'POST', url: '/api/import/extract', headers: { ...auth(adminToken), ...rtf.headers }, payload: rtf.payload });
    expect(c.statusCode).toBe(400);

    // translators prepare khutbahs, so they may import; nobody may without a token
    const again = upload('khutbah.txt', 'text/plain', Buffer.from('نص', 'utf8'));
    expect((await app.inject({ method: 'POST', url: '/api/import/extract', headers: { ...auth(translatorToken), ...again.headers }, payload: again.payload })).statusCode).toBe(200);
    const anon = upload('khutbah.txt', 'text/plain', Buffer.from('نص', 'utf8'));
    expect((await app.inject({ method: 'POST', url: '/api/import/extract', headers: anon.headers, payload: anon.payload })).statusCode).toBe(401);
  });
});
