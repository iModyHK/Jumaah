/**
 * End-to-end: upload → translate → approve → broadcast → display.
 * Setup goes through the REST API (fast, deterministic); the assertions run in real browsers
 * against the display screen, the imam PWA and the admin dashboard.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';
const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://localhost:5173';
const IMAM_URL = process.env.E2E_IMAM_URL ?? 'http://localhost:5174';
const DISPLAY_URL = process.env.E2E_DISPLAY_URL ?? 'http://localhost:5175';
const DISPLAY_TOKEN = 'demo-main-display-token-0001';

const P1_AR = 'الحمد لله رب العالمين، والصلاة والسلام على رسول الله.';
const P2_AR = 'أما بعد، فاتقوا الله عباد الله حق التقوى.';
const P3_AR = 'قال تعالى: ﴿وَاتَّقُوا اللَّهَ وَاعْلَمُوا أَنَّ اللَّهَ مَعَ الْمُتَّقِينَ﴾ [البقرة: 194]';
const P1_EN = 'E2E praise be to Allah, Lord of the worlds.';
const P2_EN = 'E2E O servants of Allah, fear Allah as He should be feared.';
const P3_EN = 'E2E And fear Allah and know that Allah is with the righteous. [Al-Baqarah: 194]';
const P1_UR = 'E2E تمام تعریفیں اللہ کے لیے ہیں۔';
const P2_UR = 'E2E اللہ کے بندو، اللہ سے ڈرو۔';
const P3_UR = 'E2E اور اللہ سے ڈرو اور جان لو کہ اللہ متقیوں کے ساتھ ہے۔';

async function login(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API_URL}/api/auth/login`, { data: { email, password } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { accessToken: string }).accessToken;
}

let adminToken: string;
let imamToken: string;
let khutbahId: string;

test.beforeAll(async ({ request }) => {
  adminToken = await login(request, 'admin@demo.mosque', 'Demo12345!');
  imamToken = await login(request, 'imam@demo.mosque', 'Demo12345!');
  // make sure no session is running from a previous run
  await request.post(`${API_URL}/api/session/end`, { headers: { authorization: `Bearer ${imamToken}` } });

  // 1) upload
  const created = await request.post(`${API_URL}/api/khutbahs`, {
    headers: { authorization: `Bearer ${adminToken}` },
    data: {
      title: 'خطبة اختبار E2E',
      gregorianDate: '2026-09-18',
      targetLanguages: ['en', 'ur'],
      sections: [{ type: 'FIRST', rawText: `${P1_AR}\n\n${P2_AR}\n\n${P3_AR}` }],
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  khutbahId = ((await created.json()) as { id: string }).id;

  // 2) translate (manual import stands in for a provider — no network keys in CI)
  for (const [lang, texts] of [
    ['en', [P1_EN, P2_EN, P3_EN]],
    ['ur', [P1_UR, P2_UR, P3_UR]],
  ] as const) {
    const imp = await request.post(`${API_URL}/api/khutbahs/${khutbahId}/translations/import`, {
      headers: { authorization: `Bearer ${adminToken}` },
      data: { lang, texts: [...texts], sectionType: 'FIRST', status: 'REVIEWED' },
    });
    expect(imp.ok(), await imp.text()).toBeTruthy();
  }
  // 3) approve
  const approve = await request.post(`${API_URL}/api/khutbahs/${khutbahId}/approve-all`, { headers: { authorization: `Bearer ${adminToken}` }, data: {} });
  expect(approve.ok()).toBeTruthy();
  const k = await (await request.get(`${API_URL}/api/khutbahs/${khutbahId}`, { headers: { authorization: `Bearer ${adminToken}` } })).json();
  expect(k.status).toBe('READY');
});

test.afterAll(async ({ request }) => {
  await request.post(`${API_URL}/api/session/end`, { headers: { authorization: `Bearer ${imamToken}` } });
  if (khutbahId) await request.delete(`${API_URL}/api/khutbahs/${khutbahId}`, { headers: { authorization: `Bearer ${adminToken}` } });
});

test('display shows the waiting screen, then follows the imam paragraph by paragraph', async ({ page, request }) => {
  await page.goto(`${DISPLAY_URL}/display/${DISPLAY_TOKEN}`);
  // waiting screen: mosque name from the seed
  await expect(page.getByText('المسجد التجريبي').first()).toBeVisible();

  // 4) broadcast — imam starts the session (device tablet-e2e)
  const start = await request.post(`${API_URL}/api/session/start`, { headers: { authorization: `Bearer ${imamToken}` }, data: { khutbahId, deviceId: 'tablet-e2e' } });
  expect(start.ok(), await start.text()).toBeTruthy();

  // 5) display — main display is configured for en + ur (split layout)
  const t0 = Date.now();
  await expect(page.getByText(P1_EN)).toBeVisible();
  await expect(page.getByText(P1_UR)).toBeVisible();
  const firstPaint = Date.now() - t0;
  console.log(`display updated ${firstPaint}ms after session start`);

  const t1 = Date.now();
  await request.post(`${API_URL}/api/session/command`, { headers: { authorization: `Bearer ${imamToken}` }, data: { command: { type: 'next' }, deviceId: 'tablet-e2e' } });
  await expect(page.getByText(P2_EN)).toBeVisible();
  const latency = Date.now() - t1;
  console.log(`paragraph change latency (incl. HTTP + render): ${latency}ms`);
  expect(latency).toBeLessThan(2000);

  // Quran paragraph renders with its reference
  await request.post(`${API_URL}/api/session/command`, { headers: { authorization: `Bearer ${imamToken}` }, data: { command: { type: 'next' } } });
  await expect(page.getByText(P3_EN)).toBeVisible();

  // improvisation → all panels show "imam is speaking"
  await request.post(`${API_URL}/api/session/command`, { headers: { authorization: `Bearer ${imamToken}` }, data: { command: { type: 'improv' } } });
  await expect(page.getByText(/imam is speaking/i).first()).toBeVisible();
  await expect(page.getByText(P3_EN)).toBeHidden();
  await request.post(`${API_URL}/api/session/command`, { headers: { authorization: `Bearer ${imamToken}` }, data: { command: { type: 'improv' } } });
  await expect(page.getByText(P3_EN)).toBeVisible();

  // previous paragraph
  await request.post(`${API_URL}/api/session/command`, { headers: { authorization: `Bearer ${imamToken}` }, data: { command: { type: 'prev' } } });
  await expect(page.getByText(P2_EN)).toBeVisible();

  // end → ended message then back to waiting
  await request.post(`${API_URL}/api/session/end`, { headers: { authorization: `Bearer ${imamToken}` } });
  await expect(page.getByText(P2_EN)).toBeHidden();
  await expect(page.getByText('المسجد التجريبي').first()).toBeVisible({ timeout: 20_000 });
});

test('a display that connects late receives the current state immediately', async ({ page, request }) => {
  const start = await request.post(`${API_URL}/api/session/start`, { headers: { authorization: `Bearer ${imamToken}` }, data: { khutbahId, deviceId: 'tablet-e2e', force: true } });
  expect(start.ok()).toBeTruthy();
  await request.post(`${API_URL}/api/session/command`, { headers: { authorization: `Bearer ${imamToken}` }, data: { command: { type: 'next' } } });
  await page.goto(`${DISPLAY_URL}/display/${DISPLAY_TOKEN}`);
  await expect(page.getByText(P2_EN)).toBeVisible();
  await request.post(`${API_URL}/api/session/end`, { headers: { authorization: `Bearer ${imamToken}` } });
});

test('public mobile page lets a worshipper pick a language', async ({ page, request }) => {
  await request.post(`${API_URL}/api/session/start`, { headers: { authorization: `Bearer ${imamToken}` }, data: { khutbahId, deviceId: 'tablet-e2e', force: true } });
  await page.goto(`${DISPLAY_URL}/display/m/demo`);
  await expect(page.getByText('المسجد التجريبي').first()).toBeVisible();
  // English is the first tenant language → shown by default or after picking it
  const english = page.getByRole('button', { name: /English/ });
  if (await english.count()) await english.first().click();
  await expect(page.getByText(P1_EN)).toBeVisible();
  await request.post(`${API_URL}/api/session/end`, { headers: { authorization: `Bearer ${imamToken}` } });
});

async function uiLogin(page: Page, url: string, email: string) {
  await page.goto(url);
  await page.getByRole('textbox', { name: /email|البريد/i }).or(page.locator('input[type="email"]')).first().fill(email);
  await page.locator('input[type="password"]').first().fill('Demo12345!');
  const loginButton = page.getByRole('button', { name: /تسجيل الدخول|log in/i }).first();
  await loginButton.click();
  // wait for the login round-trip to finish (the form disappears) before navigating elsewhere
  await expect(page.locator('input[type="password"]')).toBeHidden({ timeout: 20_000 });
}

test('imam PWA: pick the khutbah, go live, advance with the big Next button', async ({ page, request }) => {
  await request.post(`${API_URL}/api/session/end`, { headers: { authorization: `Bearer ${imamToken}` } });
  await uiLogin(page, `${IMAM_URL}/imam/`, 'imam@demo.mosque');
  const card = page.locator('li', { hasText: 'خطبة اختبار E2E' }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /بدء الخطبة|start khutbah|استئناف|resume/i }).click();
  await expect(page.getByText(P1_AR).first()).toBeVisible();
  await page.getByRole('button', { name: /^التالي$|^next$/i }).first().click();
  await expect.poll(async () => {
    const s = await (await request.get(`${API_URL}/api/session`, { headers: { authorization: `Bearer ${imamToken}` } })).json();
    return s.session.currentIndex;
  }).toBe(1);
  await expect(page.getByText(P2_AR).first()).toBeVisible();
  await request.post(`${API_URL}/api/session/end`, { headers: { authorization: `Bearer ${imamToken}` } });
});

test('admin dashboard: the khutbah appears as READY in the list', async ({ page }) => {
  await uiLogin(page, `${ADMIN_URL}/admin/login`, 'admin@demo.mosque');
  await page.goto(`${ADMIN_URL}/admin/khutbahs`);
  await expect(page.getByText('خطبة اختبار E2E').first()).toBeVisible();
  await page.getByText('خطبة اختبار E2E').first().click();
  await expect(page.getByText(P1_AR).first()).toBeVisible();
  await expect(page.getByText(P1_EN).first()).toBeVisible();
});
