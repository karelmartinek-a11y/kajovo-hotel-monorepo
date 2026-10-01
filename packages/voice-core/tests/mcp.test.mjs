import test from 'node:test';
import assert from 'node:assert/strict';
import {McpLifecycle} from '../dist/mcp.js';
const call = (id, response_id = 'r') => ({type: 'response.mcp_call.in_progress', item_id: id, response_id});
const completed = (id, response_id = 'r') => ({type: 'response.output_item.done', response_id, item: {id, type: 'mcp_call'}});
const done = (ids, status = 'completed', id = 'r') => ({type: 'response.done', response: {id, status, output: ids.map(id => ({id, type: 'mcp_call'}))}});

test('import readiness requires actual imported names and distinguishes failure', () => {
  const m = new McpLifecycle();
  assert.equal(m.handle({type:'mcp_list_tools.in_progress'}).status, 'loading');
  assert.equal(m.handle({type:'mcp_list_tools.completed'}).status, undefined);
  assert.deepEqual(m.handle({type:'conversation.item.done', item:{type:'mcp_list_tools',tools:[{name:'read'}]}}), {tools:['read'],status:'ready'});
  assert.equal(m.handle({type:'mcp_list_tools.failed'}).status,'unavailable');
});
for (const reverse of [false,true]) test(`one followup with done ${reverse ? 'after' : 'before'} tool completion`, () => {
  const m = new McpLifecycle(); m.handle(call('c'));
  const first = reverse ? completed('c') : done(['c']);
  const last = reverse ? done(['c']) : completed('c');
  assert.ok(!m.handle(first).followup); assert.ok(m.handle(last).followup);
  assert.ok(!m.handle(last).followup); assert.ok(!m.handle(first).followup);
});
test('all calls finish before followup; responses remain correlated', () => {
  const m = new McpLifecycle(); m.handle(call('a'));m.handle(call('b'));
  m.handle(done(['a','b']));assert.ok(!m.handle(completed('a')).followup);
  assert.ok(m.handle({type:'response.mcp_call.failed',item_id:'b',response_id:'r'}).followup);
  m.handle(call('c','s'));assert.ok(!m.handle(completed('c','s')).followup);
  assert.ok(m.handle(done(['c'],'completed','s')).followup);
});
test('barge-in, cancellation, stop and reconnect discard late completions', () => {
  const m = new McpLifecycle();m.handle(call('a'));m.handle(done(['a']));
  m.handle({type:'input_audio_buffer.speech_started'});assert.ok(!m.handle(completed('a')).followup);
  m.reset();assert.ok(!m.handle(completed('a')).followup);
  m.reset();m.handle(call('b'));m.handle(done(['b'],'cancelled'));assert.ok(!m.handle(completed('b')).followup);
});
test('approval request is surfaced once', () => {
  const m = new McpLifecycle();const event={type:'conversation.item.done',item:{id:'approval',type:'mcp_approval_request',name:'write'}};
  assert.deepEqual(m.handle(event).approval,{id:'approval',name:'write'});assert.ok(!m.handle(event).approval);
});

test('concurrent native approvals stay queued and reset on disconnect', () => {
 const m=new McpLifecycle();const event=id=>({type:'conversation.item.done',item:{id,type:'mcp_approval_request',name:'write'}});
 assert.equal(m.handle(event('first')).approval.id,'first');assert.equal(m.handle(event('second')).approval,undefined);
 assert.equal(m.resolveApproval('first').id,'second');assert.equal(m.resolveApproval('second'),null);
 m.handle(event('third'));m.reset();assert.equal(m.resolveApproval('third'),null);
});
