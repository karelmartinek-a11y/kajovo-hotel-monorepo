import { defineConfig, devices } from '@playwright/test';

declare const process: {
  env: Record<string, string | undefined>;
};

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
    { name: 'audit-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'audit-1024', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'audit-768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'audit-430', use: { ...devices['Pixel 7'], viewport: { width: 430, height: 932 } } },
    { name: 'audit-360', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 834, height: 1112 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
