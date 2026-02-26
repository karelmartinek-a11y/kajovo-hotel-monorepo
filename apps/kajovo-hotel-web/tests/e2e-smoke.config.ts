import { defineConfig, devices } from '@playwright/test';

const apiPort = 8000;
const adminPort = 4173;
const portalPort = 4174;

export default defineConfig({
  testDir: './e2e-smoke',
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
        "bash -lc 'set -euo pipefail; ROOT=$(git rev-parse --show-toplevel); cd \"$ROOT/apps/kajovo-hotel-api\"; mkdir -p data; rm -f data/e2e-smoke.sqlite3; export KAJOVO_API_DATABASE_URL=sqlite:///./data/e2e-smoke.sqlite3; export KAJOVO_API_SMTP_ENABLED=false; export PYTHONPATH=.; python scripts/init_e2e_smoke_db.py; uvicorn app.main:app --host 127.0.0.1 --port 8000'",
      cwd: '.',
      url: `http://127.0.0.1:${apiPort}/health`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command:
        "bash -lc 'set -euo pipefail; ROOT=$(git rev-parse --show-toplevel); cd \"$ROOT/apps/kajovo-hotel-admin\"; corepack pnpm build && corepack pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort'",
      cwd: '.',
      url: `http://127.0.0.1:${adminPort}/`,
      timeout: 300_000,
      reuseExistingServer: false,
    },
    {
      command:
        "bash -lc 'set -euo pipefail; ROOT=$(git rev-parse --show-toplevel); cd \"$ROOT/apps/kajovo-hotel-web\"; corepack pnpm build && corepack pnpm exec vite preview --host 127.0.0.1 --port 4174 --strictPort'",
      cwd: '.',
      url: `http://127.0.0.1:${portalPort}/`,
      timeout: 300_000,
      reuseExistingServer: false,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
