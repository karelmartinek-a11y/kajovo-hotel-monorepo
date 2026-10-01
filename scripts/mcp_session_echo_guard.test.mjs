import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {isCanonicalMcpSession, recordSessionSafety, isSessionSafetyReady} from './mcp_session_echo_guard.mjs';
import {hasExposedAuthorization} from './mcp_authorization_guard.mjs';
import {SpokenCompletion} from './mcp_spoken_completion.mjs';

const canonical = () => ({tools: [{type: 'mcp', server_label: 'home_assistant',
  server_url: 'https://hotel.hcasc.cz/mcp/home-assistant',
  authorization: '<redacted>', headers: {Authorization: '<redacted>'},
  allowed_tools: ['search_devices', 'get_device_state', 'execute_device_action'],
  require_approval: {never: {tool_names: ['search_devices', 'get_device_state']}}}]});

test('exact session.created/updated nullable native MCP echoes pass', () => {
  for (const type of ['session.created', 'session.updated']) {
    const session = canonical();
    session.tools[0].connector_id = null;
    session.tools[0].tunnel_id = null;
    session.tools[0].require_approval.always = null;
    const event = JSON.parse(JSON.stringify({type, session}));
    assert.equal(isCanonicalMcpSession(event.session), true);
  }
  assert.equal(isCanonicalMcpSession(canonical()), true);
});

test('actual or malformed alternative transports fail closed', () => {
  for (const field of ['connector_id', 'tunnel_id']) {
    for (const value of ['connector_canary', '', false, 0, {}]) {
      const session = canonical(); session.tools[0][field] = value;
      assert.equal(isCanonicalMcpSession(session), false);
    }
  }
});

test('URL, label, MCP type and exact session tool set are mandatory', () => {
  for (const [field, value] of [['server_url', 'https://example.test/mcp'],
    ['server_label', 'other'], ['type', 'function']]) {
    const session = canonical(); session.tools[0][field] = value;
    assert.equal(isCanonicalMcpSession(session), false);
  }
  for (const tools of [undefined, null, {}, [], [null], [...canonical().tools, ...canonical().tools]]) {
    assert.equal(isCanonicalMcpSession({tools}), false);
  }
});

test('allowlist cannot omit, add or duplicate imported tool names', () => {
  for (const value of [null, {}, [], ['search_devices', 'get_device_state'],
    ['search_devices', 'get_device_state', 'extra'],
    ['search_devices', 'search_devices', 'execute_device_action'],
    [...canonical().tools[0].allowed_tools, 'extra']]) {
    const session = canonical(); session.tools[0].allowed_tools = value;
    assert.equal(isCanonicalMcpSession(session), false);
  }
  const reordered = canonical(); reordered.tools[0].allowed_tools.reverse();
  assert.equal(isCanonicalMcpSession(reordered), true);
});

test('only exact read-only approval exception passes', () => {
  for (const value of ['never', 'always', null, [], {}, {never: {tool_names: ['execute_device_action']}},
    {never: {tool_names: ['search_devices', 'search_devices']}},
    {never: {tool_names: ['search_devices', 'get_device_state', 'execute_device_action']}},
    {never: {tool_names: ['search_devices', 'get_device_state']}, always: {tool_names: ['search_devices']}}]) {
    const session = canonical(); session.tools[0].require_approval = value;
    assert.equal(isCanonicalMcpSession(session), false);
  }
});

test('the exact injected browser function accepts nullable echo and rejects connectors', () => {
  const window = {};
  runInNewContext(`window.__voiceSessionGuard = ${isCanonicalMcpSession.toString()};`, {window});
  const session = canonical(); session.tools[0].connector_id = null; session.tools[0].tunnel_id = null;
  assert.equal(window.__voiceSessionGuard(JSON.parse(JSON.stringify(session))), true);
  session.tools[0].connector_id = 'connector_canary';
  assert.equal(window.__voiceSessionGuard(session), false);
});

function actualBrowserListener() {
  const source = readFileSync(new URL('./verify_live_voice_mcp.mjs', import.meta.url), 'utf8');
  const callback = source.match(/await context\.addInitScript\(\(\{wav\}\) => \{([\s\S]*?)\n    \},\{wav\}\);/);
  assert(callback, 'actual browser callback must be exercised');
  let listener;
  class Peer {
    createDataChannel() {return {addEventListener(type, callback) {assert.equal(type, 'message'); listener = callback;}};}
    setRemoteDescription() {}
  }
  const window = {__voiceSpokenCompletion: new SpokenCompletion(),
    __voiceSessionGuard: isCanonicalMcpSession, __voiceAuthorizationGuard: hasExposedAuthorization};
  runInNewContext(`window.__voiceSessionSafety = ${recordSessionSafety.toString()};`, {window});
  runInNewContext(`(({wav}) => {${callback[1]}\n})({wav:null});`,
    {window, navigator: {mediaDevices: {}}, RTCPeerConnection: Peer});
  new Peer().createDataChannel('oai-events');
  return {window, evidence: window.__mcpEvidence,
    emit: event => listener({data: JSON.stringify(event)})};
}

async function imported(harness) {
  const session = canonical(); session.tools[0].connector_id = null; session.tools[0].tunnel_id = null;
  await harness.emit({type: 'session.created', session});
  await harness.emit({type: 'mcp_list_tools.completed'});
  await harness.emit({type: 'conversation.item.done', item: {type: 'mcp_list_tools',
    tools: session.tools[0].allowed_tools.map(name => ({name}))}});
  assert.equal(harness.evidence.imported.length, 3);
  assert.equal(harness.evidence.importCompleted, true);
  assert.equal(isSessionSafetyReady(harness.evidence), true);
}

async function groundedRead(harness) {
  const devices = [{name: 'Synthetic lamp'}];
  await harness.emit({type: 'response.output_item.done', response_id: 'grounded', item: {
    id: 'read-call', type: 'mcp_call', name: 'search_devices', arguments: JSON.stringify({name: 'recepce'}),
    output: JSON.stringify({status: 'ok', devices})}});
  await harness.emit({type: 'output_audio_buffer.started', response_id: 'grounded'});
  harness.window.__voiceSpokenCompletion.sample(2);
  await harness.emit({type: 'response.output_audio_transcript.done', response_id: 'grounded', transcript: 'Synthetic lamp'});
  await harness.emit({type: 'response.done', response: {id: 'grounded', status: 'completed'}});
  await harness.emit({type: 'output_audio_buffer.stopped', response_id: 'grounded'});
  assert.equal(harness.window.__voiceSpokenCompletion.ready(harness.evidence.devices), true);
  assert.equal(harness.evidence.call.success, true);
}

test('actual listener accepts nullable updates and successful completed read', async () => {
  const harness = actualBrowserListener(); await imported(harness);
  const session = canonical(); session.tools[0].connector_id = null; session.tools[0].tunnel_id = null;
  await harness.emit({type: 'session.updated', session}); await groundedRead(harness);
  assert.equal(isSessionSafetyReady(harness.evidence), true);
});

test('late invalid transport, allowlist or approval cannot pass after successful read', async () => {
  for (const change of [tool => {tool.connector_id = 'connector_canary';},
    tool => {tool.allowed_tools = ['search_devices'];}, tool => {tool.require_approval = 'never';}]) {
    const harness = actualBrowserListener(); await imported(harness);
    const session = canonical(); change(session.tools[0]);
    await harness.emit({type: 'session.updated', session});
    await groundedRead(harness);
    assert.equal(harness.evidence.error, 'native_mcp_session_configuration_missing');
    assert.equal(isSessionSafetyReady(harness.evidence), false);
    await harness.emit({type: 'session.updated', session: canonical()});
    assert.equal(harness.evidence.configValid, true);
    assert.equal(isSessionSafetyReady(harness.evidence), false);
  }
});

test('late raw credential exposure cannot be erased by valid echo or grounded read', async () => {
  const harness = actualBrowserListener(); await imported(harness);
  const session = canonical(); session.tools[0].headers.Authorization = 'canary-scoped-credential';
  await harness.emit({type: 'session.updated', session});
  await harness.emit({type: 'session.updated', session: canonical()});
  await groundedRead(harness);
  assert.equal(harness.evidence.credentialsExposed, true);
  assert.equal(harness.evidence.error, 'private_authorization_exposed');
  assert.equal(isSessionSafetyReady(harness.evidence), false);
});

test('actual smoke checks fresh final safety evidence after Stop and before printing PASS', () => {
  const source = readFileSync(new URL('./verify_live_voice_mcp.mjs', import.meta.url), 'utf8');
  const stop = source.indexOf("name:'Ukončit hovor'");
  const final = source.slice(stop);
  assert.match(final, /evidence=await page\.evaluate\(\(\)=>window\.__mcpEvidence\);\s*assert\.equal\(isSessionSafetyReady\(evidence\),true/);
  assert(final.indexOf('isSessionSafetyReady(evidence)') < final.indexOf('console.log('));
});
