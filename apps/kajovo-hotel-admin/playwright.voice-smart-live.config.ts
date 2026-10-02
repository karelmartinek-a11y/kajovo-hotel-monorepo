import {defineConfig} from '@playwright/test';
// @ts-expect-error Node environment belongs to the Playwright CLI.
const environment: Record<string, string | undefined> = process.env;
export default defineConfig({
  testDir: './tests', testMatch: 'voice-smart-live.spec.ts', workers: 1, timeout: 420000,
  outputDir: environment.VOICE_SMART_OUTPUT_DIR ?? '../../artifacts/voice-smart-live',
  use: {baseURL: environment.VOICE_CORE_BASE_URL ?? 'http://127.0.0.1:4190',
    trace: 'off', screenshot: 'off', video: 'off', permissions: ['microphone'],
    launchOptions: {args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${environment.VOICE_CORE_AUDIO_FIXTURE}%noloop`]}},
});
