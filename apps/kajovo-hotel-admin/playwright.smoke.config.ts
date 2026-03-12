import { defineConfig } from '@playwright/test';
import path from 'path';
import { getAdminCredentials } from './test-admin-credentials';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:18000';
const smokeDbPath = process.env.SMOKE_DB_PATH ?? '/tmp/kajovo-smoke-e2e.db';
const isWin = process.platform === 'win32';
const { email: adminEmail, password: adminPassword } = getAdminCredentials();

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\"'\"'`)}'`;
const powerShellQuote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const dbPathNormalized = isWin ? smokeDbPath.replace(/\\/g, '/') : smokeDbPath;
const initDbCommand = isWin
  ? `powershell -NoLogo -NoProfile -Command "$env:PYTHONPATH='..\\\\kajovo-hotel-api'; python ..\\\\kajovo-hotel-api\\\\scripts\\\\init_smoke_db.py ${smokeDbPath}"`
  : `PYTHONPATH=../kajovo-hotel-api python ../kajovo-hotel-api/scripts/init_smoke_db.py ${smokeDbPath}`;

const apiEnv = [
  `PYTHONPATH=../kajovo-hotel-api`,
  `KAJOVO_API_DATABASE_URL=sqlite:///${dbPathNormalized}`,
  `KAJOVO_API_SMTP_ENABLED=false`,
  `KAJOVO_API_ENVIRONMENT=test`,
  `KAJOVO_API_ADMIN_EMAIL=${shellQuote(adminEmail)}`,
  `KAJOVO_API_ADMIN_PASSWORD=${shellQuote(adminPassword)}`,
].join(' ');

const apiEnvWin = [
  `$env:PYTHONPATH='..\\\\kajovo-hotel-api'`,
  `$env:KAJOVO_API_DATABASE_URL='sqlite:///${dbPathNormalized}'`,
  `$env:KAJOVO_API_SMTP_ENABLED='false'`,
  `$env:KAJOVO_API_ENVIRONMENT='test'`,
  `$env:KAJOVO_API_ADMIN_EMAIL=${powerShellQuote(adminEmail)}`,
  `$env:KAJOVO_API_ADMIN_PASSWORD=${powerShellQuote(adminPassword)}`,
].join('; ');

const apiCommand = isWin
  ? `powershell -NoLogo -NoProfile -Command \"${apiEnvWin}; python -m uvicorn app.main:app --host 127.0.0.1 --port 18000\"`
  : `${apiEnv} uvicorn app.main:app --host 127.0.0.1 --port 18000`;

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
    command: `${initDbCommand} && ${apiCommand}`,
    cwd: path.resolve('.'),
    url: `${apiBaseUrl}/health`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
