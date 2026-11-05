import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, mkdir} from 'node:fs/promises';
const require = createRequire(new URL('../../../kajovo-hotel-web/package.json', import.meta.url));
const {chromium, webkit} = require('@playwright/test');
const root = new URL('../../app/web_ui/', import.meta.url);
const origin = 'https://hotel.example.test', prefix = '/sections/hotel/';
const descriptions = {cs: 'Části přijaté WhatsAppem: ', en: 'Parts accepted by WhatsApp: ', uk: 'Частини, прийняті WhatsApp: '};
const errors = [];
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
 const browser = await engine.launch();
 try {
  for (const width of [1440, 834, 390]) for (const lang of ['cs', 'en', 'uk']) for (const state of ['accepted', 'attention']) {
   const context = await browser.newContext({viewport: {width, height: 1000}}), page = await context.newPage();
   const item = {id: 12, item_type: 'found', description: 'Syntetický nález', category: 'Test', location: 'Test', event_at: '2026-11-03T10:00:00Z', status: 'new', tags: [], photos: [], whatsapp_notification: {state, accepted_parts: state === 'accepted' ? 3 : 2, total_parts: 3}};
   page.on('pageerror', error => errors.push(error.message));
   await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    assert.equal(url.origin, origin); assert.equal(request.method(), 'GET');
    const path = url.pathname.slice(prefix.length);
    if (url.pathname.startsWith('/assets/')) return route.fulfill({status: 204});
    if (path === 'identity') return route.fulfill({json: {admin: false, name: 'Test', active_role: 'recepce', roles: ['recepce'], permissions: ['lost_found:read'], available_permissions: ['lost_found:read'], role_permissions: {recepce: ['lost_found:read']}, preferred_locale: lang, languages: ['cs', 'en', 'uk']}});
    if (path === 'api/v1/lost-found') return route.fulfill({json: [item]});
    if (path === 'api/v1/lost-found/12') return route.fulfill({json: item});
    if (path === 'api/v1/lost-found/12/photos') return route.fulfill({json: []});
    assert(!path.includes('/'), 'Unexpected test request: ' + path);
    const file = path || 'index.html';
    return route.fulfill({body: await readFile(new URL(file, root)), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html'});
   });
   try {
    await page.goto(origin + prefix + '?view=lostfound&lang=' + lang);
    await page.locator('#content[aria-busy=false]').waitFor();
    await page.locator('table button').first().click();
    const status = page.getByText(descriptions[lang], {exact: false});
    await status.waitFor();
    assert((await status.textContent()).includes(state === 'accepted' ? '3/3' : '2/3'));
    await page.goto(origin + prefix + '?view=lostfound-detail&id=12&lang=' + lang);
    await page.locator('#content[aria-busy=false]').waitFor();
    await page.getByText(item.description, {exact: true}).waitFor();
    await page.getByText(descriptions[lang], {exact: false}).waitFor();
    await page.reload();
    await page.locator('#content[aria-busy=false]').waitFor();
    await page.getByText(item.description, {exact: true}).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(errors.length, 0, errors.join('; '));
    if(process.env.HOTEL_NOTIFICATION_SCREENSHOTS&&name==='chromium'&&lang==='cs'&&state==='attention'){await mkdir(process.env.HOTEL_NOTIFICATION_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.HOTEL_NOTIFICATION_SCREENSHOTS+'/'+width+'.png',fullPage:true});}
    console.log('PASS lost-found WhatsApp status', name, width, lang, state);
   } finally {await context.close();}
  }
 } finally {await browser.close();}
}
