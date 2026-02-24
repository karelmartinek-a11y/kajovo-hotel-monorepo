import { defineConfig } from '@playwright/test';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:18000';
const smokeDbPath = process.env.SMOKE_DB_PATH ?? '/tmp/kajovo-smoke-e2e.db';

export default defineConfig({
  testDir: './tests',
  testMatch: 'e2e-smoke.spec.ts',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: apiBaseUrl,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: [
      `PYTHONPATH=../kajovo-hotel-api python ../kajovo-hotel-api/scripts/init_smoke_db.py ${smokeDbPath}`,
      `PYTHONPATH=../kajovo-hotel-api KAJOVO_API_DATABASE_URL=sqlite:///${smokeDbPath} KAJOVO_API_SMTP_ENABLED=false KAJOVO_API_ENVIRONMENT=test uvicorn app.main:app --host 127.0.0.1 --port 18000`,
    ].join(' && '),
    cwd: '.',
    url: `${apiBaseUrl}/health`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
