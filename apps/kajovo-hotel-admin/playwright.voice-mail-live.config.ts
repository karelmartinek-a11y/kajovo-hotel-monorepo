import {defineConfig} from '@playwright/test';
export default defineConfig({testDir: './tests', testMatch: 'voice-mail-live.spec.ts', workers: 1, timeout: 180000,
  use: {baseURL: process.env.VOICE_CORE_BASE_URL ?? 'https://hotel.hcasc.cz', trace: 'off', screenshot: 'off', video: 'off', permissions: ['microphone'],
    launchOptions: {args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${process.env.VOICE_CORE_AUDIO_FIXTURE}`]}},
});
