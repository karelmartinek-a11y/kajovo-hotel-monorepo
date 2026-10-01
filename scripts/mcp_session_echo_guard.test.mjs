import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {isCanonicalMcpSession} from './mcp_session_echo_guard.mjs';

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
