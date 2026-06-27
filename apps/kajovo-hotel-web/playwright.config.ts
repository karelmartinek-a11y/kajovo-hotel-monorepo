import { defineConfig, devices } from '@playwright/test';

declare const process: {
  env: Record<string, string | undefined>;
  execPath: string;
};

const webPort = Number(process.env.PLAYWRIGHT_WEB_PORT ?? '4173');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${webPort}`;
const pnpmCliPath = process.env.PLAYWRIGHT_PNPM_CLI ?? `${process.env.HOME ?? ''}/.cache/node/corepack/v1/pnpm/9.15.0/bin/pnpm.cjs`;
const pnpmCommand = `"${process.execPath}" "${pnpmCliPath}"`;
const previewCommand = `${pnpmCommand} --filter @kajovo/kajovo-hotel-web preview --host 0.0.0.0 --port ${webPort} --strictPort`;
const webServerCommand = `${pnpmCommand} --filter @kajovo/kajovo-hotel-web build && ${previewCommand}`;

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
    command: webServerCommand,
    cwd: '.',
    port: webPort,
    env: {
      PLAYWRIGHT_API_PORT: process.env.PLAYWRIGHT_API_PORT ?? '8000',
      VITE_SKIP_EMPTY_OUT_DIR: '1',
      VITE_SKIP_LOCKED_DOWNLOADS: '1',
    },
    reuseExistingServer: false,
  },
  projects: [
    { name: 'audit-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'audit-1024', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'audit-768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'audit-430', use: { ...devices['Pixel 7'], viewport: { width: 430, height: 932 } } },
    { name: 'audit-360', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    {
      name: 'tablet',
      use: {
        ...devices['iPad (gen 7)'],
        browserName: 'chromium',
        hasTouch: false,
        isMobile: false,
      },
    },
    {
      name: 'phone',
      use: {
        ...devices['Pixel 7'],
        hasTouch: false,
        isMobile: false,
      },
    },
  ],
});
