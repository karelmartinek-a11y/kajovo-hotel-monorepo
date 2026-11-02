import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observeBrowser,successfulResult,resultPlayback,settledAnswer,sameNativeRequest,spokenProgress} from './browser.mjs';

test('cached mail answers still reject spoken progress',()=>{
  assert.ok(spokenProgress('Chvilku, zkontroluju pořadí.'));
  assert.ok(spokenProgress('Podívám se na to.'));
  assert.equal(spokenProgress('Nejnovější zpráva přišla třicátého září.'),false);
});

test('observer receives the unchanged envelope before a product handler',()=>{
  const observed=[],handlers=[];
  class Peer {
    addEventListener(){}
    createDataChannel(){return {addEventListener(type,callback){if(type==='message')handlers.push(callback);}};}
  }
  globalThis.window={RTCPeerConnection:Peer,observeMailEnvelope:event=>observed.push(event)};
  globalThis.HTMLMediaElement=class{};
  HTMLMediaElement.prototype.play=()=>Promise.resolve();
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{}}});
  observeBrowser();
  new window.RTCPeerConnection().createDataChannel('events');
  handlers.push(()=>observed.push({surface:'product_handler'}));
  const raw='{"type":"session.updated","authorization":"synthetic-unit-canary"}';
  handlers.forEach(callback=>callback({data:raw}));
  assert.equal(observed[0].raw,raw);
  assert.equal(observed[1].surface,'product_handler');
});

test('old speech after a tool result is not result playback',()=>{
  const result={time:10};
  const events=[{type:'output_audio_buffer.started',time:5,response_id:'old'},
    {type:'played_audio',time:11,response_id:'old'}];
  assert.equal(resultPlayback(events,result),undefined);
  events.push({type:'output_audio_buffer.started',time:12,response_id:'answer'},
    {type:'played_audio',time:13,response_id:'answer'});
  assert.equal(resultPlayback(events,result).response_id,'answer');
});

test('intermediate audio and pending native work cannot end a multi-step turn',()=>{
  const events=[{type:'response.created',response_id:'r',time:2},
    {type:'response.done',response_id:'r',time:3,status:'completed',output_types:['message']},
    {type:'played_audio',response_id:'r',time:4},
    {type:'output_audio_buffer.stopped',response_id:'r',time:5}];
  assert.equal(settledAnswer(events,1,new Set(['pending']),2000),null);
  assert.equal(settledAnswer(events,1,new Set(),500),null);
  assert.equal(settledAnswer(events,1,new Set(),2000).response_id,'r');
  events.push({type:'response.created',response_id:'next',time:6});
  assert.equal(settledAnswer(events,1,new Set(),2000),null);
});

test('a transport result or business error cannot masquerade as success',()=>{
  assert.equal(successfulResult({output:'{"errors":[]}'}),true);
  assert.equal(successfulResult({output:'{"content":[{"type":"text","text":"{\\"errors\\":[]}"}]}'}),true);
  assert.equal(successfulResult({output:'{"errors":[{"code":"INTERNAL_ERROR"}]}'}),false);
  assert.equal(successfulResult({error:{code:'failed'},output:'{"errors":[]}'}),false);
  assert.equal(successfulResult({output:'{}'}),false);
});


test('native approval denial matches the original request despite key order',()=>{
  const a={name:'mail_send_execute',server_label:'hotel_mail',arguments:'{"send_request_id":"r","idempotency_key":"k"}'};
  assert.ok(sameNativeRequest(a,{...a,arguments:'{"idempotency_key":"k","send_request_id":"r"}'}));
  assert.equal(sameNativeRequest(a,{...a,arguments:'{"idempotency_key":"other","send_request_id":"r"}'}),false);
  assert.equal(sameNativeRequest(a,{...a,server_label:'foreign'}),false);
});
