import {defineConfig} from '@playwright/test';
export default defineConfig({testDir: './tests', testMatch: 'voice-registry-live.spec.ts', workers: 1,
  retries: 0, timeout: 900000, use: {baseURL: process.env.VOICE_CORE_BASE_URL,
    permissions: ['microphone'], trace: 'off', screenshot: 'off', video: 'off'},
});
