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
  assert.deepEqual(m.handle(event).approval,{id:'approval',name:'action',details:[],canApprove:false});assert.ok(!m.handle(event).approval);
});

test('concurrent native approvals stay queued and reset on disconnect', () => {
 const m=new McpLifecycle();const event=id=>({type:'conversation.item.done',item:{id,type:'mcp_approval_request',name:'write'}});
 assert.equal(m.handle(event('first')).approval.id,'first');assert.equal(m.handle(event('second')).approval,undefined);
 assert.equal(m.resolveApproval('first').id,'second');assert.equal(m.resolveApproval('second'),null);
 m.handle(event('third'));m.reset();assert.equal(m.resolveApproval('third'),null);
});

const executeSchema = {type:'object',title:'execute_device_actionArguments',properties:Object.fromEntries(['device_key','property_key','state_key','catalog_version','action_token'].map(key => [key,{type:'string',minLength:1,maxLength:key === 'action_token' ? 4096 : 100}])),required:['device_key','property_key','state_key','catalog_version','action_token'],additionalProperties:false};
const args = {device_key:'reception-light',property_key:'power',state_key:'on',catalog_version:'private-version',action_token:'private-action-token'};
const imported = schema => ({type:'conversation.item.done',item:{type:'mcp_list_tools',tools:[{name:'execute_device_action',input_schema:schema}]}});
const request = (argumentsValue, name='execute_device_action') => ({type:'conversation.item.done',item:{id:'context',type:'mcp_approval_request',name,arguments:argumentsValue}});
test('approval context keeps exact target and state and removes opaque credentials', () => {
 const m=new McpLifecycle();m.handle(imported(executeSchema));
 const approval=m.handle(request(JSON.stringify(args))).approval;
 assert.deepEqual(approval,{id:'context',name:'execute_device_action',details:[{label:'device_key',value:'reception-light'},{label:'property_key',value:'power'},{label:'state_key',value:'on'}],canApprove:true});
 assert.ok(!JSON.stringify(approval).includes('private-'));
});
for (const value of [undefined,'broken','null','[]','{}',JSON.stringify({...args,state_key:null}),JSON.stringify({...args,authorization:'private-auth'}),JSON.stringify({...args,device_key:'x'.repeat(101)}),JSON.stringify({...args,state_key:''})]) {
 test(`invalid approval context is unavailable: ${String(value).slice(0,30)}`, () => {
  const m=new McpLifecycle();m.handle(imported(executeSchema));
  const approval=m.handle(request(value)).approval;
  assert.equal(approval.canApprove,false);assert.deepEqual(approval.details,[]);
 });
}
test('unknown or missing schema never enables approval and reset discards contracts', () => {
 const m=new McpLifecycle();assert.equal(m.handle(request(JSON.stringify(args))).approval.canApprove,false);
 m.reset();m.handle(imported({...executeSchema,allOf:[]}));assert.equal(m.handle(request(JSON.stringify(args))).approval.canApprove,false);
 m.reset();m.handle(imported(executeSchema));m.reset();assert.equal(m.handle(request(JSON.stringify(args))).approval.canApprove,false);
});
test('generic nested safe context excludes secret fields and rejects incomplete display', () => {
 const schema={type:'object',properties:{target:{type:'object',properties:{name:{type:'string'},api_key:{type:'string'},authorization:{type:'string'},password:{type:'string'}},required:['name','api_key','authorization','password'],additionalProperties:false}},required:['target'],additionalProperties:false};
 const m=new McpLifecycle();m.handle(imported(schema));
 const approval=m.handle(request(JSON.stringify({target:{name:'meeting-room',api_key:'private-api',authorization:'private-auth',password:'private-password'}}))).approval;
 assert.deepEqual(approval.details,[{label:'target.name',value:'meeting-room'}]);assert.equal(approval.canApprove,true);
 m.reset();m.handle(imported(schema));assert.equal(m.handle(request(JSON.stringify({target:{name:'x'.repeat(513),api_key:'a',authorization:'b',password:'c'}}))).approval.canApprove,false);
});

test('credentials copied into visible action fields cannot leak into approval snapshot', () => {
 const m=new McpLifecycle();m.handle(imported(executeSchema));
 const approval=m.handle(request(JSON.stringify({...args,state_key:args.action_token}))).approval;
 assert.equal(approval.canApprove,false);assert.deepEqual(approval.details,[]);assert.ok(!JSON.stringify(approval).includes(args.action_token));
});

test('barge-in cancels a created response before its first delayed MCP call', () => {
 const m = new McpLifecycle();
 m.handle({type:'response.created',response:{id:'old'}});
 m.handle({type:'input_audio_buffer.speech_started'});
 m.handle(call('late','old'));
 m.handle(done(['late'],'completed','old'));
 assert.ok(!m.handle(completed('late','old')).followup);
 m.handle({type:'response.created',response:{id:'new'}});
 m.handle(call('current','new'));
 m.handle(done(['current'],'completed','new'));
 assert.equal(m.handle(completed('current','new')).followup,true);
});
