import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'auth-smoke.spec.ts',
  timeout: 40_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:8010',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'corepack pnpm --dir ../kajovo-hotel-api exec python -m app.tools.e2e_seed && corepack pnpm --dir ../kajovo-hotel-api exec uvicorn app.main:app --host 127.0.0.1 --port 8010',
    cwd: '.',
    port: 8010,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
