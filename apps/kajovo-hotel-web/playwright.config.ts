import { defineConfig, devices } from '@playwright/test';

declare const process: {
  env: Record<string, string | undefined>;
};

const webPort = Number(process.env.PLAYWRIGHT_WEB_PORT ?? '4173');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${webPort}`;
const previewCommand = `pnpm --filter @kajovo/kajovo-hotel-web preview --host 0.0.0.0 --port ${webPort} --strictPort`;
const webServerCommand = `pnpm --filter @kajovo/kajovo-hotel-web build && ${previewCommand}`;

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
      VITE_DISABLE_API_PROXY: '1',
      VITE_ENABLE_QA_RUNTIME: '1',
      VITE_QA_SERVICE_DATE: '2026-02-19',
    },
    reuseExistingServer: true,
  },
  projects: [
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
