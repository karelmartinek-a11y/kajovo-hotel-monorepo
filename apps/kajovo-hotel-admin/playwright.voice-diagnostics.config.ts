import {defineConfig} from '@playwright/test';
import baseline from './playwright.baseline.config';
const servers=Array.isArray(baseline.webServer)?baseline.webServer.map(server=>({...server,command:server.command?.replace('uvicorn app.main:app','uvicorn tests.voice_diagnostics_ui_host:app')})):baseline.webServer;
export default defineConfig({...baseline,webServer:servers,testMatch:'voice-diagnostics.spec.ts',use:{...baseline.use,permissions:['microphone'],trace:'off',screenshot:'off',video:'off',launchOptions:{args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}}});
