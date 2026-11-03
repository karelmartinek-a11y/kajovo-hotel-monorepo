import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../../kajovo-hotel-web/package.json',import.meta.url));
const {chromium,webkit,expect}=require('@playwright/test');
const root=new URL('../../app/web_ui/',import.meta.url),origin='https://hotel.example.test',prefix='/sections/hotel/';
const output=new URL('../../../../artifacts/breakfast-whatsapp/',import.meta.url);await mkdir(output,{recursive:true});
for(const name of (process.env.CML_BROWSER_ENGINES??'chromium,webkit').split(',')){
 const browser=await({chromium,webkit}[name]).launch();
 try{for(const width of [320,834,1440]){
  const page=await browser.newPage({viewport:{width,height:1000},locale:'cs-CZ'});let writes=0,lost=false;
  let data={enabled:false,send_time:'18:00',recipients:[],revision:0,timezone:'Europe/Prague',next_run_at:null,transport_configured:true,last_run:null};
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin);const path=url.pathname.slice(prefix.length);
   if(url.pathname.startsWith('/assets/'))return route.fulfill({status:204});
   if(path==='test.html')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="cs"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${prefix}ui.css"><main id="content"></main><script type="module">import {breakfastWhatsappSettings} from './breakfast-whatsapp.js';await breakfastWhatsappSettings({state:{generation:1}},document.querySelector('main'));document.body.dataset.ready='true';</script></html>`});
   if(path==='api/v1/admin/settings/breakfast-whatsapp/preview')return route.fulfill({json:{service_date:'2026-11-04',breakfast_count:23,source_checked_at:'2026-11-03T17:00:00Z',message:'KájovoHotel: Na zítra 04. 11. 2026 je v plánu 23 snídaní.'}});
   if(path==='api/v1/admin/settings/breakfast-whatsapp'){
    if(req.method()==='PUT'){writes++;const payload=req.postDataJSON();assert.equal(payload.revision,data.revision);data={...data,...payload,revision:data.revision+1,next_run_at:'2026-11-04T17:00:00Z'};if(lost)return route.abort();}
    return route.fulfill({json:data});
   }
   assert(!path.includes('..'));const file=path;return route.fulfill({body:await readFile(new URL(file,root)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
  });
  await page.goto(origin+prefix+'test.html');await page.locator('body[data-ready=true]').waitFor();
  await page.getByLabel('Každý den posílat počet snídaní na zítřek').check();
  await page.getByRole('button',{name:'Uložit zasílání snídaní'}).click();
  await expect(page.getByRole('alert')).toContainText('alespoň jedno');assert.equal(writes,0);
  await page.getByLabel('Telefonní čísla WhatsApp').fill('+420111222333\n+420444555666');
  await page.getByLabel('Čas odeslání (český čas)').fill('19:15');
  await page.getByRole('button',{name:'Uložit zasílání snídaní'}).click();
  await expect(page.locator('.breakfast-whatsapp')).toContainText('uloženo a ověřeno');assert.equal(writes,1);
  await page.getByRole('button',{name:'Načíst náhled na zítřek'}).click();
  await expect(page.locator('.breakfast-whatsapp')).toContainText('23 snídaní');assert.equal(writes,1);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:new URL(`${name}-${width}.png`,output).pathname,fullPage:true});
  lost=true;await page.getByLabel('Čas odeslání (český čas)').fill('20:15');
  await page.getByRole('button',{name:'Uložit zasílání snídaní'}).click();
  await expect(page.getByRole('button',{name:'Uložit zasílání snídaní'})).toBeDisabled();
  await expect(page.locator('.breakfast-whatsapp')).toContainText('nebude opakovat');assert.equal(writes,2);
  await page.getByRole('button',{name:'Obnovit nastavení'}).click();
  await expect(page.getByLabel('Čas odeslání (český čas)')).toHaveValue('20:15');assert.equal(writes,2);
  console.log(JSON.stringify({status:'PASS',engine:name,width,saveReadback:true,previewNoSend:true,uncertainNoReplay:true}));
  await page.close();
 }}finally{await browser.close();}
}
