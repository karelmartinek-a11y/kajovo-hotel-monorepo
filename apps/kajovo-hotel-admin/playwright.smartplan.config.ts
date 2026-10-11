import {defineConfig} from '@playwright/test';
import baseline from './playwright.baseline.config';
const servers = Array.isArray(baseline.webServer) ? baseline.webServer.map(server => ({...server,
  command: server.command?.replace('uvicorn app.main:app', 'uvicorn tests.voice_smartplan_ui_host:app'),
})) : baseline.webServer;
export default defineConfig({...baseline, webServer: servers, testMatch: 'smartplan.spec.ts',
  use: {...baseline.use, trace: 'off', screenshot: 'off', video: 'off'},
});
