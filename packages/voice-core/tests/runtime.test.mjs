import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceRealtimeClient} from '../dist/runtime.js';
import {transition} from '../dist/state.js';
import {capabilityRegistry} from '../dist/contracts.js';

function host({permission, create} = {}) {
  const peers = [], tracks = [], events = [], audios = [], contexts = [], sources = [], meters = [];
  const environment = {
    async getUserMedia() {if (permission) throw permission; const track = {readyState: 'live', enabled: true, stop() {this.readyState = 'ended'; this.stopped = true;}}; tracks.push(track); return {getTracks: () => [track], getAudioTracks: () => [track]};},
    createContext() {const context = {resume: async () => {}, close: async () => {context.closed = true;}, createAnalyser() {const meter={fftSize:0,getByteTimeDomainData(data) {data.fill(128);},disconnect() {this.disconnected=true;}};meters.push(meter);return meter;},createMediaStreamSource(stream) {const source={stream,connect(meter) {this.meter=meter;},disconnect() {this.disconnected=true;}};sources.push(source);return source;}}; contexts.push(context); return context;},
    createAudio() {const audio = {setAttribute() {}, play: async () => {}, pause() {audio.paused = true;}, removeAttribute() {}, load() {}}; audios.push(audio); return audio;},
    createPeer() {const channel = {close() {this.closed = true;}};
      const peer = {channel, addTrack() {}, createDataChannel: () => channel,
        createOffer: async () => ({sdp: 'v=0 offer'}), setLocalDescription: async () => {},
        setRemoteDescription: async () => {channel.onmessage({data: JSON.stringify({type: 'session.created', event_id: 'connected'})});},
        close() {this.closed = true;}, connectionState: 'new'};
      peers.push(peer); return peer;},
  };
  const provider = {create: create ?? (async () => ({sdp: 'v=0 answer', model: 'test-model'}))};
  const client = new VoiceRealtimeClient(provider, {emit: (name, attrs) => events.push({name, attrs})}, environment);
  const send = event => peers.at(-1).channel.onmessage({data: JSON.stringify(event)});
  return {client, peers, tracks, audios, contexts, sources, meters, events, send};
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

for (const kind of ['function_call', 'mcp_call']) test('unexpected '+ kind +' stops the session without an executor', async () => {
  const h = host(); await h.client.start(); h.send({type: 'response.output_item.added', item: {type: kind}});
  assert.equal(h.client.getSnapshot().error.category, 'unsupported_capability'); assert.ok(h.tracks[0].stopped);
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

for(const failure of ['reject','error']) test(`remote audio ${failure} reports playback failure and releases graph`, async () => {
 const h=host();await h.client.start();const remote={getTracks:()=>[{kind:'audio'}]};
 if(failure==='reject') h.audios[0].play=async()=>{throw new Error('private-playback-failure');};
 h.peers[0].ontrack({streams:[remote]});
 assert.equal(h.sources[1].stream,remote);assert.equal(h.meters.length,2);
 if(failure==='error') h.audios[0].onerror();
 await Promise.resolve();await Promise.resolve();
 assert.equal(h.client.getSnapshot().error.category,'playback_failed');
 assert.ok(h.tracks[0].stopped&&h.peers[0].closed&&h.audios[0].paused&&h.contexts[0].closed);
 assert.equal(h.audios[0].srcObject,null);assert.equal(h.audios[0].onerror,null);
 assert.ok(h.sources.every(source=>source.disconnected)&&h.meters.every(meter=>meter.disconnected));
 assert.ok(!JSON.stringify([h.client.getSnapshot(),h.events]).includes('private-playback'));
});

test('track without streams creates playback stream and Stop rejects late old tracks', async () => {
 const previous=globalThis.MediaStream;const streams=[];
 globalThis.MediaStream=class {constructor(tracks) {this.tracks=tracks;streams.push(this);}getTracks() {return this.tracks;}};
 try {
  const h=host();await h.client.start();const peer=h.peers[0],late=peer.ontrack;const track={kind:'audio'};
  peer.ontrack({streams:[],track});assert.equal(streams.length,1);assert.deepEqual(streams[0].getTracks(),[track]);
  assert.equal(h.audios[0].srcObject,streams[0]);assert.equal(h.sources[1].stream,streams[0]);
  await h.client.stop();assert.ok(h.sources.every(source=>source.disconnected)&&h.meters.every(meter=>meter.disconnected));
  assert.ok(h.audios[0].paused&&h.contexts[0].closed);assert.equal(h.audios[0].srcObject,null);assert.equal(peer.ontrack,null);
  late({streams:[],track});assert.equal(streams.length,1);assert.equal(h.audios[0].srcObject,null);
 } finally {if(previous===undefined) delete globalThis.MediaStream;else globalThis.MediaStream=previous;}
});

test('reconnect disconnects old playback graph and rejects late tracks and play failures', async () => {
 const h=host();await h.client.start();const first=h.peers[0],audio=h.audios[0],late=first.ontrack;
 let reject;audio.play=()=>new Promise((_resolve,fail)=>{reject=fail;});
 first.ontrack({streams:[{getTracks:()=>[]} ]});assert.equal(h.sources.length,2);
 first.connectionState='disconnected';first.onconnectionstatechange();
 assert.equal(h.client.getSnapshot().state,'reconnecting');assert.ok(h.sources.every(source=>source.disconnected)&&h.meters.every(meter=>meter.disconnected));
 assert.ok(audio.paused);assert.equal(audio.srcObject,null);assert.equal(audio.onerror,null);assert.equal(first.ontrack,null);
 assert.ok(!h.contexts[0].closed);assert.ok(!h.tracks[0].stopped);
 late({streams:[{getTracks:()=>[]} ]});assert.equal(h.sources.length,2);
 reject(new Error('late-private-failure'));await Promise.resolve();assert.equal(h.client.getSnapshot().state,'reconnecting');
 await new Promise(done=>setTimeout(done,1100));const second=h.peers[1];second.ontrack({streams:[{getTracks:()=>[]} ]});
 assert.equal(h.client.getSnapshot().state,'listening');assert.equal(h.sources.length,4);
 await h.client.stop();assert.ok(h.sources.every(source=>source.disconnected)&&h.meters.every(meter=>meter.disconnected));
 assert.ok(h.audios.every(item=>item.paused&&item.srcObject===null)&&h.contexts[0].closed&&h.tracks[0].stopped);
});
