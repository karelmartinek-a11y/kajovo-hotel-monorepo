// Isolated test instrumentation only. Never imported into a production bundle.
import {createRequire} from 'node:module';
import {readFile, writeFile, lstat, mkdtemp, rm} from 'node:fs/promises';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

export function sameNativeRequest(a,b) {
  if(!a || !b || a.name!==b.name || a.server_label!==b.server_label)return false;
  try{
    const entries=item=>JSON.stringify(Object.entries(JSON.parse(item.arguments)).sort(([a],[b])=>a.localeCompare(b)));
    return entries(a)===entries(b);
  }catch{return false;}
}

export function spokenProgress(text) {
  return /(?:\bmoment\b|podívám se|hned (?:to )?zjistím|chvilku|zkontroluju|ověřím (?:to|pořadí)|teď (?:to )?vyhledám)/iu.test(text);
}

export function resultValue(item) {
  try {
    let output=typeof item.output==='string'?JSON.parse(item.output):item.output;
    if(output.structuredContent)output=output.structuredContent;
    else if(output.content || Array.isArray(output))
      output=JSON.parse((output.content??output).filter(part=>part.type==='text').map(part=>part.text??'').join(''));
    return output;
  }catch{return null;}
}
export function successfulResult(item) {
  const output=resultValue(item);
  return Boolean(!item.error && output && !Array.isArray(output) && typeof output==='object'
    && Array.isArray(output.errors) && output.errors.length===0 && output.isError!==true);
}

export function resultPlayback(events, result) {
  // A previous response can still be audible while MCP completes. Its energy
  // is not evidence that the result has been spoken.
  return events.find(event=>event.type==='played_audio' && event.time>result.time
    && event.response_id && events.some(start=>start.type==='output_audio_buffer.started'
      && start.response_id===event.response_id && start.time>result.time));
}

export function settledAnswer(events, since, pendingCalls, now) {
  if(pendingCalls.size)return null;
  const created=events.filter(event=>event.type==='response.created'&&event.time>since).at(-1);
  if(!created)return null;
  const done=events.find(event=>event.type==='response.done'&&event.response_id===created.response_id);
  if(!done || done.status!=='completed' || !done.output_types?.includes('message')
    || done.output_types.some(type=>['mcp_call','mcp_approval_request','function_call'].includes(type)))return null;
  const stopped=events.find(event=>event.type==='output_audio_buffer.stopped'&&event.response_id===created.response_id);
  if(!stopped || now-stopped.time<1000)return null;
  return events.find(event=>event.type==='played_audio'&&event.response_id===created.response_id)??null;
}

export function observeBrowser() {
  const probe = window.__mailProbe = {input:null, audios:[], clips:{}, started:performance.now()};
  const emit = (surface, raw) => window.observeMailEnvelope({surface,raw,time:performance.now()});
  const Peer = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends Peer {
    constructor(...args) {
      super(...args);
      this.addEventListener('track', event => {
        const context = new AudioContext();
        const processor = context.createScriptProcessor(2048,1,1);
        context.createMediaStreamSource(event.streams[0]).connect(processor);
        const silent = context.createGain(); silent.gain.value=0;
        processor.connect(silent).connect(context.destination);
        processor.onaudioprocess = event => {
          const samples=event.inputBuffer.getChannelData(0);
          const energy=samples.reduce((sum,sample)=>sum+sample*sample,0)/samples.length;
          if(energy>0.00001)probe.lastEnergy=performance.now();
          if(probe.stoppedResponse===probe.activeResponse && performance.now()-(probe.lastEnergy??0)>500)
            probe.activeResponse=null;
          if (energy>0.00001 && probe.audios.some(audio=>!audio.paused && audio.currentTime>0))
            void emit('played_audio', JSON.stringify({rms:Math.sqrt(energy),samples:samples.length,response_id:probe.activeResponse}));
          if(probe.activeResponse && probe.audios.some(audio=>!audio.paused && audio.currentTime>0)){
            const clip=probe.clips[probe.activeResponse]??={sampleRate:context.sampleRate,chunks:[],frames:0};
            if(clip.frames<context.sampleRate*600){clip.chunks.push(new Float32Array(samples));clip.frames+=samples.length;}
          }
        };
      });
    }
    createDataChannel(...args) {
      const channel=super.createDataChannel(...args);
      // Registered before the product handler; no filtering or redaction.
      channel.addEventListener('message',event=>{
        const value=JSON.parse(event.data);
        if(value.type==='output_audio_buffer.started'){probe.activeResponse=value.response_id;probe.stoppedResponse=null;}
        // The server's empty buffer event can precede the browser's final decoded
        // RTP frames. Retain their identity until actual playback becomes silent.
        if(value.type==='output_audio_buffer.stopped')probe.stoppedResponse=value.response_id;
        if(value.type==='output_audio_buffer.cleared')probe.activeResponse=null;
        void emit('data_channel',event.data);
      });
      channel.addEventListener('open',()=>void emit('channel_open',''));
      return channel;
    }
  };
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(...args){
    probe.audios.push(this);
    return play.apply(this,args);
  };
  probe.wavs=()=>Object.entries(probe.clips).map(([response_id,clip])=>{
    const pcm=new Float32Array(clip.frames);let offset=0;
    for(const chunk of clip.chunks){pcm.set(chunk,offset);offset+=chunk.length;}
    const rate=16000,frames=Math.floor(pcm.length*rate/clip.sampleRate);
    const bytes=new Uint8Array(44+frames*2),view=new DataView(bytes.buffer);
    const str=(at,value)=>[...value].forEach((char,index)=>view.setUint8(at+index,char.charCodeAt(0)));
    str(0,'RIFF');view.setUint32(4,bytes.length-8,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);
    view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);
    view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,frames*2,true);
    for(let i=0;i<frames;i++)view.setInt16(44+i*2,Math.max(-1,Math.min(1,pcm[Math.floor(i*clip.sampleRate/rate)]))*32767,true);
    let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));
    return {response_id,wav:btoa(binary),seconds:frames/rate};
  });
  // A synthetic PCM source is captured as a genuine MediaStream/RTP audio track.
  // No transcript, user text, tool result or provider event is injected.
  navigator.mediaDevices.getUserMedia=async()=>{
    const context=new AudioContext(), destination=context.createMediaStreamDestination();
    const silence=context.createConstantSource(), gain=context.createGain(); gain.gain.value=0;
    silence.connect(gain).connect(destination); silence.start();
    probe.input=async(name='default')=>{
      await context.resume();
      const response=await fetch('/dagmar/test-input.wav?name='+encodeURIComponent(name));
      const audio=await context.decodeAudioData(await response.arrayBuffer());
      const source=context.createBufferSource(); source.buffer=audio; source.connect(destination); source.start();
    };
    return destination.stream;
  };
}

async function main() {
  assert.equal(process.env.VOICE_CORE_LIVE_SMOKE,'1','explicit_paid_opt_in_required');
  assert.ok(!process.env.CI && !process.env.GITHUB_ACTIONS,'outside_CI_required');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
  const [ledger,manifest,evidence,authorization]=process.argv.slice(2);
  assert.ok(ledger && manifest && evidence,'ledger_manifest_evidence_required');
  const hostFile=path.join(path.dirname(fileURLToPath(import.meta.url)),'host.py');
  const hostEvidence=evidence+'.provider.json';
  assert.ok(!authorization || authorization==='--authorized-final-run','explicit_final_authorization_required');
  const args=[hostFile,authorization?'--costs':'--ledger',ledger,'--fixture',manifest,'--evidence',hostEvidence,
    ...(authorization?[authorization]:[])];
  const checked=spawnSync('python3.11',args,{cwd:root,encoding:'utf8'});
  if(checked.status!==0){process.stdout.write(checked.stdout);process.exitCode=2;return;}
  const candidate=JSON.parse(checked.stdout).candidate;
  try{await lstat(evidence);throw new Error('new_evidence_file_required');}catch(error){if(error.code!=='ENOENT')throw error;}
  const fixture=JSON.parse(await readFile(manifest,'utf8'));
  const buildDirectory=await mkdtemp(path.join(path.dirname(evidence),'browser-build-'));
  const build=spawnSync('pnpm',['exec','vite','build','--outDir',buildDirectory],{
    cwd:path.join(root,'examples/dagmar-host'),encoding:'utf8'});
  if(build.status!==0){await rm(buildDirectory,{recursive:true,force:true});throw new Error('candidate_browser_build_failed');}
  // Read the existing voice secret through its adapter in a read-only DB
  // transaction. SSH/docker stdout is captured here, never forwarded to a log,
  // browser, command argument or environment variable.
  const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  const keyReader=`from app.services.dagmar_adapter import create_dagmar
from app.db.session import SessionLocal
from dagmar_server.ports import bind
from dagmar_server.config import VoiceSecretAdapter
from sqlalchemy import text
with bind(create_dagmar().ports):
 with SessionLocal() as db:
  db.execute(text('SET TRANSACTION READ ONLY'))
  print(VoiceSecretAdapter(db).read())
`;
  const remote=`import subprocess,sys
ids=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project=kajovo-prod','--filter','label=com.docker.compose.service=api'],text=True).split()
assert len(ids)==1
result=subprocess.run(['docker','exec',ids[0],'python','-c',${JSON.stringify(keyReader)}],capture_output=True,text=True)
assert result.returncode==0
sys.stdout.write(result.stdout)
`;
  const loaded=spawnSync('ssh',['produkce','python3 -c '+quote(remote)],{encoding:'utf8'});
  assert.equal(loaded.status,0,'standard_voice_secret_store_unavailable');
  const key=loaded.stdout.trim();
  assert.ok(key && !/\s/.test(key) && key.length<=512,'standard_voice_secret_store_invalid');
  const secrets=[fixture.mcp_token,fixture.approval_token,key]; // Node memory only.
  const host=spawn('python3.11',[...args,'--serve'],{cwd:root,stdio:['pipe','ignore','ignore']});
  host.stdin.end(key+'\n');
  const vite=spawn('pnpm',['exec','vite','preview','--outDir',buildDirectory,'--host','127.0.0.1','--port','5173','--strictPort'],{
    cwd:path.join(root,'examples/dagmar-host'),stdio:'ignore'});
  let browser, page, sessionId, backendMailStatus, clips=[],providerCreditExhausted=false;
  const leaks=[],events=[],bundleHashes={},syntheticTranscripts=[],calls=[],functions=[],steps=[],violations=[],pendingCalls=new Set(),nativeItems=new Map();
  const scan=(surface,raw,time)=>{
    if(secrets.some(secret=>raw.includes(secret)))leaks.push({surface,time});
    if(surface==='data_channel'){
      const event=JSON.parse(raw); // Raw envelopes stay in RAM only.
      const item=event.item??{};
      if(item.id && ['mcp_call','mcp_approval_request'].includes(item.type))nativeItems.set(item.id,{...nativeItems.get(item.id),...item});
      if(event.type==='response.mcp_call_arguments.done'&&nativeItems.has(event.item_id))nativeItems.get(event.item_id).arguments=event.arguments;
      if(item.type==='mcp_approval_response'&&item.approve===false){
        const approval=nativeItems.get(item.approval_request_id);
        if(approval)for(const [id,call] of nativeItems){
          if(call.type==='mcp_call'&&sameNativeRequest(call,approval))pendingCalls.delete(id);
        }
      }
      if(item.type==='mcp_call'&&item.id){
        if(event.type.endsWith('.done')&&(item.output!=null||item.error!=null))pendingCalls.delete(item.id);
        else if(event.type.endsWith('.added'))pendingCalls.add(item.id);
      }
      const saved={type:event.type,time,item_type:item.type,item_id:item.id??event.item_id,approval_request_id:item.approval_request_id,approve:item.approve,metadata:event.response?.metadata,response_id:event.response_id??event.response?.id,
        tool:item.type==='mcp_call'?item.name:undefined};
      if(item.type==='mcp_list_tools') saved.tool_count=item.tools?.length;
      if(item.type==='function_call'&&event.type.endsWith('.done')&&!functions.some(call=>call.id===item.id)){
        let operation;try{operation=JSON.parse(item.arguments||'{}').operation;}catch{}
        functions.push({id:item.id,call_id:item.call_id,name:item.name,operation,time});
        saved.function_name=item.name;saved.operation=operation;
      }
      if(item.type==='mcp_call' && event.type.endsWith('.done'))saved.result_success=successfulResult(item);
      if(item.type==='mcp_call' && event.type.endsWith('.done')){
        const value=resultValue(item);
        if(!calls.some(call=>call.id===item.id))calls.push({id:item.id,tool:item.name,time,args:item.arguments,value});
        saved.scope=value?.scope;saved.unread_count=value?.data?.unread_count;
        saved.total_count=value?.total_count;saved.count_kind=value?.count_kind;
        saved.coverage_complete=value?.coverage_complete;saved.errors=value?.errors?.map(error=>error.code);
        saved.argument_keys=Object.keys(JSON.parse(item.arguments||'{}'));
        if(item.error){
          saved.native_error=secrets.reduce((value,secret)=>value.replaceAll(secret,'[redacted]'),JSON.stringify(item.error));
          saved.synthetic_arguments=JSON.parse(secrets.reduce((value,secret)=>value.replaceAll(secret,'[redacted]'),item.arguments||'{}'));
          process.stdout.write(JSON.stringify({failed_native_tool:item.name,error:saved.native_error,synthetic_arguments:saved.synthetic_arguments})+'\n');
        }
      }
      if(event.type==='response.done'){
        saved.output_types=event.response.output?.map(item=>item.type);
        saved.status=event.response.status;saved.status_reason=event.response.status_details?.reason;
        saved.failure_code=event.response.status_details?.error?.code;
      }
      if(event.type==='response.created'){
        saved.mail_instruction_active=event.response?.instructions?.includes('MAIL: Use hotel_mail');
        saved.response_tools=event.response?.tools?.map(tool=>({type:tool.type,name:tool.name,label:tool.server_label}));
      }
      if(event.type==='session.updated'){
        saved.mail_instruction_active=event.session?.instructions?.includes('MAIL: Use hotel_mail');
        saved.reasoning=event.session?.reasoning;
        saved.mail_allowed_tools=event.session?.tools?.find(tool=>tool.server_label==='hotel_mail')?.allowed_tools;
      }
      if(event.type==='response.output_audio_transcript.done'){
        const text=secrets.reduce((value,secret)=>value.replaceAll(secret,'[redacted]'),event.transcript??'');
        syntheticTranscripts.push({response_id:event.response_id,time,text});
        saved.transcript_sha256=createHash('sha256').update(event.transcript??'').digest('hex');
        process.stdout.write(JSON.stringify({synthetic_response:event.response_id,text})+'\n');
      }
      if(event.type==='conversation.item.input_audio_transcription.completed')
        process.stdout.write(JSON.stringify({synthetic_input:secrets.reduce((value,secret)=>value.replaceAll(secret,'[redacted]'),event.transcript??'')})+'\n');
      events.push(saved);
    }else if(surface==='played_audio'||surface==='channel_open')events.push({type:surface,time,...(raw?JSON.parse(raw):{})});
  };
  const wait=async(predicate,seconds=60)=>{
    const deadline=Date.now()+seconds*1000;
    while(!await predicate()){
      assert.ok(!events.some(event=>event.failure_code==='credit_balance_exhausted'),'OpenAI_credit_balance_exhausted');
      assert.equal(leaks.length,0,'credential_reached_browser');
      assert.ok(Date.now()<deadline,'probe_timeout');
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  };
  let status='FAIL', reason='probe_not_completed';
  try{
    await wait(async()=>{
      try{return (await fetch('http://127.0.0.1:8008/health')).ok && (await fetch('http://127.0.0.1:5173')).ok;}catch{return false;}
    },20);
    const require=createRequire(path.join(root,'apps/kajovo-hotel-admin/package.json'));
    browser=await require('@playwright/test').chromium.launch({headless:true});
    const context=await browser.newContext({permissions:['microphone'],viewport:{width:1280,height:900}});
    page=await context.newPage();
    await page.exposeBinding('observeMailEnvelope',(_,event)=>scan(event.surface,event.raw,event.time));
    await page.addInitScript(observeBrowser);
    const pending=new Set();
    page.on('response',response=>{
      const work=(async()=>{
        const body=await response.body();
        scan('HTTP',body.toString('utf8'),Date.now());
        const url=new URL(response.url());
        if(url.pathname==='/dagmar/sessions' && response.request().method()==='POST') {
          const answer=JSON.parse(body.toString('utf8'));
          sessionId=answer.session_id;
        }
        if(/\.(js|tsx?)(?:$|\?)/.test(url.pathname))bundleHashes[url.pathname]=createHash('sha256').update(body).digest('hex');
      })().catch(()=>{leaks.push({surface:'uninspected_HTTP',time:Date.now()});});
      pending.add(work);void work.finally(()=>pending.delete(work));
    });
    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('button',{name:'Zahájit hovor',exact:true}).click();
    await wait(async()=>{
      if(!sessionId)return false;
      const response=await page.request.get('http://127.0.0.1:8008/dagmar/sessions/'+sessionId,{headers:{'x-test-admin':'test-admin-a'}});
      const raw=await response.text();scan('HTTP',raw,Date.now());
      backendMailStatus=JSON.parse(raw).managed_mcp_status?.hotel_mail;
      assert.ok(!['unavailable','incompatible'].includes(backendMailStatus),'native_mail_import_'+backendMailStatus);
      return backendMailStatus==='ready';
    });
    await Promise.all([...pending]);
    scan('storage',await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage},cookies:document.cookie})),Date.now());
    assert.deepEqual(await page.evaluate(async()=>({databases:(await indexedDB.databases()).length,caches:(await caches.keys()).length})),{databases:0,caches:0},'uninspected_browser_storage');
    assert.equal(leaks.length,0,'credential_reached_browser');
    await wait(()=>events.some(event=>event.item_type==='mcp_list_tools'&&event.tool_count===23));
    await wait(()=>events.some(event=>event.type==='output_audio_buffer.stopped'));
    for(const step of fixture.steps??[{name:'default',mail:true}]){
      let speechStarted=await page.evaluate(name=>{void window.__mailProbe.input(name);return performance.now();},step.name);
      if(step.interrupt_audio){
        const originalStart=speechStarted;
        await wait(()=>step.interrupt_when==='tool'
          ?events.some(event=>event.time>originalStart&&event.item_type==='mcp_call')
          :events.some(event=>event.time>originalStart&&event.result_success&&resultPlayback(events,event)),step.timeout??180);
        const oldResponses=new Set(events.filter(event=>event.type==='response.created'&&event.time>originalStart).map(event=>event.response_id));
        speechStarted=await page.evaluate(name=>{void window.__mailProbe.input(name);return performance.now();},step.interrupt_audio);
        await wait(()=>events.some(event=>event.type==='input_audio_buffer.speech_started'&&event.time>speechStarted));
        if(step.interrupt_when!=='tool')await wait(()=>events.some(event=>event.type==='output_audio_buffer.cleared'&&event.time>speechStarted));
        await new Promise(resolve=>setTimeout(resolve,2000));
        assert.ok(!events.some(event=>event.type==='output_audio_buffer.started'&&event.time>speechStarted+1000&&oldResponses.has(event.response_id)),'superseded_speech_revived');
        if(step.accept_silence){
          steps.push({name:step.name,status:'PASS',interruption:'native_audio',superseded_responses:oldResponses.size});
          process.stdout.write(JSON.stringify({step:step.name,status:'PASS',interruption:'native_audio'})+'\n');
          continue;
        }
      }
      let result,playback;
      await wait(async()=>{
        result=events.find(event=>event.time>speechStarted&&event.item_type==='mcp_call'&&(event.result_success||(step.allow_errors&&(event.errors||event.native_error))));
        if(step.mail!==false && !result){
          const terminal=settledAnswer(events,speechStarted,pendingCalls,await page.evaluate(()=>performance.now()));
          if(terminal && events.some(event=>event.time>speechStarted&&event.native_error))throw new assert.AssertionError({message:'native_mail_task_failed'});
          return false;
        }
        if(step.full_read){
          const latest=events.filter(event=>event.type==='response.created'&&event.time>speechStarted).at(-1);
          const done=latest&&events.find(event=>event.type==='response.done'&&event.response_id===latest.response_id);
          const stopped=latest&&events.find(event=>event.type==='output_audio_buffer.stopped'&&event.response_id===latest.response_id);
          if(done?.status==='incomplete'&&done.status_reason==='max_output_tokens'&&done.output_types?.every(type=>type==='message')&&stopped&&(await page.evaluate(()=>performance.now()))-stopped.time>3000)
            throw new assert.AssertionError({message:'full_speech_stopped_at_output_limit'});
        }
        if(step.expect_approval){
          const created=events.filter(event=>event.time>speechStarted&&event.type==='response.created'&&event.metadata?.dagmar_mail_readback).at(-1);
          const stopped=created&&events.find(event=>event.type==='output_audio_buffer.stopped'&&event.response_id===created.response_id);
          playback=stopped&&events.find(event=>event.type==='played_audio'&&event.response_id===created.response_id);
        }else playback=settledAnswer(events,speechStarted,pendingCalls,await page.evaluate(()=>performance.now()));
        if(result && playback && !resultPlayback(events,result))return false;
        return Boolean(playback);
      },step.timeout??90);
      const spoken=syntheticTranscripts.filter(event=>event.time>speechStarted);
      const tools=calls.filter(call=>call.time>speechStarted);
      const entry={name:step.name,status:'PASS',spoken,tools:tools.map(call=>({tool:call.tool,
        scope:call.value?.scope,unread_count:call.value?.data?.unread_count,total_count:call.value?.total_count,
        count_kind:call.value?.count_kind,coverage_complete:call.value?.coverage_complete,
        draft_id:call.value?.data?.draft_id,version:call.value?.data?.version,account:call.value?.data?.content?.account,
        errors:call.value?.errors?.map(error=>error.code)})),functions:functions.filter(call=>call.time>speechStarted)};
      steps.push(entry);
      if(step.mail!==false && spoken.some(event=>event.time<result.time)){
        entry.status='FAIL';violations.push({step:step.name,code:'pre_result_spoken_filler'});
      }
      if(step.mail===false && step.mail_task!==false && spoken.some(event=>spokenProgress(event.text))){
        entry.status='FAIL';violations.push({step:step.name,code:'cached_result_spoken_filler'});
      }
      if(step.expected_count!==undefined){
        if(step.mail!==false)assert.ok(tools.some(call=>call.value?.data?.unread_count===step.expected_count || call.value?.total_count===step.expected_count),'fixture_count_mismatch');
        assert.ok(spoken.some(event=>new RegExp(String(step.expected_count)).test(event.text.replace(/\s/g,''))),'spoken_count_mismatch');
      }
      if(step.expected_tool)assert.ok(tools.some(call=>call.tool===step.expected_tool),'expected_native_call_missing');
      if(step.expected_function)assert.ok(entry.functions.some(call=>call.name===step.expected_function),'expected_function_missing');
      if(step.expected_identity)assert.ok(calls.some(call=>call.value?.global_order_verified===true
        && Object.entries(step.expected_identity).every(([key,value])=>call.value?.items?.[0]?.identity?.[key]===value)), 'global_newest_fixture_mismatch');
      process.stdout.write(JSON.stringify({step:step.name,status:entry.status})+'\n');
      await new Promise(resolve=>setTimeout(resolve,700));
    }
    await Promise.all([...pending]);
    assert.equal(leaks.length,0,'credential_reached_browser');
    status=violations.length?'FAIL':'PASS';reason=violations.length?violations[0].code:'native_import_result_and_playback_only';
  }catch(error){reason=error instanceof assert.AssertionError?String(error.message).split('\n')[0]:'isolated_probe_failure';}
  finally{
    if(page){
      if(fixture.verify_played_audio)clips=await page.evaluate(()=>window.__mailProbe?.wavs()??[]).catch(()=>[]);
      await page.getByRole('button',{name:'Ukončit hovor',exact:true}).click().catch(()=>{});
      await page.request.post('http://127.0.0.1:8008/dagmar/test-finish',{headers:{'x-test-csrf':'dagmar-test-only'}}).catch(()=>{});
    }
    try{
      const provider=JSON.parse(await readFile(hostEvidence,'utf8'));
      if(provider.control_token_in_provider){status='FAIL';reason='control_token_in_provider_configuration';}
      providerCreditExhausted=provider.events.some(event=>event.status_details?.code==='credit_balance_exhausted');
      if(providerCreditExhausted){status='FAIL';reason='OpenAI_credit_balance_exhausted';}
    }catch{status='FAIL';reason='provider_evidence_missing';}
    const independentAudio=[];
    try{
    if(authorization && fixture.verify_played_audio && !providerCreditExhausted){
      // Provider and input-ASR accounting is finalized before this separate
      // paid observation, so their in-memory book cannot overwrite these rows.
      const accounting=(identity,usage,cost)=>{
        const script=`import json,sys\nsys.path.insert(0,${JSON.stringify(path.dirname(hostFile))})\nfrom costs import FinalRunCosts\nx=json.load(sys.stdin);b=FinalRunCosts(x['path'])\nif x['reserve']:b.reserve(x['id'],'.25','gpt-4o-mini-transcribe','audio-token-1.25-5')\nelse:\n b.record_usage(x['id'],x['usage']);b.reconcile(x['id'],x['cost'],complete=x['cost'] is not None)\n`;
        const result=spawnSync('python3.11',['-c',script],{input:JSON.stringify({path:ledger,id:identity,reserve:usage===undefined,usage,cost}),encoding:'utf8'});
        assert.equal(result.status,0,'played_audio_accounting_failed');
      };
      for(const clip of clips){
        const identity='played-audio-'+clip.response_id;
        accounting(identity);
        const form=new FormData();form.set('model','gpt-4o-mini-transcribe');form.set('language','cs');
        form.set('file',new File([Buffer.from(clip.wav,'base64')],'synthetic-playback.wav',{type:'audio/wav'}));
        const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+key},body:form,signal:AbortSignal.timeout(30000)});
        const value=await response.json(),usage=value.usage;
        const cost=usage?.type==='tokens' && Number.isInteger(usage.input_tokens) && Number.isInteger(usage.output_tokens)
          ? String((usage.input_tokens*1.25+usage.output_tokens*5)/1_000_000):null;
        accounting(identity,usage??{status:response.status},cost);
        if(secrets.some(secret=>JSON.stringify(value).includes(secret))){status='FAIL';reason='credential_in_played_audio';}
        independentAudio.push({response_id:clip.response_id,seconds:clip.seconds,status:response.status,
          text:secrets.reduce((value,secret)=>value.replaceAll(secret,'[redacted]'),value.text??''),
          pcm_sha256:createHash('sha256').update(Buffer.from(clip.wav,'base64')).digest('hex')});
      }
    }
    }catch(error){status='FAIL';reason='played_audio_verification_failed';independentAudio.push({error_category:error.name});}
    let fullReading={status:'NOT_RUN'};
    if(!providerCreditExhausted && fixture.full_read_expected && steps.some(step=>fixture.steps?.find(value=>value.name===step.name)?.full_read)){
      const expected=JSON.parse(await readFile(fixture.full_read_expected,'utf8'));
      const reading=steps.find(step=>fixture.steps.find(value=>value.name===step.name)?.full_read);
      const ids=new Set(reading.spoken.map(part=>part.response_id));
      const normalize=value=>value.normalize('NFKC').toLocaleLowerCase('cs').replace(/[^\p{L}\p{N}]/gu,'');
      const spoken=normalize(reading.spoken.map(part=>part.text).join(' '));
      const heard=normalize(independentAudio.filter(clip=>ids.has(clip.response_id)).map(clip=>clip.text).join(' '));
      const markers=expected.markers;
      const complete=spoken.includes(normalize(expected.text)) && markers.every(marker=>heard.includes(normalize(marker)));
      fullReading={status:complete?'PASS':'FAIL',expected_characters:expected.text.length,
        spoken_characters:spoken.length,played_markers:markers.map(marker=>({marker,heard:heard.includes(normalize(marker))})),
        response_count:ids.size};
      if(!complete){status='FAIL';reason='full_spoken_content_incomplete';}
    }
    await browser?.close().catch(()=>{});
    host.kill('SIGTERM');vite.kill('SIGTERM');
    await rm(buildDirectory,{recursive:true,force:true});
    await writeFile(evidence,JSON.stringify({status,reason,tested_sha:candidate,
      credential_leaks:leaks,backend_mail_status:backendMailStatus,events,bundle_sha256:bundleHashes,played_audio_observations:events.filter(event=>event.type==='played_audio').length,
      synthetic_audio_transcripts:syntheticTranscripts,
      steps,
      violations,
      independently_transcribed_played_audio:independentAudio,
      full_spoken_content_verification:fullReading,groups_A_H:'NOT_RUN',synthetic_SMTP_acceptance:'NOT_RUN',production_activation:'NOT_RUN'},null,2),{flag:'wx',mode:0o600});
  }
  process.stdout.write(JSON.stringify({status,reason,tested_sha:candidate})+'\n');
  if(status!=='PASS')process.exitCode=1;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{process.stdout.write(JSON.stringify({status:'FAIL',code:'runner_failed',category:error.name,locations:error.stack?.split('\n').slice(1).map(line=>line.match(/[\w.-]+\.m?js:\d+:\d+/)?.[0]).filter(Boolean),paid_calls:'UNCONFIRMED'})+'\n');process.exitCode=2;});
}
