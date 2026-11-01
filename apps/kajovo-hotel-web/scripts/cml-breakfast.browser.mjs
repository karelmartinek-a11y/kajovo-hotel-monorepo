import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium,webkit,expect} from '@playwright/test';
const root=new URL('../../kajovo-hotel-api/app/web_ui/',import.meta.url),origin='https://hotel.example.test',prefix='/sections/hotel/';
const referenceCss=(await Promise.all(['../../../packages/ui/src/tokens.css','../src/login.css','../../../packages/ui/src/workspace.css'].map(p=>readFile(new URL(p,import.meta.url),'utf8')))).join('\n');
for(const name of(process.env.CML_BROWSER_ENGINES??'chromium').split(',')){
 const browser=await({chromium,webkit}[name]).launch();
 try{for(const width of [320,390,640]){
 const page=await browser.newPage({viewport:{width,height:1000}});await page.clock.setFixedTime(new Date('2026-11-01T05:30:00Z'));
 const order={id:1,room_number:'201',guest_name:'Testovací host',guest_count:3,status:'pending',updated_at:'2026-11-01T00:00:00Z',note:'Poznámka pro pokojskou',reservations:[{reservation_id:'test-stay',company_name:'Testovací firma',arrival:'2026-10-30',departure:'2026-11-03',breakfast_adults:1,breakfast_children_0_2:1,breakfast_children_3_17:1,breakfast_age_unknown:0}],diet_no_gluten:true};let writes=0;
 await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin);const path=url.pathname.slice(prefix.length);
 if(url.pathname.startsWith('/assets/'))return route.fulfill({status:204});
 if(path==='identity')return route.fulfill({json:{admin:false,name:'Test',roles:['snídaně'],active_role:'snídaně',permissions:['breakfast:read'],available_permissions:['breakfast:read'],role_permissions:{'snídaně':['breakfast:read']}}});
 if(path==='api/v1/breakfast/daily-overview')return route.fulfill({json:{orders:[order,{...order,id:2,room_number:'202',guest_count:2,status:'served'},{...order,id:3,room_number:'203',guest_count:1,status:'cancelled'},{...order,id:4,guest_count:0}],summary:{total_guests:6,source_imported_at:null}}});
 if(path==='api/v1/breakfast/1'){if(request.method()==='PUT'){writes++;assert.equal(request.postDataJSON().expected_updated_at,order.updated_at);order.status='served';order.updated_at='2026-11-01T06:30:00Z';}return route.fulfill({json:order});}
 const file=path||'index.html';assert(!file.includes('..'));return route.fulfill({body:await readFile(new URL(file,root)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.png')?'image/png':'text/html'});
 });
 await page.goto(origin+prefix+'?view=breakfast');await page.locator('#content[aria-busy=false]').waitFor();await expect(page.locator('.breakfast-serving-tile')).toHaveCount(3);const tile=page.locator('.breakfast-serving-tile[data-room-number="201"]');await expect(page.locator('.breakfast-serving-tile[data-room-number="202"]')).toHaveCSS('opacity','1');await expect(page.locator('.breakfast-serving-tile[data-room-number="203"]').getByRole('button',{name:'Zrušeno',exact:true})).toBeDisabled();await expect(tile).toContainText('Testovací firma');await expect(tile).toContainText('2/4 nocí');await expect(tile).toContainText('Dospělí: 1 · 0–2 roky: 1 · 3–17 let: 1');await expect(tile).toContainText('Poznámka pro pokojskou');await page.waitForFunction(()=>[...document.querySelectorAll('.breakfast-diet-art')].every(n=>n.complete&&n.naturalWidth>0));
 const reference=await browser.newPage({viewport:{width,height:1000}});await reference.setContent('<style>'+referenceCss+'</style><article class="k-breakfast-serving-row"><div class="k-breakfast-serving-row__header">201</div><div class="k-breakfast-serving-row__main"><span class="k-breakfast-serving-row__action"><button class="k-button">Vydat</button></span></div></article>');
 const properties=(node,keys)=>Object.fromEntries(keys.map(k=>[k,getComputedStyle(node)[k]]));
 assert.deepEqual(await tile.evaluate(properties,['backgroundColor','borderRadius','borderColor']),await reference.locator('article').evaluate(properties,['backgroundColor','borderRadius','borderColor']));
 assert.deepEqual(await tile.locator('button').evaluate(properties,['backgroundColor','color','borderRadius','fontSize','minHeight']),await reference.locator('button').evaluate(properties,['backgroundColor','color','borderRadius','fontSize','minHeight']));
 await reference.locator('button').evaluate(n=>n.classList.add('secondary'));
 assert.deepEqual(await page.locator('.breakfast-serving-tile[data-room-number="203"] button').evaluate(properties,['backgroundColor','color','borderColor']),await reference.locator('button').evaluate(properties,['backgroundColor','color','borderColor']));
 const before=await tile.evaluate(properties,['backgroundColor','color']);await page.addStyleTag({content:':root{--panel:purple;--text:lime;--accent:blue}'});assert.deepEqual(await tile.evaluate(properties,['backgroundColor','color']),before);
 await tile.getByRole('button',{name:'Vydat',exact:true}).click();await expect(page.locator('.breakfast-serving-tile[data-room-number="201"]').getByRole('button',{name:'Vydáno',exact:true})).toBeDisabled();assert.equal(writes,1);
 await page.getByLabel('Datum',{exact:true}).fill('');await expect(page.getByLabel('Datum',{exact:true})).toHaveValue('2026-11-01');await expect(page.getByRole('alert')).toContainText('platné datum');assert.equal(writes,1);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await reference.close();console.log(JSON.stringify({status:'PASS',engine:name,width,originalPaletteAndGeometry:true,realPng:true,content:true,servingRole:true,syntheticWrites:writes,invalidDateRetained:true}));
 await page.close();}}finally{await browser.close();}
}
