import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {SpokenCompletion} from './mcp_spoken_completion.mjs';

const devices = [{name: 'synthetic lamp'}];
const event = (type, response_id = 'grounded') => ({type, response_id});
function speech(proof) {
  proof.handle({type: 'response.output_item.done', item: {type: 'mcp_call', name: 'search_devices'}});
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
  proof.handle({type: 'response.output_item.done', item: {type: 'mcp_call', name: 'search_devices'}});
  proof.handle(done('completed')); proof.handle(event('output_audio_buffer.stopped')); assert.equal(proof.ready(devices), false);
});
test('browser-injected class waits for the exact grounded response', () => {
  const window = {}; runInNewContext(`window.SpokenCompletion = ${SpokenCompletion.toString()};`, {window});
  const proof = new window.SpokenCompletion(); speech(proof); proof.handle(done('completed')); proof.handle(event('output_audio_buffer.stopped'));
  assert.equal(proof.ready(devices), true);
});
