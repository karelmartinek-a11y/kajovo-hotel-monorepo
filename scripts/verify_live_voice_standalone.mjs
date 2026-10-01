#!/usr/bin/env node
// Production acceptance makes no provider call and never changes the saved key/config.
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require = createRequire(new URL('../apps/kajovo-hotel-admin/package.json', import.meta.url));
const {chromium} = require('@playwright/test');
const baseURL = process.env.VERIFY_BASE_URL;
const email = process.env.VERIFY_ADMIN_EMAIL;
const password = process.env.VERIFY_ADMIN_PASSWORD;
if (!baseURL || !email || !password) throw Error('Voice acceptance credentials/base URL required');
const verify = (ok, code) => {if (!ok) throw Error(code);};
const browser = await chromium.launch();
try {
  const context = await browser.newContext({baseURL});
  const anonymous = await context.request.get('/api/v1/admin/voice-core/config');
  verify(anonymous.status() === 401, 'Voice requires authentication');
  const login = await context.request.post('/api/auth/admin/login', {data: {email, password}});
  verify(login.ok(), 'Voice admin login failed');
  const response = await context.request.get('/api/v1/admin/voice-core/config');
  verify(response.ok() && /no-store/.test(response.headers()['cache-control'] ?? ''), 'Private Voice config failed');
  const config = await response.json();
  verify(Number.isInteger(config.revision) && typeof config.configured === 'boolean', 'Voice config contract failed');
  verify(!Object.keys(config).some(key => /api_key|secret|tools|mcp|capabilit/i.test(key)), 'Voice exposed key/integration config');
  const removed = await context.request.get('/api/v1/admin/voice-core/tools');
  verify(removed.status() === 404, 'Retired tool endpoint still active');
  const denied = await context.request.post('/api/v1/admin/voice-core/sessions', {data: {sdp: 'invalid-session-sdp', revision: config.revision}});
  verify(denied.status() === 403, 'Voice session CSRF guard failed');
  const cookies = await context.cookies();
  const csrf = cookies.find(cookie => cookie.name === 'kajovo_csrf')?.value;
  verify(Boolean(csrf), 'Voice CSRF cookie missing');
  const invalid = await context.request.post('/api/v1/admin/voice-core/sessions', {
    headers: {'x-csrf-token': decodeURIComponent(csrf)}, data: {sdp: 'invalid-session-sdp', revision: config.revision},
  });
  verify(invalid.status() === 422 && (await invalid.json()).detail?.code === 'invalid_sdp', 'Voice invalid SDP guard failed');
  const page = await context.newPage();
  await mkdir('artifacts/voice-standalone', {recursive: true});
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1180], ['mobile', 390, 844]]) {
    await page.setViewportSize({width, height});
    await page.goto('/admin/hlasovy-chat');
    const consoleUI = page.getByTestId('voice-console');
    await consoleUI.waitFor({state: 'visible'});
    await page.getByText(config.configured ? 'Klíč je uložen.' : 'Klíč není uložen.', {exact: true}).waitFor();
    verify((await page.getByLabel('Nový API klíč').inputValue()) === '', 'Voice key field was populated');
    verify((await page.getByLabel('Nový API klíč').getAttribute('type')) === 'password', 'Voice key input not private');
    verify(!/MCP|Home Assistant|schválit akci|připojené nástroje/i.test(await consoleUI.innerText()), 'Integration controls still present');
    verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Voice horizontal overflow');
    const start = page.getByRole('button', {name: 'Zahájit hovor', exact: true});
    verify((await start.isEnabled()) === config.configured, 'Voice start state differs from saved key');
    await page.screenshot({path: 'artifacts/voice-standalone/' + name + '.png', fullPage: true});
  }
  await context.close();
  console.log(JSON.stringify({result: 'PASS', standalone: true, authenticated: true, csrf: true, invalid_sdp: true,
    retired_tools: true, viewports: 3, key_configured: config.configured, provider_calls: 0}));
} finally {
  await browser.close();
}
