import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observeBrowser,successfulResult} from './browser.mjs';

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

test('a transport result or business error cannot masquerade as success',()=>{
  assert.equal(successfulResult({output:'{"errors":[]}'}),true);
  assert.equal(successfulResult({output:'{"content":[{"type":"text","text":"{\\"errors\\":[]}"}]}'}),true);
  assert.equal(successfulResult({output:'{"errors":[{"code":"INTERNAL_ERROR"}]}'}),false);
  assert.equal(successfulResult({error:{code:'failed'},output:'{"errors":[]}'}),false);
  assert.equal(successfulResult({output:'{}'}),false);
});
