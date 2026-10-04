import {defineConfig} from '@playwright/test';
export default defineConfig({testDir: './tests', testMatch: 'voice-mail-isolated-live.spec.ts', workers: 1, timeout: 240000,
  use: {baseURL: 'http://127.0.0.1:8794', trace: 'off', screenshot: 'off', video: 'off'},
});
