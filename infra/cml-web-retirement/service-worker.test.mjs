import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('service-worker.js',import.meta.url),'utf8');
for(const failure of [null,'subscription','notifications'])test('Legacy worker retirement remains local and completes: '+failure,async()=>{
 const events=new Map(),effects=[];
 const self={addEventListener:(name,handler)=>events.set(name,handler),skipWaiting:async()=>effects.push('skip'),registration:{
  pushManager:{getSubscription:async()=>{if(failure==='subscription')throw Error('synthetic offline');return {unsubscribe:async()=>effects.push('unsubscribe')};}},
  getNotifications:async()=>{if(failure==='notifications')throw Error('synthetic unavailable');return [{close:()=>effects.push('close')}];},
  unregister:async()=>effects.push('unregister')
 }};
 vm.runInNewContext(source,{self});assert.deepEqual([...events.keys()],['install','activate']);
 let pending;const event={waitUntil:value=>pending=value};events.get('install')(event);await pending;events.get('activate')(event);await pending;
 assert.equal(effects[0],'skip');assert.equal(effects.at(-1),'unregister');assert.equal(effects.filter(value=>value==='unregister').length,1);
 assert.equal(effects.includes('unsubscribe'),failure!=='subscription');assert.equal(effects.includes('close'),failure!=='notifications');
});
