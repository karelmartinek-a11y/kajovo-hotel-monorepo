import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium,webkit,expect} from '@playwright/test';

// The newly authored CML UI runs against isolated read-only role adapters.
// No hotel backend, provider, microphone or message transport is reachable.
const root=new URL('../../kajovo-hotel-api/app/web_ui/',import.meta.url);
const origin='https://hotel.example.test',prefix='/sections/hotel/';
const manifest=JSON.parse(await readFile(new URL('ui-manifest.json',root)));
const permissions={recepce:['housekeeping:read'],sklad:['inventory:read'],admin:['housekeeping:read','inventory:read']};
const profile=role=>({admin:role==='admin',name:'Testovací účet',roles:Object.keys(permissions),active_role:role,
 permissions:permissions[role],available_permissions:['housekeeping:read','inventory:read'],role_permissions:permissions});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

async function fixture(browser,width,identity){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],roomRoles=[];
 page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  globalThis.cmlSettled=[];const fetch=globalThis.fetch;
  globalThis.fetch=async(...args)=>{const r=await fetch(...args),json=r.json.bind(r);r.json=async()=>{const value=await json();setTimeout(()=>globalThis.cmlSettled.push(String(args[0])),0);return value;};return r;};
 });
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin);assert.equal(request.method(),'GET','Only isolated reads are allowed');
  if(url.pathname.startsWith('/assets/')){await route.fulfill({status:204});return;}
  const path=url.pathname.slice(prefix.length),role=url.searchParams.get('_role')??'recepce';
  if(path==='identity'){
   const value=await identity(role,url.href,url.searchParams.has('_role'));
   await route.fulfill(value.denied?{status:403,json:{error:{message:'Role nebyla potvrzena'}}}:{json:value});return;
  }
  if(path==='api/v1/housekeeping/rooms'){
   roomRoles.push(role);
   await route.fulfill(permissions[role]?.includes('housekeeping:read')?{json:{rooms:[]}}:{status:403,json:{error:{message:'Přehled vyžaduje jinou pracovní roli'}}});return;
  }
  if(path==='api/v1/inventory'){await route.fulfill({json:[]});return;}
  assert.ok(!path.includes('/')&&(!path||/\.(js|css|json)$/.test(path)),`Unexpected isolated route ${path}`);
  const file=path||'index.html';
  await route.fulfill({body:await readFile(new URL(file,root)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});
 });
 await page.goto(origin+prefix+'?view=rooms');await page.locator('#content[aria-busy=false]').waitFor();
 const navigate=async name=>{
  const entry=manifest.views.find(v=>new URL(v.path,origin).searchParams.get('view')===name);assert.ok(entry);
  await page.evaluate(entry=>globalThis.postMessage({type:'CML_SECTION_NAVIGATE',prefix:'/sections/hotel/',id:entry.id,path:entry.path},location.origin),entry);
 };
 return {page,roomRoles,navigate,close:async()=>{await context.close();assert.deepEqual(errors,[]);}};
}

async function latestManualRole(browser,width){
 const release=deferred(),started=deferred();let oldUrl;
 const f=await fixture(browser,width,async(role,url)=>{
  if(role==='admin'){oldUrl=url;started.resolve();await release.promise;}
  return profile(role);
 });
 try{
  const selector=f.page.getByRole('combobox',{name:'Pracovní role',exact:true});
  await selector.selectOption('admin');await started.promise;
  const fresh=f.page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/housekeeping/rooms'));
  await selector.selectOption('recepce');await(await fresh).finished();await f.page.locator('#content[aria-busy=false]').waitFor();
  release.resolve();await f.page.waitForFunction(url=>globalThis.cmlSettled.includes(url),oldUrl);
  await expect(selector).toHaveValue('recepce');await expect(f.page.getByRole('alert')).toHaveCount(0);
 }finally{release.resolve();await f.close();}
}

async function cancelledAutomaticRole(browser,width){
 const release=deferred(),started=deferred();let oldUrl;
 const f=await fixture(browser,width,async(role,url)=>{
  if(role==='sklad'){oldUrl=url;started.resolve();await release.promise;}
  return profile(role);
 });
 try{
  await f.navigate('inventory');await started.promise;await f.navigate('rooms');
  await f.page.locator('#content[aria-busy=false]').waitFor();
  release.resolve();await f.page.waitForFunction(url=>globalThis.cmlSettled.includes(url),oldUrl);
  await expect(f.page.getByRole('combobox',{name:'Pracovní role',exact:true})).toHaveValue('recepce');
  await expect(f.page.getByRole('alert')).toHaveCount(0);assert.ok(f.roomRoles.every(role=>role==='recepce'));
 }finally{release.resolve();await f.close();}
}

async function rejectedRole(browser,width){
 const f=await fixture(browser,width,role=>role==='admin'?{denied:true}:profile(role));
 try{
  const selector=f.page.getByRole('combobox',{name:'Pracovní role',exact:true});await selector.selectOption('admin');
  await expect(f.page.getByRole('alert')).toContainText('Role nebyla potvrzena');await expect(selector).toHaveValue('recepce');
  await f.page.getByRole('button',{name:'Obnovit',exact:true}).click();await f.page.locator('#content[aria-busy=false]').waitFor();
  assert.ok(f.roomRoles.every(role=>role==='recepce'));await expect(f.page.getByRole('alert')).toHaveCount(0);
 }finally{await f.close();}
}

const failures=[];
for(const name of(process.env.CML_BROWSER_ENGINES??'chromium').split(',')){
 assert.ok(['chromium','webkit'].includes(name));const browser=await({chromium,webkit}[name]).launch();
 try{for(const width of[1920,834,390])for(const[testName,run]of[['latest-role',latestManualRole],['cancelled-navigation-role',cancelledAutomaticRole],['rejected-role',rejectedRole]]){
  try{await run(browser,width);console.log(`PASS ${name} ${width} ${testName}`);}catch(error){failures.push(`${name} ${width} ${testName}: ${error.message}`);console.error(`FAIL ${name} ${width} ${testName}: ${error.message}`);}
 }}finally{await browser.close();}
}
assert.deepEqual(failures,[]);
