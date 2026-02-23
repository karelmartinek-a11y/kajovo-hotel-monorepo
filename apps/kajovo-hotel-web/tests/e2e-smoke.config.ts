import { defineConfig, devices } from '@playwright/test';

const apiPort = 8000;
const adminPort = 4173;
const portalPort = 4174;

export default defineConfig({
  testDir: './tests/e2e-smoke',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${adminPort}`,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command:
        "bash -lc 'set -euo pipefail; cd apps/kajovo-hotel-api; mkdir -p data; rm -f data/e2e-smoke.sqlite3; export KAJOVO_API_DATABASE_URL=sqlite:///./data/e2e-smoke.sqlite3; export KAJOVO_API_SMTP_ENABLED=false; export PYTHONPATH=.; python scripts/init_e2e_smoke_db.py; uvicorn app.main:app --host 127.0.0.1 --port 8000'",
      cwd: '../../..',
      port: apiPort,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'corepack pnpm --filter @kajovo/kajovo-hotel-admin dev -- --host 127.0.0.1 --port 4173 --strictPort',
      cwd: '../../..',
      port: adminPort,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'corepack pnpm --filter @kajovo/kajovo-hotel-web dev -- --host 127.0.0.1 --port 4174 --strictPort',
      cwd: '../../..',
      port: portalPort,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
