import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DiagnosticClient} from '../dist/diagnostics.js';

class Recorder {
  static values=[];
  static isTypeSupported(mime){return mime==='audio/mp4';}
  state='inactive';mimeType='audio/mp4';onstop=null;onerror=null;ondataavailable=null;
  constructor(stream){this.stream=stream;Recorder.values.push(this);}
  start(){this.state='recording';}
  data(text='audio'){this.ondataavailable?.({data:new Blob([text])});}
  stop(){this.state='inactive';this.data('final');this.onstop?.();}
}
const track={id:'existing',enabled:true,muted:false,readyState:'live',getSettings(){return {echoCancellation:true};},getConstraints(){return {echoCancellation:true};},addEventListener(){},stop(){throw new Error('Shared track stopped');}};
const stream={getAudioTracks(){return [track];}};
function host(){
  const requests=[];let calls=0,generation=0;
  const request=async(path,method,body,signal,headers)=>{
    requests.push({path,method,body,headers});
    if(path==='/calls')return {logical_call_id:'call_'+ ++calls};
    if(path.endsWith('/segments'))return {segment_id:'segment_'+ ++generation,generation};
    return {};
  };
  return {request,requests};
}

async function connected(recorder=Recorder){
  Recorder.values=[];const env=host();const client=new DiagnosticClient(env.request,recorder);
  await client.startCall();await client.bind('connection');client.media('microphone',stream);client.media('remote',stream);
  return {client,...env};
}

test('two existing streams, on/off final flush, MP4 and next call off',async()=>{
  const {client,requests}=await connected();
  assert.equal(Recorder.values.length,0);
  await client.toggle();assert.equal(client.getSnapshot().state,'recording');
  assert.equal(Recorder.values.length,2);
  assert.ok(Recorder.values.every(value=>value.stream===stream));
  Recorder.values.forEach(value=>value.data());
  await client.toggle();assert.equal(client.getSnapshot().state,'off');
  const chunks=requests.filter(value=>value.path.includes('/chunks/'));
  assert.equal(chunks.length,4);
  assert.equal(JSON.parse(chunks[0].headers['x-dagmar-chunk']).mime,'audio/mp4');
  assert.equal(await chunks[0].body.text(),'audio');
  const stops=requests.filter(value=>value.path.endsWith('/stop'));
  assert.equal(stops[0].body.complete,false);assert.equal(stops.at(-1).body.complete,true);
  await client.finishCall();await client.startCall();
  assert.equal(client.getSnapshot().state,'off');assert.equal(client.getSnapshot().callId,'call_2');
  await client.finishCall();
});

test('unsupported recorder is visibly partial, never complete',async()=>{
  class Unsupported extends Recorder{static isTypeSupported(){return false;}}
  const {client,requests}=await connected(Unsupported);
  await client.toggle();assert.equal(client.getSnapshot().state,'degraded');
  assert.equal(client.getSnapshot().error,'mime_unsupported');
  await client.toggle();
  assert.ok(!requests.some(value=>value.path.endsWith('/stop')&&value.body.complete));
  await client.finishCall();
});

test('rapid toggles fence an in-flight start and restore final intent',async()=>{
  const env=host();let unblock;
  const gate=new Promise(done=>{unblock=done;});let first=true;
  const client=new DiagnosticClient(async(...args)=>{if(args[0].endsWith('/segments')&&first){first=false;await gate;}return env.request(...args);},Recorder);
  await client.startCall();await client.bind('connection');client.media('microphone',stream);client.media('remote',stream);
  const on=client.toggle();await Promise.resolve();const off=client.toggle();const again=client.toggle();unblock();
  await Promise.all([on,off,again]);assert.equal(client.getSnapshot().state,'recording');
  assert.ok(env.requests.some(value=>value.path.endsWith('/stop')&&value.body.complete));
  await client.finishCall();
});

test('bounded upload queue drops bytes without stopping WebRTC tracks',async()=>{
  const env=host();let unblock;const gate=new Promise(done=>{unblock=done;});
  const client=new DiagnosticClient(async(...args)=>{if(args[0].includes('/chunks/'))await gate;return env.request(...args);},Recorder);
  await client.startCall();await client.bind('connection');client.media('microphone',stream);client.media('remote',stream);
  await client.toggle();Recorder.values.at(-1).data('x'.repeat(10*1024*1024));
  await Promise.resolve();assert.ok(client.getSnapshot().droppedBytes>=2*1024*1024);
  assert.equal(client.getSnapshot().state,'degraded');unblock();await client.finishCall();
});

test('one Start retains terminal event and late emit/flush never create another call',async()=>{
  const {client,requests}=await connected();
  client.prepareStop();client.emit('session.ended',{reason:'user_stop'});await client.finishCall();
  client.emit('session.ended',{});await client.flushEvents();
  assert.equal(requests.filter(r=>r.path==='/calls').length,1);
  assert.ok(requests.filter(r=>r.path.endsWith('/events')).some(r=>r.body.events.some(e=>e.event_type==='session.ended')));
  assert.ok(requests.some(r=>r.path.endsWith('/final')&&r.body.complete));
});

test('old delayed reconnect cleanup cannot erase newly bound remote stream',async()=>{
  const env=host();let release;
  const gate=new Promise(done=>{release=done;});let delayed=true;
  const client=new DiagnosticClient(async(...args)=>{if(args[0].endsWith('/stop')&&!args[2].complete&&delayed){delayed=false;await gate;}return env.request(...args);},Recorder);
  await client.startCall();await client.bind('old');client.media('microphone',stream);client.media('remote',stream);await client.toggle();
  client.emit('connection.close',{});const binding=client.bind('new');await Promise.resolve();
  const remote={getAudioTracks(){return [{...track,id:'new_remote'}];}};client.media('remote',remote);
  release();await binding;
  assert.equal(client.connectionId,'new');assert.equal(client.tracks.get('remote'),remote);
  assert.equal(client.getSnapshot().state,'recording');
  const fresh=Recorder.values.at(-1);fresh.data('new_init');await client.toggle();
  const chunks=env.requests.filter(r=>r.path.includes('/chunks/')).map(r=>JSON.parse(r.headers['x-dagmar-chunk']));
  assert.ok(chunks.some(c=>c.track_id==='new_remote'&&c.sequence===0&&c.recording_id));
  await client.finishCall();
});

test('metadata saturation is visible and durable even with debug Off',async()=>{
  const {client,requests}=await connected();
  for(let i=0;i<300;i++)client.emit('critical.fixture',{count:1});
  assert.equal(client.getSnapshot().state,'off');assert.equal(client.getSnapshot().error,'metadata_backpressure');
  assert.ok(client.getSnapshot().missingEvents>0);await client.finishCall();
  const final=requests.find(r=>r.path.endsWith('/final'));
  assert.equal(final.body.complete,false);assert.ok(final.body.missing_events>0);
});

test('delta aggregation retains raw identities without manufacturing sequence gaps',async()=>{
  const {client,requests}=await connected();
  for(let i=0;i<250;i++)client.provider({type:'response.output_audio.delta',event_id:'delta_'+i,response_id:'response'});
  await client.finishCall();
  const deltas=requests.filter(r=>r.path.endsWith('/events')).flatMap(r=>r.body.events).filter(e=>e.event_type.endsWith('.delta'));
  assert.equal(deltas.reduce((n,e)=>n+e.attributes.count,0),250);
  assert.equal(deltas.flatMap(e=>e.attributes.provider_event_ids).length,250);
  assert.equal(client.getSnapshot().error,null);
});

test('Stop during delayed explicit Start closes the original late logical identity',async()=>{
  const env=host();let release;const gate=new Promise(done=>{release=done;});
  const client=new DiagnosticClient(async(...args)=>{if(args[0]==='/calls')await gate;return env.request(...args);},Recorder);
  const start=client.startCall();const end=client.finishCall();release();await Promise.all([start,end]);
  assert.equal(env.requests.filter(r=>r.path==='/calls').length,1);
  assert.ok(env.requests.some(r=>r.path==='/calls/call_1/close'));
  client.emit('late.provider.event',{});await client.flushEvents();
  assert.equal(env.requests.filter(r=>r.path==='/calls').length,1);
});
