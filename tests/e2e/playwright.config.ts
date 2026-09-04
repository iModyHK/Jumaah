import { defineConfig, devices } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';
const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://localhost:5173';
const IMAM_URL = process.env.E2E_IMAM_URL ?? 'http://localhost:5174';
const DISPLAY_URL = process.env.E2E_DISPLAY_URL ?? 'http://localhost:5175';

const env = {
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://jumaah:jumaah_dev_password@localhost:5432/jumaah?schema=public',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET ?? 'e2e-secret-e2e-secret-e2e-secret',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? 'e2e-encryption-key-e2e-encryption',
  PUBLIC_BASE_URL: DISPLAY_URL,
  CORS_ORIGINS: `${ADMIN_URL},${IMAM_URL},${DISPLAY_URL}`,
  RATE_LIMIT_AUTH: '1000',
  RATE_LIMIT_GENERAL: '10000',
  DEPLOYMENT_MODE: 'edge',
  VITE_API_URL: '',
};

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ar',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'pnpm --filter @jumaah/api dev', url: `${API_URL}/api/health`, reuseExistingServer: true, timeout: 120_000, env, cwd: '../..' },
    { command: 'pnpm --filter @jumaah/display dev', url: `${DISPLAY_URL}/display/`, reuseExistingServer: true, timeout: 120_000, env, cwd: '../..' },
    { command: 'pnpm --filter @jumaah/imam dev', url: `${IMAM_URL}/imam/`, reuseExistingServer: true, timeout: 120_000, env, cwd: '../..' },
    { command: 'pnpm --filter @jumaah/admin dev', url: `${ADMIN_URL}/admin/`, reuseExistingServer: true, timeout: 120_000, env, cwd: '../..' },
  ],
});
