import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const {chromium, webkit, expect} = createRequire(new URL('../../../kajovo-hotel-web/package.json',import.meta.url))('@playwright/test');
const root = new URL('../../app/web_ui/',import.meta.url);
const prefix = '/sections/hotel/', path = 'api/v1/inventory/egg-orders';
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const page=await browser.newPage({viewport:{width:390,height:800}}), writes=[], errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  let sent=null, loseResponse=false;
  await page.route('https://hotel.example.test/**',async route=>{
   const req=route.request(), url=new URL(req.url()), asset=url.pathname.slice(prefix.length);
   if(asset===path+'/latest')return route.fulfill({json:sent});
   if(asset===path&&req.method()==='POST'){
    const payload=req.postDataJSON();
    assert.equal(req.headers()['idempotency-key'],payload.id);
    writes.push(payload);
    if(sent&&!payload.confirmed_previous_id)return route.fulfill({json:{
     state:'confirm',previous_id:sent.id,previous_sent_at:'2026-11-14T10:00:00Z',
     previous_delivery_date:sent.delivery_date,delivery_date:'2026-11-17',
    }});
    if(sent)assert.equal(payload.confirmed_previous_id,sent.id);
    sent={id:payload.id,state:'sent',delivery_date:payload.confirmed_delivery_date??'2026-11-16'};
    if(loseResponse)return route.abort();
    return route.fulfill({json:sent});
   }
   if(sent&&asset===path+'/'+sent.id)return route.fulfill({json:sent});
   if(asset==='api/v1/inventory')return route.fulfill({json:[]});
   if(asset==='test.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><meta charset="utf-8"><main id="content"></main><dialog id="dialog"></dialog><script type="module">
    import {warehouseList} from './warehouse.js';import {view,setRole} from './api.js';import {warehouses,inventoryPath} from './warehouse-selection.js';
    setRole('sklad');
    const warehouse=warehouses[0];
    await warehouseList({heading:view,warehouse,inventoryPath:suffix=>inventoryPath(warehouse,suffix),state:{generation:1,identity:{permissions:['inventory_snidane:read','inventory_snidane:write']}}},{newItem:()=>{},detail:()=>{}});
    </script></html>`});
   if(!asset.includes('/')&&asset.endsWith('.js'))return route.fulfill({contentType:'text/javascript',body:await readFile(new URL(asset,root))});
   return route.fulfill({status:204});
  });
  await page.goto('https://hotel.example.test'+prefix+'test.html');
  const order=page.getByRole('button',{name:'OBJEDNAT 180 VAJEC'});
  await order.click();
  await expect(page.getByRole('status')).toHaveText('Objednávka 180 vajec byla odeslána na závoz: 16. 11. 2026');
  await order.click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('11:00');
  await expect(dialog).toContainText('16. 11. 2026');
  await expect(dialog).toContainText('17. 11. 2026');
  await dialog.getByRole('button',{name:'NE',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  assert.equal(writes.length,2);
  await order.click();
  loseResponse=true;
  await dialog.getByRole('button',{name:'ANO',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Objednávka 180 vajec byla odeslána na závoz: 17. 11. 2026');
  assert.equal(writes.length,4);
  assert.equal(writes[3].confirmed_delivery_date,'2026-11-17');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('17. 11. 2026');
  assert.equal(writes.length,4);
  assert.deepEqual(errors,[]);
  console.log(engine.name()+': repeat confirmation, cancel, send, recovered response and reload PASS');
 }finally{await browser.close();}
}
