import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require = createRequire(new URL('../../../kajovo-hotel-web/package.json', import.meta.url));
const {chromium, webkit, expect} = require('@playwright/test');
const root = new URL('../../app/web_ui/', import.meta.url);
const origin = 'https://hotel.example.test', prefix = '/sections/hotel/';
const output = new URL('../../../../artifacts/lost-found-form/', import.meta.url);
await mkdir(output, {recursive: true});
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
 const browser = await engine.launch();
 try {
  for (const width of [1440, 834, 390]) for (const lang of ['cs', 'en', 'uk']) for (const scenario of ['new', 'edit', 'write-only']) {
   const page = await browser.newPage({viewport: {width, height: 1000}}), errors = [], writes = [];
   const role = scenario === 'write-only' ? 'pokojská' : 'admin', mode = scenario === 'edit' ? 'edit' : 'new';
   let item = {id: 12, item_type: 'found', description: 'Původní nález', category: 'Historická kategorie', location: 'Historické místo', room_number: '402', event_at: '2026-10-25T01:30:00Z', created_at: '2026-10-25T01:35:00Z', status: 'stored', tags: []};
   const original = {...item};
   page.on('pageerror', error => errors.push(error.message));
   await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    assert.equal(url.origin, origin);
    if (url.pathname.startsWith('/assets/')) return route.fulfill({status: 204});
    const path = url.pathname.slice(prefix.length);
    if (path.startsWith('api/')) {
     assert.equal(url.searchParams.get('_role'), role);
     if (req.method() !== 'GET') {
      assert.equal(path, 'api/v1/lost-found' + (mode === 'edit' ? '/12' : ''));
      assert.equal(req.method(), mode === 'edit' ? 'PUT' : 'POST');
      assert(req.headers()['idempotency-key']);
      const payload = req.postDataJSON();
      for (const key of ['category', 'location', 'status', 'event_at', 'event_at-fold']) assert(!(key in payload), key + ' must be server-owned or preserved');
      writes.push(payload);
      const now = new Date().toISOString();
      item = {...item, ...payload, ...(mode === 'new' ? {category: '', location: '', status: 'new', event_at: now, created_at: now} : {})};
      return route.fulfill({status: mode === 'new' ? 201 : 200, json: item});
     }
     if (path === 'api/v1/lost-found/12') {
      assert.notEqual(scenario, 'write-only');
      return route.fulfill({json: item});
     }
     assert.equal(path, 'api/request-status');
     assert.equal(scenario, 'write-only');
     assert(url.searchParams.get('request_id'));
     return route.fulfill({json: {state: 'completed', status: 201, body: item}});
    }
    if (path === 'test.html') return route.fulfill({contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${prefix}ui.css"><main id="content"></main><script type="module">
     import {recordEditor} from './records.js';import {setRole,view} from './api.js';
     setRole(${JSON.stringify(role)});
     const permissions=${JSON.stringify(scenario === 'write-only' ? ['lost_found:write', 'housekeeping:read'] : ['lost_found:write', 'lost_found:read'])};
     const ctx={heading:view,go:target=>document.body.dataset.finished=target,state:{generation:1,view:'lostfound-${mode}',recordIds:new Map([['lostfound',12]]),identity:{admin:${role === 'admin'},active_role:${JSON.stringify(role)},permissions,available_permissions:permissions,role_permissions:{[${JSON.stringify(role)}]:permissions}}}};
     await recordEditor(ctx,'lostfound',${JSON.stringify(mode)});document.body.dataset.ready='true';
     </script></html>`});
    assert(!path.includes('/'), 'Unexpected asset ' + path);
    return route.fulfill({body: await readFile(new URL(path, root)), contentType: path.endsWith('.js') ? 'text/javascript' : 'text/css'});
   });
   try {
    await page.goto(origin + prefix + 'test.html?lang=' + lang);
    await page.locator('body[data-ready=true]').waitFor();
    for (const field of ['category', 'location', 'status', 'event_at', 'event_at-fold']) await expect(page.locator(`[name="${field}"]`)).toHaveCount(0);
    await expect(page.locator('input[type=datetime-local]')).toHaveCount(0);
    await page.locator('[name=description]').fill('Syntetický nález po úpravě');
    await page.locator('[name=room_number]').fill('301');
    await page.locator('[name=tag-vyzvedne]').check();
    if (name === 'chromium' && lang === 'cs') await page.screenshot({path: fileURLToPath(new URL(`${scenario}-${width}.png`, output)), fullPage: true});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('button[type=submit]').click();
    await page.locator(`body[data-finished="lostfound-${scenario === 'write-only' ? 'submitted' : 'detail'}"]`).waitFor();
    assert.equal(writes.length, 1);
    assert.equal(item.room_number, '301');
    assert.deepEqual(item.tags, ['vyzvedne']);
    if (mode === 'edit') for (const key of ['category', 'location', 'status', 'event_at', 'created_at']) assert.equal(item[key], original[key]);
    else assert.equal(item.event_at, item.created_at);
    assert.deepEqual(errors, []);
    console.log('PASS lost-found form', name, width, lang, scenario);
   } finally {await page.close();}
  }
 } finally {await browser.close();}
}
