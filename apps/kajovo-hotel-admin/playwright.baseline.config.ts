import { randomUUID } from 'node:crypto';
import { defineConfig } from '@playwright/test';
import smoke from './playwright.smoke.config';

const database = process.env.SMOKE_DB_PATH ?? `/tmp/kajovo-baseline-${randomUUID()}.db`;
const servers = Array.isArray(smoke.webServer) ? smoke.webServer.map((server) => ({
  ...server,
  command: server.command?.replaceAll('/tmp/kajovo-smoke-e2e.db', database),
})) : smoke.webServer;

export default defineConfig({
  ...smoke,
  webServer: servers,
  testMatch: 'baseline.spec.ts',
  retries: 0,
  use: { ...smoke.use, trace: 'off' },
  workers: 1,
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 834, height: 1112 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
  ],
});
