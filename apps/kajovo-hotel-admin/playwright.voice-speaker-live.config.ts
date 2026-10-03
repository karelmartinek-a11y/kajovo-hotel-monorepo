import {defineConfig} from '@playwright/test';
export default defineConfig({testDir: './tests', testMatch: 'voice-speaker-live.spec.ts', workers: 1, timeout: 180000,
  use: {baseURL: process.env.VOICE_CORE_BASE_URL ?? 'https://hotel.hcasc.cz', trace: 'off', screenshot: 'off', video: 'off', permissions: ['microphone']},
});
