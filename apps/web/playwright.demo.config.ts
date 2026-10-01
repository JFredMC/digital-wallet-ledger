import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke test of the GitHub Pages demo build (in-browser backend, no API).
 * Default: serves dist/web/browser like Pages does (run `pnpm build:pages` first).
 * DEMO_BASE_URL=https://jfredmc.github.io/digital-wallet-ledger/ runs it against the live site.
 */
const liveUrl = process.env['DEMO_BASE_URL'];
const baseURL = liveUrl ?? 'http://localhost:4300/digital-wallet-ledger/';
const channel = process.env['PW_CHANNEL'] || undefined;
const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.demo\.ts$/,
  outputDir: './test-results/demo',
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : 1,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: isCI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report/demo' }]]
    : 'list',
  use: {
    baseURL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: liveUrl
    ? undefined
    : {
        command: 'node scripts/serve-pages.mjs',
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: 15_000,
      },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
  ],
});
