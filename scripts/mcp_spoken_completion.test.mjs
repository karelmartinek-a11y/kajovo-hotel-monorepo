import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {SpokenCompletion} from './mcp_spoken_completion.mjs';

const devices = [{name: 'synthetic lamp'}];
const event = (type, response_id = 'grounded') => ({type, response_id});
const search = (response_id = 'grounded', status = 'ok') => ({type: 'response.output_item.done', response_id, item: {id:'search-call',type: 'mcp_call', name: 'search_devices', arguments: JSON.stringify({name:'recepce'}), output: JSON.stringify({status, devices})}});
function speech(proof) {
  proof.handle(search());
  proof.handle(event('output_audio_buffer.started')); proof.sample(2);
  proof.handle({...event('response.output_audio_transcript.done'), transcript: 'Synthetic lamp'});
}
const done = status => ({type: 'response.done', response: {id: 'grounded', status}});

test('transcript and partial RTP never prove spoken completion', () => {
  const proof = new SpokenCompletion(); speech(proof);
  assert.equal(proof.ready(devices), false);
  proof.handle(done('completed')); assert.equal(proof.ready(devices), false);
  proof.handle(event('output_audio_buffer.stopped')); assert.equal(proof.ready(devices), true);
});
test('completion ordering remains correlated to the same response', () => {
  const proof = new SpokenCompletion(); speech(proof);
  proof.handle(event('output_audio_buffer.stopped')); assert.equal(proof.ready(devices), false);
  proof.handle({type: 'response.done', response: {id: 'other', status: 'completed'}}); assert.equal(proof.ready(devices), false);
  proof.handle(done('completed')); assert.equal(proof.ready(devices), true);
});
test('cancelled, failed and cleared responses cannot pass', () => {
  for (const status of ['cancelled', 'failed', 'incomplete']) {
    const proof = new SpokenCompletion(); speech(proof); proof.handle(done(status)); proof.handle(event('output_audio_buffer.stopped'));
    assert.equal(proof.ready(devices), false);
  }
  const proof = new SpokenCompletion(); speech(proof); proof.handle(done('completed')); proof.handle(event('output_audio_buffer.cleared')); proof.handle(event('output_audio_buffer.stopped'));
  assert.equal(proof.ready(devices), false);
});
test('greeting audio and pre-search transcript cannot satisfy grounding', () => {
  const proof = new SpokenCompletion(); proof.handle(event('output_audio_buffer.started', 'greeting')); proof.sample(20);
  proof.handle({...event('response.output_audio_transcript.done'), transcript: 'Synthetic lamp'});
  proof.handle(search());
  proof.handle(done('completed')); proof.handle(event('output_audio_buffer.stopped')); assert.equal(proof.ready(devices), false);
});
test('browser-injected class waits for the exact grounded response', () => {
  const window = {}; runInNewContext(`window.SpokenCompletion = ${SpokenCompletion.toString()};`, {window});
  const proof = new window.SpokenCompletion(); speech(proof); proof.handle(done('completed')); proof.handle(event('output_audio_buffer.stopped'));
  assert.equal(proof.ready(devices), true);
});

test('preexisting unrelated playback cannot borrow successful search grounding', () => {
  const proof = new SpokenCompletion();
  proof.handle({type:'response.created', response:{id:'other'}});
  proof.handle(event('output_audio_buffer.started','other')); proof.sample(20);
  proof.handle(search('parent'));
  proof.handle({type:'response.done',response:{id:'parent',status:'cancelled'}});
  proof.handle({...event('response.output_audio_transcript.done','other'),transcript:'Synthetic lamp'});
  proof.handle({type:'response.done',response:{id:'other',status:'completed'}});
  proof.handle(event('output_audio_buffer.stopped','other'));
  assert.equal(proof.ready(devices),false);
});
test('new followup after semantically successful search can prove completion', () => {
  const proof = new SpokenCompletion(); proof.handle(search('parent'));
  proof.handle({type:'response.done',response:{id:'parent',status:'completed'}});
  proof.handle({type:'response.created',response:{id:'grounded'}});
  proof.handle(event('output_audio_buffer.started')); proof.sample(2);
  proof.handle({...event('response.output_audio_transcript.done'),transcript:'Synthetic lamp'});
  proof.handle(done('completed')); proof.handle(event('output_audio_buffer.stopped'));
  assert.equal(proof.ready(devices),true);
  assert.equal(proof.ready([{name:'different fixture'}]),false);
});
test('failed or malformed search output never grounds even a new followup', () => {
  for (const bad of [search('parent','error'), {...search('parent'),item:{...search('parent').item,output:'broken'}}, {...search('parent'),item:{...search('parent').item,arguments:JSON.stringify({query:'recepce'})}}]) {
    const proof = new SpokenCompletion(); proof.handle(bad);
    proof.handle({type:'response.created',response:{id:'grounded'}});
    proof.handle(event('output_audio_buffer.started')); proof.sample(2);
    proof.handle({...event('response.output_audio_transcript.done'),transcript:'Synthetic lamp'});
    proof.handle(done('completed')); proof.handle(event('output_audio_buffer.stopped'));
    assert.equal(proof.ready(devices),false);
  }
});

test('duplicate created event cannot promote a preexisting unrelated response', () => {
  const proof = new SpokenCompletion(); const created = {type:'response.created',response:{id:'grounded'}};
  proof.handle(created); proof.handle(search('parent')); proof.handle(created);
  proof.handle(event('output_audio_buffer.started')); proof.sample(2);
  proof.handle({...event('response.output_audio_transcript.done'),transcript:'Synthetic lamp'});
  proof.handle(done('completed')); proof.handle(event('output_audio_buffer.stopped'));
  assert.equal(proof.ready(devices),false);
});

test('followup requires completed parent and every correlated call terminal', () => {
  for (const incomplete of ['parent', 'second_call']) {
    const proof = new SpokenCompletion(); proof.handle(search('parent'));
    if (incomplete === 'second_call') {
      proof.handle({type:'response.output_item.added',response_id:'parent',item:{type:'mcp_call',id:'other-call'}});
      proof.handle({type:'response.done',response:{id:'parent',status:'completed'}});
    }
    proof.handle({type:'response.created',response:{id:'grounded'}});
    proof.handle(event('output_audio_buffer.started')); proof.sample(2);
    proof.handle({...event('response.output_audio_transcript.done'),transcript:'Synthetic lamp'});
    proof.handle(done('completed')); proof.handle(event('output_audio_buffer.stopped'));
    assert.equal(proof.ready(devices),false);
  }
});
test('cleared parent or barge-in invalidates result chain', () => {
  for (const interruption of [event('output_audio_buffer.cleared','parent'), {type:'input_audio_buffer.speech_started'}]) {
    const proof = new SpokenCompletion(); proof.handle(search('parent'));
    proof.handle({type:'response.done',response:{id:'parent',status:'completed'}});
    proof.handle(interruption);
    proof.handle({type:'response.created',response:{id:'grounded'}});
    proof.handle(event('output_audio_buffer.started')); proof.sample(2);
    proof.handle({...event('response.output_audio_transcript.done'),transcript:'Synthetic lamp'});
    proof.handle(done('completed')); proof.handle(event('output_audio_buffer.stopped'));
    assert.equal(proof.ready(devices),false);
  }
});
