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
    command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4173',
    cwd: __dirname,
    port: 4173,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
