import { defineConfig, devices } from '@playwright/test';

/**
 * Browser e2e against a running stack (docker compose in CI: nginx on :4200
 * proxying /api to NestJS + PostgreSQL). Locally: `pnpm dev` (or compose), then
 * `pnpm --filter web e2e`. Set PW_CHANNEL=chrome to use an installed Chrome.
 */
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';
const channel = process.env['PW_CHANNEL'] || undefined;
const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts$/,
  outputDir: './test-results',
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : 1,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    // Native widgets (e.g. <input type="date">) follow the browser UI language.
    launchOptions: { args: ['--lang=es-CO'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
  ],
});
