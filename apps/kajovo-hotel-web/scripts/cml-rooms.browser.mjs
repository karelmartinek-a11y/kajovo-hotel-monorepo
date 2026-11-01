import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Synthetic read-only adapters. No production backend or device is reachable.
const root=new URL('../../kajovo-hotel-api/app/web_ui/',import.meta.url),origin='https://hotel.example.test',prefix='/sections/hotel/';
const rows=['101','102','103','201','202','203','204','205'].map((number,index)=>({room_id:'room-'+number,room_number:number,floor:number[0],housekeeping_status_key:['clean','dirty','stay_no_linen','stay_with_linen','technical_issue','do_not_disturb','windows_cleaned','painted'][index],occupied:index===0,current_persons:index===0?2:0,departure_today:index===1,arrival_today:index===2,blocks:[],arrivals:[],departures:[],stays:[]}));

const stay=(state,id='reservation-1')=>({reservation_id:id,reservation_code:id,arrival:'2026-10-28',departure:'2026-11-02',arrival_time:'14:30',departure_time:'10:00',reservation_state:state,persons:4,adults:2,children:1,infants:1,country_code:'CZ',country_name:'Česko',guests:[{name:'Zkušební host s velmi dlouhým jménem'}],dog_count:2,cot_required:true,housekeeping_note:'Izolovaná poznámka',amenities:[]});
rows[0].departures=[stay('checked_out')];rows[0].arrivals=[stay('confirmed','reservation-2')];
rows[1].stays=[stay('checked_in')];rows[2].arrivals=[stay('option')];rows[3].blocks=[{coverage:'full'}];
rows[4].arrivals=[stay(null)];rows[5].departures=[stay('confirmed'),stay('checked_in')];
rows[6].stays=[{...stay('confirmed'),dog_count:null,cot_required:null}];rows[7].arrivals=[{...stay('confirmed'),amenities:[{kind:'dog',active:true,state:'green'},{kind:'cot',active:true,state:'green'}]}];
const require=createRequire(import.meta.url),{build}=require(require.resolve('esbuild',{paths:[dirname(require.resolve('vite/package.json'))]}));
// Reference-only compilation of the original component. Nothing enters the new runtime.
const reference=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{RoomCard}from'./HousekeepingRooms';window.renderReference=(room,date)=>{createRoot(document.querySelector('#reference')).render(React.createElement(RoomCard,{room,date,onSelect(){}}));};`,resolveDir:fileURLToPath(new URL('../../../packages/ui/src/components/',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'iife',plugins:[{name:'reference-only',setup(build){build.onResolve({filter:/^react-dom\/client$/},()=>({path:require.resolve('react-dom/client')}));build.onLoad({filter:/HousekeepingRooms\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('const RoomCard =','export const RoomCard ='),loader:'tsx'}));build.onResolve({filter:/^@kajovo\/shared$/},()=>({path:'shared',namespace:'reference'}));build.onLoad({filter:/.*/,namespace:'reference'},()=>({contents:`export const t=x=>x;export const getIntlLocale=()=> 'cs-CZ';export const getPortalLocale=()=> 'cs';export const apiClient={};`}));build.onResolve({filter:/\/(TaskDialog|DateNavigation)$/},args=>({path:args.path,namespace:'unused'}));build.onLoad({filter:/.*/,namespace:'unused'},()=>({contents:'export const TaskDialog=()=>null;export const DateNavigation=()=>null;export const hotelToday=()=>"2026-10-30";'}));}}]});
const referenceCss=(await readFile(new URL('../../../packages/ui/src/tokens.css',import.meta.url),'utf8'))+'\n'+(await readFile(new URL('../../../packages/ui/src/workspace.css',import.meta.url),'utf8'));
const output=process.env.CML_UI_EVIDENCE_DIR;if(output)await mkdir(output,{recursive:true});

const profile={admin:true,name:'Izolovaný správce',roles:['admin'],active_role:'admin',permissions:['housekeeping:read'],available_permissions:['housekeeping:read'],role_permissions:{admin:['housekeeping:read']}};
const contrastAudit=async(page,selector)=>page.locator(selector).evaluateAll(nodes=>{
 const rgb=value=>(value.match(/[\d.]+/g)??[]).slice(0,3).map(Number);
 const light=value=>rgb(value).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 return nodes.filter(n=>n.getClientRects().length).map(n=>{let bg=n;while(bg.parentElement&&getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement;const a=light(getComputedStyle(n).color),b=light(getComputedStyle(bg).backgroundColor);return {label:n.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
});
const failures=[];
for(const engine of(process.env.CML_BROWSER_ENGINES??'chromium').split(',')){
 assert(['chromium','webkit'].includes(engine));const browser=await({chromium,webkit}[engine]).launch();
 try{for(const width of[1400,834,390,320]){
  const context=await browser.newContext({viewport:{width,height:1000},locale:'cs-CZ'}),page=await context.newPage(),queries=[],errors=[],activeProfile=structuredClone(profile),serverRooms=structuredClone(rows);let writeCount=0,receipt=null;
  page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));await page.clock.setFixedTime(new Date('2026-10-30T12:00:00Z'));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin);if(request.method()!=='GET'){assert.equal(request.method(),'PATCH');assert.equal(url.pathname,prefix+'api/v1/housekeeping/rooms/room-201');assert(activeProfile.permissions.includes('housekeeping:write'));const body=request.postDataJSON();assert.equal(body.expected_status,serverRooms[3].housekeeping_status_key);assert.equal(body.status,'clean');writeCount++;assert.equal(writeCount,1,'Lost acknowledgement must never repeat a write');const id=request.headers()['idempotency-key'];assert(id);serverRooms[3].housekeeping_status_key='clean';receipt={id,body:structuredClone(serverRooms[3])};await route.fulfill({status:503,json:{error:{message:'Isolated lost acknowledgement'}}});return;}
   if(url.pathname.startsWith('/assets/')){await route.fulfill({status:204});return;}
   const path=url.pathname.slice(prefix.length);
   if(path==='identity'){await route.fulfill({json:activeProfile});return;}
   if(path==='api/v1/housekeeping/rooms'){
    assert.equal(url.searchParams.get('include_options'),'true');assert.equal(url.searchParams.get('include_blocks'),'true');queries.push(url.searchParams.get('date'));
    await route.fulfill({json:{rooms:serverRooms}});return;
   }
   if(path==='api/request-status'){assert.equal(url.searchParams.get('request_id'),receipt.id);await route.fulfill({json:{state:'completed',status:200,body:receipt.body}});return;}
   assert((/^(flags\/[A-Z]{2}|room-artwork\/[a-z-]+)\.svg$/.test(path))||(!path.includes('/')&&(!path||/\.(js|css|json)$/.test(path))),'Unexpected isolated URL '+path);
   const file=path||'index.html';await route.fulfill({body:await readFile(new URL(file,root)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':'text/html'});
  });
  try{
   await page.goto(origin+prefix+'?view=rooms');await page.locator('#content[aria-busy=false]').waitFor();await expect(page.locator('.room-tile')).toHaveCount(8);
   const columns=await page.locator('.rooms').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length);
   if(width<600)assert.equal(columns,4,'Original housekeeping has four mobile columns');
   const referencePage=await context.newPage();await referencePage.setContent('<style>'+referenceCss+'</style><div id="reference" class="k-hk-board"></div>');await referencePage.addScriptTag({content:reference.outputFiles[0].text});
   for(const row of rows){
    const tile=page.locator('[data-room-id="'+row.room_id+'"]'),box=await tile.boundingBox();
    await referencePage.evaluate(({row,width})=>{document.querySelector('#reference').style.width=width+'px';window.renderReference(row,'2026-10-30');},{row,width:box.width});
    await referencePage.locator('.k-hk-room').waitFor();await referencePage.locator('.k-hk-room').evaluate((node,width)=>{node.style.width=width+'px';node.style.height='122px';},box.width);
    const actual=await tile.evaluate(node=>{const style=getComputedStyle(node),top=node.querySelector('.room-top');return {height:node.getBoundingClientRect().height,header:top.getBoundingClientRect().height,bg:getComputedStyle(top).backgroundColor,border:style.borderColor,radius:style.borderRadius,slots:[...node.querySelectorAll('.room-slot')].map(n=>getComputedStyle(n).backgroundColor)};});
    const expected=await referencePage.locator('.k-hk-room').evaluate(node=>{node.style.height='122px';const style=getComputedStyle(node),top=node.querySelector('.k-hk-room__topline');return {height:node.getBoundingClientRect().height,header:top.getBoundingClientRect().height,bg:getComputedStyle(top).backgroundColor,border:style.borderColor,radius:style.borderRadius,slots:[...node.querySelectorAll('.k-hk-room__slot')].map(n=>getComputedStyle(n).backgroundColor)};});
    assert.deepEqual(actual,expected,row.room_number+' original component geometry and palette');
    const midpoint=(node,selector)=>{const box=node.getBoundingClientRect(),text=node.querySelector(selector).getBoundingClientRect();return Math.round((text.x+text.width/2-box.x)/box.width*100);};
    assert.equal(await tile.evaluate(midpoint,'.room-top strong'),await referencePage.locator('.k-hk-room').evaluate(midpoint,'.k-hk-room__topline strong'),'Room number alignment follows the original');
    for(const [current,original]of [['.room-top','.k-hk-room__topline'],['.room-body','.k-hk-room__body'],['.room-stamp','.k-hk-reservation'],['.room-identity','.k-hk-reservation__identity'],['.room-people','.k-hk-person-counts'],['.room-event','.k-hk-reservation__event'],['.room-requests','.k-hk-requests--compact'],['.room-stay-label','.k-hk-room__stay-label']]){
     const dimensions=(node,selector)=>{const origin=node.getBoundingClientRect();return [...node.querySelectorAll(selector)].map(n=>{const b=n.getBoundingClientRect();return [b.x-origin.x,b.y-origin.y,b.width,b.height].map(v=>Math.round(v*10)/10);});};
     const measured=await tile.evaluate(dimensions,current),referenceSize=await referencePage.locator('.k-hk-room').evaluate(dimensions,original);
     assert.deepEqual(measured,referenceSize,row.room_number+' '+current+' geometry matches original');
    }

    await referencePage.evaluate(()=>{document.querySelector('#reference').remove();const root=document.createElement('div');root.id='reference';root.className='k-hk-board';document.body.append(root);});
   }
   await referencePage.close();
   const tileContrast=await contrastAudit(page,'.room-guest,.room-people b,.room-time,.room-nights,.room-stay-label b,.room-conflict');for(const result of tileContrast)assert(result.ratio>=4.5,JSON.stringify(result));
   await expect(page.locator('[data-room-id="room-101"] .room-guest')).toHaveCount(2);await expect(page.locator('[data-room-id="room-102"] .room-stay-label')).toHaveText('POBYT');await expect(page.locator('[data-room-id="room-102"] .room-time')).toHaveText('');
   await expect(page.locator('[data-room-id="room-201"] .room-block')).toHaveCount(1);await expect(page.locator('[data-room-id="room-202"] .room-conflict')).toHaveText('Neurčený stav rezervace');await expect(page.locator('[data-room-id="room-203"] .room-conflict')).toHaveText('Více rezervací');
   const appearance=()=>page.locator('.room-reference').evaluateAll(nodes=>nodes.map(node=>[node.getBoundingClientRect().height,...[node,...node.querySelectorAll('*')].map(n=>{const s=getComputedStyle(n);return [s.color,s.backgroundColor,s.fontSize,s.borderColor];})]));
   const beforeRefresh=queries.length;await page.evaluate(()=>dispatchEvent(new Event('focus')));await expect.poll(()=>queries.length).toBeGreaterThan(beforeRefresh);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForFunction(()=>[...document.querySelectorAll('.room-reference img')].every(n=>n.complete&&n.naturalWidth>0));
   if(output)await page.screenshot({path:output+'/'+engine+'-'+width+'-original-palette.png',fullPage:true});
   const beforeTheme=await appearance();const injectedTheme=await page.addStyleTag({content:':root{--bg:hotpink;--text:lime;--accent:purple;--line:red;--panel:yellow;--muted:orange;--k-color-room-clean:blue;--k-color-reservation-confirmed:black;color-scheme:dark}'});assert.deepEqual(await appearance(),beforeTheme,'Menu theme cannot change room semantics or typography');
   if(output)await page.screenshot({path:output+'/'+engine+'-'+width+'-theme.png',fullPage:true});
   await injectedTheme.evaluate(node=>node.remove());
   await expect(page.locator('label').filter({has:page.getByLabel('Datum',{exact:true})})).toContainText('Datum');
   await expect(page.locator('label').filter({has:page.getByLabel('Hledat pokoj',{exact:true})})).toContainText('Hledat pokoj');
   const date=page.getByLabel('Datum',{exact:true}),before=queries.length;
   await date.fill('');await expect(date).toHaveValue('2026-10-30');await expect(page.getByRole('alert')).toContainText('platné datum');assert.equal(queries.length,before,'An empty date cannot trigger a backend request');await expect(page.locator('.room-tile')).toHaveCount(8);
   await date.fill('2026-10-25');await expect.poll(()=>queries.at(-1)).toBe('2026-10-25');await page.locator('#content[aria-busy=false]').waitFor();
   for(const [name,expected]of[['Předchozí den','2026-10-24'],['Následující den','2026-10-25'],['Dnes','2026-10-30']]){await page.getByRole('button',{name,exact:true}).click();await expect.poll(()=>queries.at(-1)).toBe(expected);await page.locator('#content[aria-busy=false]').waitFor();}
   await page.getByLabel('Hledat pokoj',{exact:true}).fill('201');await expect(page.locator('.room-tile')).toHaveCount(1);await expect(page.locator('.room-tile')).toContainText('201');
   await page.getByLabel('Patro',{exact:true}).selectOption('1');await expect(page.locator('.room-tile')).toHaveCount(0);await page.getByLabel('Patro',{exact:true}).selectOption('2');await expect(page.locator('.room-tile')).toHaveCount(1);
   await page.getByRole('button',{name:'Obnovit',exact:true}).click();await page.locator('#content[aria-busy=false]').waitFor();await expect(page.getByLabel('Hledat pokoj',{exact:true})).toHaveValue('201');await expect(page.getByLabel('Patro',{exact:true})).toHaveValue('2');await expect(page.locator('.room-tile')).toHaveCount(1);
   await page.locator('.room-tile').click();await expect(page.getByRole('dialog')).toBeVisible();for(const button of await page.locator('.room-status-actions button').all())await expect(button).toBeDisabled();const dialogContrast=await contrastAudit(page,'#dialog button,#dialog p,#dialog h2,#dialog h3');for(const result of dialogContrast)assert(result.ratio>=4.5,JSON.stringify(result));const axe=await new AxeBuilder({page}).include('#dialog').withRules(['color-contrast']).analyze();assert.deepEqual(axe.violations,[],'Dialog color contrast');console.log(JSON.stringify({engine,width,minimumTileTextContrast:Math.min(...tileContrast.map(n=>n.ratio)),minimumDialogTextContrast:Math.min(...dialogContrast.map(n=>n.ratio)),axeDialogViolations:axe.violations.length}));
   if(output)await page.screenshot({path:output+'/'+engine+'-'+width+'-dialog.png',fullPage:true});await page.getByRole('button',{name:'Zavřít',exact:true}).click();
   activeProfile.permissions.push('housekeeping:write');await page.reload();await page.locator('#content[aria-busy=false]').waitFor();
   await page.getByLabel('Hledat pokoj',{exact:true}).fill('');await page.getByLabel('Patro',{exact:true}).selectOption('');await page.locator('[data-room-id="room-201"]').click();
   await page.getByRole('button',{name:'Uklizeno pro nájezd',exact:true}).hover();assert.equal(await page.getByRole('button',{name:'Uklizeno pro nájezd',exact:true}).evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(34, 197, 94)');
   await page.getByRole('button',{name:'Uklizeno pro nájezd',exact:true}).click();await expect(page.getByRole('button',{name:'Načíst původní výsledek',exact:true})).toBeVisible();assert.equal(writeCount,1);
   await page.getByRole('button',{name:'Načíst původní výsledek',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();assert.equal(writeCount,1);await expect(page.locator('[data-room-id="room-201"] .room-top')).toHaveCSS('background-color','rgb(34, 197, 94)');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');assert.deepEqual(errors,[]);
   console.log(`PASS ${engine} ${width} room layout, labelled controls, invalid date, day navigation, retained filters and read-only detail`);
  }catch(error){failures.push(`${engine} ${width}: ${error.message}`);console.error(`FAIL ${engine} ${width}: ${error.message}`);}finally{await context.close();}
 }}finally{await browser.close();}
}
assert.deepEqual(failures,[]);
