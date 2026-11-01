import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium,webkit,expect} from '@playwright/test';

// Synthetic read-only adapters. No production backend or device is reachable.
const root=new URL('../../kajovo-hotel-api/app/web_ui/',import.meta.url),origin='https://hotel.example.test',prefix='/sections/hotel/';
const rows=['101','102','103','201','202','203'].map((number,index)=>({room_id:'room-'+number,room_number:number,floor:number[0],housekeeping_status_key:['clean','dirty','stay_no_linen','stay_with_linen','technical_issue','do_not_disturb'][index],occupied:index===0,current_persons:index===0?2:0,departure_today:index===1,arrival_today:index===2,blocks:[],arrivals:[],departures:[],stays:[]}));
const profile={admin:true,name:'Izolovaný správce',roles:['admin'],active_role:'admin',permissions:['housekeeping:read'],available_permissions:['housekeeping:read'],role_permissions:{admin:['housekeeping:read']}};
const failures=[];
for(const engine of(process.env.CML_BROWSER_ENGINES??'chromium').split(',')){
 assert(['chromium','webkit'].includes(engine));const browser=await({chromium,webkit}[engine]).launch();
 try{for(const width of[1400,834,390,320]){
  const context=await browser.newContext({viewport:{width,height:1000},locale:'cs-CZ'}),page=await context.newPage(),queries=[],errors=[];
  page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));await page.clock.setFixedTime(new Date('2026-10-30T12:00:00Z'));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin);assert.equal(request.method(),'GET');
   if(url.pathname.startsWith('/assets/')){await route.fulfill({status:204});return;}
   const path=url.pathname.slice(prefix.length);
   if(path==='identity'){await route.fulfill({json:profile});return;}
   if(path==='api/v1/housekeeping/rooms'){
    assert.equal(url.searchParams.get('include_options'),'true');assert.equal(url.searchParams.get('include_blocks'),'true');queries.push(url.searchParams.get('date'));
    await route.fulfill({json:{rooms:rows}});return;
   }
   assert(!path.includes('/')&&(!path||/\.(js|css|json)$/.test(path)),'Unexpected isolated URL '+path);
   const file=path||'index.html';await route.fulfill({body:await readFile(new URL(file,root)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});
  });
  try{
   await page.goto(origin+prefix+'?view=rooms');await page.locator('#content[aria-busy=false]').waitFor();await expect(page.locator('.room-tile')).toHaveCount(6);
   if(width===1400)assert.equal(await page.locator('.rooms').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length),6,'Reference has six desktop columns');
   if(width<=600){assert.equal(await page.locator('.rooms').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length),2,'Reference has two mobile columns');assert(await page.locator('.room-top strong').first().evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=22),'Room number must remain readable');}
   await expect(page.locator('label').filter({has:page.getByLabel('Datum',{exact:true})})).toContainText('Datum');
   await expect(page.locator('label').filter({has:page.getByLabel('Hledat pokoj',{exact:true})})).toContainText('Hledat pokoj');
   const date=page.getByLabel('Datum',{exact:true}),before=queries.length;
   await date.fill('');await expect(date).toHaveValue('2026-10-30');await expect(page.getByRole('alert')).toContainText('platné datum');assert.equal(queries.length,before,'An empty date cannot trigger a backend request');await expect(page.locator('.room-tile')).toHaveCount(6);
   await date.fill('2026-10-25');await expect.poll(()=>queries.at(-1)).toBe('2026-10-25');await page.locator('#content[aria-busy=false]').waitFor();
   for(const [name,expected]of[['Předchozí den','2026-10-24'],['Následující den','2026-10-25'],['Dnes','2026-10-30']]){await page.getByRole('button',{name,exact:true}).click();await expect.poll(()=>queries.at(-1)).toBe(expected);await page.locator('#content[aria-busy=false]').waitFor();}
   await page.getByLabel('Hledat pokoj',{exact:true}).fill('201');await expect(page.locator('.room-tile')).toHaveCount(1);await expect(page.locator('.room-tile')).toContainText('201');
   await page.getByLabel('Patro',{exact:true}).selectOption('1');await expect(page.locator('.room-tile')).toHaveCount(0);await page.getByLabel('Patro',{exact:true}).selectOption('2');await expect(page.locator('.room-tile')).toHaveCount(1);
   await page.getByRole('button',{name:'Obnovit',exact:true}).click();await page.locator('#content[aria-busy=false]').waitFor();await expect(page.getByLabel('Hledat pokoj',{exact:true})).toHaveValue('201');await expect(page.getByLabel('Patro',{exact:true})).toHaveValue('2');await expect(page.locator('.room-tile')).toHaveCount(1);
   await page.locator('.room-tile').click();await expect(page.getByRole('dialog')).toBeVisible();for(const button of await page.locator('.room-status-actions button').all())await expect(button).toBeDisabled();await page.getByRole('button',{name:'Zavřít',exact:true}).click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');assert.deepEqual(errors,[]);
   console.log(`PASS ${engine} ${width} room layout, labelled controls, invalid date, day navigation, retained filters and read-only detail`);
  }catch(error){failures.push(`${engine} ${width}: ${error.message}`);console.error(`FAIL ${engine} ${width}: ${error.message}`);}finally{await context.close();}
 }}finally{await browser.close();}
}
assert.deepEqual(failures,[]);
