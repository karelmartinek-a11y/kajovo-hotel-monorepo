import {chromium} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,sign,createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const out=process.env.CML_PRINT_EVIDENCE_DIR??await mkdtemp(join(tmpdir(),'cml-print-'));await mkdir(out,{recursive:true});
const keyDir=await mkdtemp(join(process.env.HOTEL_CML_SHARED_TMP??tmpdir(),'hotel-language-'));
const {privateKey,publicKey}=generateKeyPairSync('ed25519');await writeFile(keyDir+'/public.json',JSON.stringify({keys:[{...publicKey.export({format:'jwk'}),kid:'cml-web-1'}]}));
const port=20000+Math.floor(Math.random()*20000);
const prefix='/sections/hotel/',origin='https://hotel.example.test';
const container='cml-hotel-language-'+randomUUID();
const child=process.env.HOTEL_CML_TEST_IMAGE?spawn('docker',['run','--rm','--name',container,'--network','bridge','-p','127.0.0.1:'+port+':8000','--mount','type=bind,src='+root+'/apps/kajovo-hotel-api/app,dst=/app/app,readonly','--mount','type=bind,src='+root+'/apps/kajovo-hotel-api/tests,dst=/app/tests,readonly','--mount','type=bind,src='+keyDir+'/public.json,dst=/test-key.json,readonly','-e','HOTEL_CML_UI_QUALIFICATION=1','-e','CML_WEB_JWKS_PATH=/test-key.json','--entrypoint','python',process.env.HOTEL_CML_TEST_IMAGE??'kajovo-api-ci:latest','-m','uvicorn','tests.cml_ui_server:app','--host','0.0.0.0','--port','8000','--no-access-log'],{cwd:root,stdio:['ignore','ignore','pipe']}):spawn(process.env.HOTEL_CML_TEST_PYTHON??'python',['-m','uvicorn','tests.cml_ui_server:app','--host','127.0.0.1','--port',String(port),'--no-access-log'],{cwd:root+'/apps/kajovo-hotel-api',env:{...process.env,HOTEL_CML_UI_QUALIFICATION:'1',CML_WEB_JWKS_PATH:keyDir+'/public.json'},stdio:['ignore','ignore','pipe']});let err='';child.stderr.on('data',d=>err+=d);
let browser;
try{
 let ready=false;for(let i=0;i<600;i++){if(child.exitCode!==null)throw Error(err);try{await fetch('http://127.0.0.1:'+port+'/health');ready=true;break;}catch{/* Wait for the isolated local server. */}await new Promise(r=>setTimeout(r,100));}assert(ready,err);
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:900},locale:'cs-CZ'}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>console.log('PAGE_ERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE_ERROR',m.text());});
 let role='admin',closing=false,forwarding=Promise.resolve();
 await context.route('**/*',async route=>{try{if(closing)return await route.abort();const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin);
  if(url.pathname.startsWith('/assets/')){try{const content=await readFile((process.env.CML_SHARED_ASSETS??root+'/public/cml-assets')+'/'+url.pathname.slice('/assets/'.length));await route.fulfill({body:content,contentType:url.pathname.endsWith('.svg')?'image/svg+xml':url.pathname.endsWith('.ttf')?'font/ttf':'application/octet-stream'});}catch{await route.fulfill({status:404});}return;}
  const path='/cml-web/'+url.pathname.slice(prefix.length)+url.search,body=req.postDataBuffer()??Buffer.alloc(0),now=Math.floor(Date.now()/1000);
  const claims={iss:'https://kajovocml.hcasc.cz',aud:'hotel',sub:role==='admin'?'KRMAR78':'user:11111111-1111-4111-8111-111111111111',role,nativeId:role==='admin'?null:'1',sid:randomUUID(),epoch:1,iat:now,exp:now+10,jti:randomUUID(),method:req.method(),path,bodySha256:createHash('sha256').update(body).digest('hex'),csrf:'a'.repeat(43)};
  const raw=Buffer.from(JSON.stringify({typ:'cml-web+jwt',alg:'EdDSA',kid:'cml-web-1'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url');
  const response=forwarding.then(async()=>{const r=await fetch('http://127.0.0.1:'+port+path,{method:req.method(),headers:{Origin:'https://kajovocml.hcasc.cz','X-CML-Web-Prefix':prefix,'X-CML-Web-Assertion':raw+'.'+sign(null,Buffer.from(raw),privateKey).toString('base64url'),'X-CSRF-Token':'a'.repeat(43),'Content-Type':'application/json'},body:['GET','HEAD'].includes(req.method())?undefined:body});
  return {r,bytes:Buffer.from(await r.arrayBuffer())};});forwarding=response.catch(()=>{});
  const {r,bytes}=await response;if(!r.ok)console.log('HTTP_ERROR',path,r.status,bytes.toString().slice(0,200));await route.fulfill({status:r.status,contentType:r.headers.get('content-type')??'application/octet-stream',body:bytes});
 }catch(error){if(!closing)throw error;} });

 if(!process.env.HOTEL_LOCALE_PREFERENCE_ONLY)for(role of ['admin','member'])for(const lang of (role==='admin'?['cs']:['cs','en','uk']))for(const width of [1440,768,390])for(const view of ['rooms','breakfast']){
  await page.setViewportSize({width,height:width===768?1024:width===390?844:900});
  await page.goto(origin+prefix+'?view='+view+'&lang='+lang);
  await page.locator('#content[aria-busy=false]').waitFor();await page.evaluate(()=>globalThis.document.fonts.ready);
  assert.equal(await page.locator('html').getAttribute('lang'),lang);
  assert.equal(await page.locator('select[name=locale]').inputValue(),lang);
  assert.equal(await page.locator('select[name=locale] option').count(),role==='admin'?1:3);
  assert(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth),'No page overflow');
  assert.equal(await page.locator('[role=alert]').count(),0);
  await page.screenshot({path:out+'/'+role+'-'+lang+'-'+view+'-'+width+'.png',fullPage:true});
  if(view==='rooms'){const tiles=page.locator('.room-tile');assert(await tiles.count()>0);assert(await tiles.evaluateAll(ns=>ns.every(n=>n.getBoundingClientRect().height===122)),'Original 122px tile height');}
  console.log('PASS Hotel language',role,lang,view,width,'original geometry and data');
 }
 // Review all declared main views without invoking their mutations.
 for(role of ['admin','member'])for(const lang of (role==='admin'?['cs']:['en','uk'])){
  await page.goto(origin+prefix+'?view=rooms&lang='+lang);await page.locator('#content[aria-busy=false]').waitFor();
  const manifest=await page.evaluate(async()=>await(await fetch('/sections/hotel/ui-manifest.json')).json());
  for(const view of manifest.views.filter(v=>v.navigation!==false))for(const width of [1440,390]){
   await page.setViewportSize({width,height:width===390?844:900});
   const target=new URL(view.path,origin);target.searchParams.set('lang',lang);
   await page.goto(target.href);await page.locator('#content[aria-busy=false]').waitFor();await page.evaluate(()=>globalThis.document.fonts.ready);
   assert.equal(await page.locator('html').getAttribute('lang'),lang);
   assert(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth),'No page overflow: '+view.id);
   await page.screenshot({path:out+'/'+role+'-'+lang+'-'+view.id+'-'+width+'.png',fullPage:true});
   console.log('PASS declared view',view.id,lang,width);
  }
 }
 // A preference is saved by the original profile route, then confirmed by a fresh identity read.
 console.log('PREFERENCE start');role='member';await page.goto(origin+prefix+'?view=rooms&lang=cs');await page.locator('#content[aria-busy=false]').waitFor();console.log('PREFERENCE select');await page.locator('select[name=locale]').selectOption('uk');await page.waitForURL(/lang=uk/);await page.locator('#content[aria-busy=false]').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'uk');
 await page.goto(origin+prefix+'?view=rooms');await page.waitForURL(/lang=uk/);assert.equal(await page.locator('select[name=locale]').inputValue(),'uk');
 console.log('PREFERENCE passed');closing=true;await page.goto('about:blank');console.log('CLEANUP blank');await context.close();console.log('CLEANUP context');console.log('PASS persisted own language and reload without business writes');
}finally{if(err.includes('ERROR:'))console.error(err);if(browser)await browser.close();if(process.env.HOTEL_CML_TEST_IMAGE)spawnSync('docker',['stop',container],{stdio:'ignore'});child.kill('SIGTERM');await rm(keyDir,{recursive:true,force:true});}
