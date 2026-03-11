import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'corepack pnpm build && corepack pnpm preview --host 127.0.0.1 --port 4173',
    cwd: '.',
    port: 4173,
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
