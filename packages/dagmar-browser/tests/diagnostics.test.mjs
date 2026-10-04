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
    if(path==='/diagnostics/calls')return {logical_call_id:'call_'+ ++calls};
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
