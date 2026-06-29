import { defineConfig } from '@playwright/test';
import path from 'path';
import { getAdminCredentials } from './test-admin-credentials';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:18000';
const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4174';
const smokeDbPath = process.env.SMOKE_DB_PATH ?? '/tmp/kajovo-smoke-e2e.db';
const smokeSmtpCapturePath = process.env.SMOKE_SMTP_CAPTURE_PATH ?? '/tmp/kajovo-smoke-e2e-smtp.jsonl';
const isWin = process.platform === 'win32';
const { email: adminEmail, password: adminPassword } = getAdminCredentials();

const isUnsupportedPnpmExecPath = (value: string): boolean =>
  value.includes('/pnpm@11.') || value.includes('\\pnpm@11.');

const resolvePnpmCommand = (): string => {
  const pnpmExecPath = process.env.PLAYWRIGHT_PNPM_CLI ?? process.env.npm_execpath;
  if (pnpmExecPath && !isUnsupportedPnpmExecPath(pnpmExecPath)) {
    return `"${process.execPath}" "${pnpmExecPath}"`;
  }
  if (process.env.COREPACK_ROOT) {
    return `"${process.execPath}" "${process.env.COREPACK_ROOT}/dist/pnpm.js"`;
  }
  return isWin ? 'corepack pnpm.cmd' : 'corepack pnpm';
};

const pnpmCommand = resolvePnpmCommand();

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\"'\"'`)}'`;
const powerShellQuote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const dbPathNormalized = isWin ? smokeDbPath.replace(/\\/g, '/') : smokeDbPath;
const pythonCmd = isWin ? 'python' : 'python3';
const initDbCommand = isWin
  ? `powershell -NoLogo -NoProfile -Command "$env:PYTHONPATH='..\\\\kajovo-hotel-api'; ${pythonCmd} ..\\\\kajovo-hotel-api\\\\scripts\\\\init_smoke_db.py ${smokeDbPath}"`
  : `PYTHONPATH=../kajovo-hotel-api ${pythonCmd} ../kajovo-hotel-api/scripts/init_smoke_db.py ${smokeDbPath}`;

const apiEnv = [
  `PYTHONPATH=../kajovo-hotel-api`,
  `KAJOVO_API_DATABASE_URL=sqlite:///${dbPathNormalized}`,
  `KAJOVO_API_SMTP_ENABLED=false`,
  `KAJOVO_API_SMTP_CAPTURE_PATH=${shellQuote(smokeSmtpCapturePath)}`,
  `KAJOVO_API_ENVIRONMENT=test`,
  `KAJOVO_API_ADMIN_EMAIL=${shellQuote(adminEmail)}`,
  `KAJOVO_API_ADMIN_PASSWORD=${shellQuote(adminPassword)}`,
].join(' ');

const apiEnvWin = [
  `$env:PYTHONPATH='..\\\\kajovo-hotel-api'`,
  `$env:KAJOVO_API_DATABASE_URL='sqlite:///${dbPathNormalized}'`,
  `$env:KAJOVO_API_SMTP_ENABLED='false'`,
  `$env:KAJOVO_API_SMTP_CAPTURE_PATH=${powerShellQuote(smokeSmtpCapturePath)}`,
  `$env:KAJOVO_API_ENVIRONMENT='test'`,
  `$env:KAJOVO_API_ADMIN_EMAIL=${powerShellQuote(adminEmail)}`,
  `$env:KAJOVO_API_ADMIN_PASSWORD=${powerShellQuote(adminPassword)}`,
].join('; ');

const apiCommand = isWin
  ? `powershell -NoLogo -NoProfile -Command \"${apiEnvWin}; ${pythonCmd} -m uvicorn app.main:app --host 127.0.0.1 --port 18000\"`
  : `${apiEnv} ${pythonCmd} -m uvicorn app.main:app --host 127.0.0.1 --port 18000`;

const appCommand = isWin
  ? `powershell -NoLogo -NoProfile -Command \"$env:PLAYWRIGHT_API_PORT='18000'; ${pnpmCommand} dev --host 127.0.0.1 --port 4174\"`
  : `PLAYWRIGHT_API_PORT=18000 ${pnpmCommand} dev --host 127.0.0.1 --port 4174`;

export default defineConfig({
  testDir: './tests',
  testMatch: 'e2e-smoke.spec.ts',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: appBaseUrl,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `${initDbCommand} && ${apiCommand}`,
      cwd: path.resolve('.'),
      url: `${apiBaseUrl}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: appCommand,
      cwd: path.resolve('.'),
      url: `${appBaseUrl}/admin/`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
