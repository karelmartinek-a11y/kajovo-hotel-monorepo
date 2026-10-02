import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceRealtimeClient} from '../dist/runtime.js';
import {transition} from '../dist/state.js';
import {capabilityRegistry} from '../dist/contracts.js';

function host({permission, create, heartbeat, close} = {}) {
  const peers = [], tracks = [], events = [], audios = [], contexts = [];
  const environment = {
    async getUserMedia() {if (permission) throw permission; const track = {readyState: 'live', enabled: true, stop() {this.readyState = 'ended'; this.stopped = true;}}; tracks.push(track); return {getTracks: () => [track], getAudioTracks: () => [track]};},
    createContext() {const context = {resume: async () => {}, close: async () => {context.closed = true;}}; contexts.push(context); return context;},
    createAudio() {const audio = {setAttribute() {}, play: async () => {}, pause() {audio.paused = true;}, removeAttribute() {}, load() {}}; audios.push(audio); return audio;},
    createPeer() {const channel = {close() {this.closed = true;}};
      const peer = {channel, addTrack() {}, createDataChannel: () => channel,
        createOffer: async () => ({sdp: 'v=0 offer'}), setLocalDescription: async () => {},
        setRemoteDescription: async () => {channel.onmessage({data: JSON.stringify({type: 'session.created', event_id: 'connected'})});},
        close() {this.closed = true;}, connectionState: 'new'};
      peers.push(peer); return peer;},
  };
  const provider = {create: create ?? (async () => ({sdp: 'v=0 answer', model: 'test-model'})), heartbeat, close};
  const client = new VoiceRealtimeClient(provider, {emit: (name, attrs) => events.push({name, attrs})}, environment);
  const send = event => peers.at(-1).channel.onmessage({data: JSON.stringify(event)});
  return {client, peers, tracks, audios, contexts, events, send};
}

test('interruption has deterministic transitions and generation done is not playback done', () => {
  assert.deepEqual(capabilityRegistry, []);
  assert.equal(transition('assistant-speaking', {type: 'response.done', response: {status: 'completed'}}), 'assistant-speaking');
  assert.equal(transition('assistant-speaking', {type: 'input_audio_buffer.speech_started'}), 'user-speaking');
  assert.equal(transition('user-speaking', {type: 'output_audio_buffer.cleared'}), 'user-speaking');
  assert.equal(transition('user-speaking', {type: 'response.done', response: {status: 'cancelled'}}), 'user-speaking');
  assert.equal(transition('error', {type: 'session.created'}), 'error');
});

test('repeated start/stop releases every resource and does not duplicate output', async () => {
  const h = host();
  await h.client.stop(); assert.equal(h.client.getSnapshot().state, 'idle'); assert.equal(h.events.length, 0);
  for (let i = 0; i < 3; i++) {
    await h.client.start(); await h.client.start();
    assert.equal(h.client.getSnapshot().state, 'listening');
    assert.equal(h.peers.length, i + 1);
    h.client.setMuted(true); assert.equal(h.tracks.at(-1).enabled, false);
    h.client.setMuted(false); assert.equal(h.tracks.at(-1).enabled, true);
    h.send({type: 'response.created', event_id: 'r'});
    h.send({type: 'output_audio_buffer.started', event_id: 'a'});
    assert.equal(h.client.getSnapshot().state, 'assistant-speaking');
    h.send({type: 'input_audio_buffer.speech_started', event_id: 's'});
    h.send({type: 'output_audio_buffer.cleared', event_id: 'c'});
    assert.equal(h.client.getSnapshot().state, 'user-speaking');
    h.send({type: 'output_audio_buffer.started', event_id: 'a'});
    assert.equal(h.client.getSnapshot().state, 'user-speaking');
    await h.client.stop(); await h.client.stop();
    assert.equal(h.events.filter(event => event.name === 'session.ended').length, i + 1);
    assert.ok(h.tracks.at(-1).stopped && h.peers.at(-1).closed && h.peers.at(-1).channel.closed);
    assert.equal(h.peers.at(-1).channel.onmessage, null);
    assert.ok(h.contexts.at(-1).closed && h.audios.at(-1).paused);
  }
});

test('permission denied cleans up and never requests a session', async () => {
  const error = new Error('private'); error.name = 'NotAllowedError';
  let called = false;
  const h = host({permission: error, create: async () => {called = true;}});
  await h.client.start(); assert.equal(h.client.getSnapshot().error.category, 'microphone_denied');
  assert.equal(called, false); assert.ok(h.contexts[0].closed);
});

test('stop during pending handshake aborts and discards the late answer', async () => {
  let resolve, signal;
  const h = host({create: (_sdp, abort) => {signal = abort; return new Promise(done => {resolve = done;});}});
  const pending = h.client.start(); await new Promise(done => setTimeout(done, 0));
  await h.client.stop(); assert.ok(signal.aborted);
  resolve({sdp: 'v=0 answer', model: 'late'}); await pending;
  assert.equal(h.client.getSnapshot().state, 'disconnected'); assert.equal(h.client.getSnapshot().model, null);
});

test('provider errors expose only taxonomy and terminate the microphone', async () => {
  const h = host({create: async () => {throw {category: 'invalid_api_key', secret: 'never expose'};}});
  await h.client.start(); assert.deepEqual(h.client.getSnapshot().error, {category: 'invalid_api_key'});
  assert.ok(h.tracks[0].stopped); assert.ok(!JSON.stringify(h.events).includes('never expose'));
});

test('unexpected tool event stops the session without an executor', async () => {
  const h = host(); await h.client.start(); h.send({type: 'response.output_item.added', item: {type: 'function_call'}});
  assert.equal(h.client.getSnapshot().error.category, 'unsupported_capability'); assert.ok(h.tracks[0].stopped);
});

test('backend managed function stays connected and lease/close are owned by host', async () => {
  const beats = [], closed = [];
  const h = host({create: async () => ({sdp: 'v=0 answer', model: 'test-model', session_id: 'opaque', managed_functions: ['host_function'], technologies: 'connecting'}),
    heartbeat: async id => {beats.push(id); return {technologies: 'ready', renew: false, closed: false};}, close: async id => {closed.push(id);}});
  await h.client.start(); await new Promise(done => setTimeout(done, 0));
  h.send({type: 'response.output_item.added', item: {type: 'function_call', name: 'host_function'}});
  assert.equal(h.client.getSnapshot().state, 'listening');
  assert.equal(h.client.getSnapshot().capabilityStatus, 'ready'); assert.deepEqual(beats, ['opaque']);
  await h.client.stop(); assert.deepEqual(closed, ['opaque']);
  assert.ok(h.tracks[0].stopped);
});

test('late session answer closes host resources and revoked heartbeat releases microphone', async () => {
  let resolve; const closed = [];
  const h = host({create: () => new Promise(done => {resolve = done;}), close: async id => {closed.push(id);}});
  const start = h.client.start(); await new Promise(done => setTimeout(done, 0)); await h.client.stop();
  resolve({sdp: 'v=0 answer', model: 'test-model', session_id: 'late'}); await start;
  assert.deepEqual(closed, ['late']);
  const revoked = host({create: async () => ({sdp: 'v=0 answer', model: 'test-model', session_id: 'revoked'}),
    heartbeat: async () => {throw {category: 'unauthorized'};}, close: async id => {closed.push(id);}});
  await revoked.client.start(); await new Promise(done => setTimeout(done, 0));
  assert.equal(revoked.client.getSnapshot().error.category, 'unauthorized'); assert.ok(revoked.tracks[0].stopped);
  assert.deepEqual(closed, ['late', 'revoked']);
});


test('network reconnect is bounded and replaces the old channel', async () => {
  const h = host(); await h.client.start();
  const first = h.peers[0]; first.connectionState = 'disconnected'; first.onconnectionstatechange();
  assert.equal(h.client.getSnapshot().state, 'reconnecting'); assert.equal(first.channel.onmessage, null);
  await new Promise(done => setTimeout(done, 1100));
  assert.equal(h.client.getSnapshot().state, 'listening'); assert.equal(h.peers.length, 2);
  assert.equal(h.tracks.length, 1);
  await h.client.stop(); assert.ok(h.peers.every(peer => peer.closed));
});

test('stopping while permission is pending releases the late microphone', async () => {
  let permission; const h = host();
  const pendingStream = {getTracks: () => [{stop: () => {permission.stopped = true;}}], getAudioTracks: () => []};
  h.client.environment.getUserMedia = () => new Promise(done => {permission = done;});
  const pending = h.client.start(); await new Promise(done => setTimeout(done, 0));
  await h.client.stop(); permission(pendingStream); await pending;
  assert.equal(h.client.getSnapshot().state, 'disconnected'); assert.ok(permission.stopped);
});

test('two reconnect attempts exhaust the budget and close all resources', async () => {
  const h = host(); await h.client.start();
  for (const delay of [1100, 3100]) {
    const peer = h.peers.at(-1); peer.connectionState = 'disconnected'; peer.onconnectionstatechange();
    await new Promise(done => setTimeout(done, delay));
    assert.equal(h.client.getSnapshot().state, 'listening');
  }
  const last = h.peers.at(-1); last.connectionState = 'disconnected'; last.onconnectionstatechange();
  assert.equal(h.peers.length, 3);
  assert.equal(h.client.getSnapshot().error.category, 'network_lost');
  assert.ok(h.tracks[0].stopped && h.peers.every(peer => peer.closed));
});

test('microphone interruption and realtime failure both release audio', async () => {
  const h = host(); await h.client.start(); h.tracks[0].onended();
  assert.equal(h.client.getSnapshot().error.category, 'microphone_interrupted');
  await h.client.start(); h.send({type: 'response.done', response: {status: 'failed'}});
  assert.equal(h.client.getSnapshot().error.category, 'realtime_error');
  assert.ok(h.tracks.every(track => track.stopped));
  assert.ok(h.audios.every(audio => audio.paused));
});

test('managed rate limit pauses microphone without executing a tool or ending the call', async () => {
  const h = host({create: async () => ({sdp: 'answer', model: 'test', managed_functions: ['host_function']})});
  await h.client.start();
  h.send({type: 'response.done', response: {status: 'failed', status_details: {error: {code: 'rate_limit_exceeded'}}}});
  assert.equal(h.client.getSnapshot().capabilityStatus, 'waiting');
  assert.equal(h.client.getSnapshot().error, null);
  assert.equal(h.tracks[0].enabled, false);
  assert.equal(h.tracks[0].readyState, 'live');
  h.client.setMuted(false); assert.equal(h.tracks[0].enabled, false);
  await h.client.stop();
});

test('generic connection readiness is independent of unavailable host capabilities', async () => {
  let ready;
  const h = host({create: async () => ({sdp: 'v=0 answer', model: 'test-model', session_id: 'opaque', technologies: 'unavailable', connection_state: 'connecting', managed_functions: ['host_function']}),
    heartbeat: () => new Promise(resolve => {ready = resolve;})});
  await h.client.start();
  h.client.setMuted(false);
  assert.equal(h.tracks[0].enabled, false);
  ready({technologies: 'unavailable', connection_state: 'ready', renew: false, closed: false});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(h.tracks[0].enabled, true);
  assert.equal(h.client.getSnapshot().state, 'listening');
  await h.client.stop();
});
