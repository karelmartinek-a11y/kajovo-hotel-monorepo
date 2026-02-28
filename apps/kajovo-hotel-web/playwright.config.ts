import { defineConfig, devices } from '@playwright/test';

const previewCommand = 'VITE_DISABLE_API_PROXY=1 pnpm --filter @kajovo/kajovo-hotel-web preview --host 0.0.0.0 --port 4173 --strictPort';
const webServerCommand = `VITE_DISABLE_API_PROXY=1 pnpm --filter @kajovo/kajovo-hotel-web build && ${previewCommand}`;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: webServerCommand,
    cwd: '.',
    port: 4173,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    {
      name: 'tablet',
      use: {
        ...devices['iPad (gen 7)'],
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
