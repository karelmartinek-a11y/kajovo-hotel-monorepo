import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.PLAYWRIGHT_WEB_PORT ?? '4173');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 4,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `corepack pnpm build && corepack pnpm preview --host 127.0.0.1 --port ${webPort}`,
    cwd: '.',
    port: webPort,
    env: {
      VITE_ENABLE_QA_RUNTIME: '1',
      VITE_QA_SERVICE_DATE: '2026-02-19',
    },
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 834, height: 1112 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
