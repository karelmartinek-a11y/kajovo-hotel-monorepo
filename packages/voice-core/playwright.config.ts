import {defineConfig, devices} from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'console.spec.ts', fullyParallel: false, workers: 1,
  reporter: [['line'], ['junit', {outputFile: 'test-results/junit.xml'}], ['html', {open: 'never'}]],
  use: {baseURL: 'http://127.0.0.1:4186', trace: 'retain-on-failure', screenshot: 'only-on-failure'},
  projects: [
    {name: 'desktop-chromium', use: {...devices['Desktop Chrome']}},
    {name: 'tablet-chromium', use: {...devices['iPad Pro 11'], browserName: 'chromium'}},
    {name: 'mobile-chromium', use: {...devices['Pixel 7']}},
    {name: 'mobile-webkit', use: {...devices['iPhone 13']}},
  ],
  webServer: {command: 'pnpm dev:harness', url: 'http://127.0.0.1:4186', reuseExistingServer: false},
});
