import assert from 'node:assert/strict';
import test from 'node:test';
import {LogicalCallClient} from '../dist/calls.js';

test('Start alone makes no request; all reconnects share identity; Stop closes once', async () => {
  const requests=[];
  const calls=new LogicalCallClient(async(path,method)=>{requests.push([path,method]);return {logical_call_id:'owner-call'};});
  calls.start();assert.equal(requests.length,0);
  const signal=new AbortController().signal;
  assert.equal(await calls.identity(signal),'owner-call');
  assert.equal(await calls.identity(signal),'owner-call');
  await calls.end();await calls.end();
  assert.deepEqual(requests,[['/calls','POST'],['/calls/owner-call/close','POST']]);
});

test('late allocation after Stop closes the old call without touching a new Start', async () => {
  let release;
  const requests=[];
  const calls=new LogicalCallClient(async(path)=>{
    requests.push(path);
    if(path==='/calls' && requests.length===1)return new Promise(resolve=>{release=resolve;});
    return {logical_call_id:'new'};
  });
  calls.start();const old=calls.identity(new AbortController().signal);
  const rejected=assert.rejects(old,error=>error.category==='session_ended');
  const end=calls.end();calls.start();
  assert.equal(await calls.identity(new AbortController().signal),'new');
  release({logical_call_id:'old'});await rejected;await end;
  assert.equal(requests.filter(path=>path==='/calls/old/close').length,1);
  await calls.end();assert.ok(requests.includes('/calls/new/close'));
});

test('uncertain allocation/close never triggers an automatic write retry', async () => {
  let count=0;
  const calls=new LogicalCallClient(async()=>{count++;throw {category:'request_failed'};});
  calls.start();
  await assert.rejects(calls.identity(new AbortController().signal));
  await assert.rejects(calls.identity(new AbortController().signal));
  await calls.end();assert.equal(count,1);
});
