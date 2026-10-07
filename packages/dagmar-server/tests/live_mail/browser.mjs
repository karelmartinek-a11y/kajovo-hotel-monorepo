// Isolated test instrumentation only. Never imported into a production bundle.
import {createRequire} from 'node:module';
import {readFile, writeFile, lstat} from 'node:fs/promises';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

export function successfulResult(item) {
  if(item.error || !item.output)return false;
  try{
    let output=typeof item.output==='string'?JSON.parse(item.output):item.output;
    if(output.structuredContent)output=output.structuredContent;
    else if(output.content || Array.isArray(output))
      output=JSON.parse((output.content??output).filter(part=>part.type==='text').map(part=>part.text??'').join(''));
    return Boolean(output && !Array.isArray(output) && typeof output==='object'
      && Array.isArray(output.errors) && output.errors.length===0 && output.isError!==true);
  }catch{return false;}
}

export function observeBrowser() {
  const probe = window.__mailProbe = {input:null, audios:[], started:performance.now()};
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
          if (energy>0.00001 && probe.audios.some(audio=>!audio.paused && audio.currentTime>0))
            void emit('played_audio', JSON.stringify({rms:Math.sqrt(energy),samples:samples.length}));
        };
      });
    }
    createDataChannel(...args) {
      const channel=super.createDataChannel(...args);
      // Registered before the product handler; no filtering or redaction.
      channel.addEventListener('message',event=>void emit('data_channel',event.data));
      channel.addEventListener('open',()=>void emit('channel_open',''));
      return channel;
    }
  };
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(...args){
    probe.audios.push(this);
    return play.apply(this,args);
  };
  // A synthetic PCM source is captured as a genuine MediaStream/RTP audio track.
  // No transcript, user text, tool result or provider event is injected.
  navigator.mediaDevices.getUserMedia=async()=>{
    const context=new AudioContext(), destination=context.createMediaStreamDestination();
    const silence=context.createConstantSource(), gain=context.createGain(); gain.gain.value=0;
    silence.connect(gain).connect(destination); silence.start();
    probe.input=async()=>{
      await context.resume();
      const response=await fetch('/dagmar/test-input.wav');
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
  const vite=spawn('pnpm',['exec','vite','--host','127.0.0.1','--port','5173','--strictPort'],{
    cwd:path.join(root,'examples/dagmar-host'),stdio:'ignore'});
  let browser, page, sessionId, backendMailStatus;
  const leaks=[],events=[],bundleHashes={};
  const scan=(surface,raw,time)=>{
    if(secrets.some(secret=>raw.includes(secret)))leaks.push({surface,time});
    if(surface==='data_channel'){
      const event=JSON.parse(raw); // Raw envelopes stay in RAM only.
      const item=event.item??{};
      const saved={type:event.type,time,item_type:item.type,response_id:event.response_id??event.response?.id,
        tool:item.type==='mcp_call'?item.name:undefined};
      if(item.type==='mcp_list_tools') saved.tool_count=item.tools?.length;
      if(item.type==='mcp_call' && event.type.endsWith('.done'))saved.result_success=successfulResult(item);
      events.push(saved);
    }else if(surface==='played_audio'||surface==='channel_open')events.push({type:surface,time});
  };
  const wait=async(predicate,seconds=60)=>{
    const deadline=Date.now()+seconds*1000;
    while(!await predicate()){
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
    assert.ok(events.some(event=>event.item_type==='mcp_list_tools'&&event.tool_count===23),'native_23_tool_import_required');
    await wait(()=>events.some(event=>event.type==='output_audio_buffer.stopped'));
    const speechStarted=await page.evaluate(()=>{void window.__mailProbe.input();return performance.now();});
    await wait(()=>events.some(event=>event.time>speechStarted&&event.item_type==='mcp_call'&&event.result_success));
    const result=events.find(event=>event.time>speechStarted&&event.item_type==='mcp_call'&&event.result_success);
    await wait(()=>events.some(event=>event.time>result.time&&event.type==='played_audio'));
    await Promise.all([...pending]);
    assert.equal(leaks.length,0,'credential_reached_browser');
    status='PASS';reason='native_import_result_and_playback_only';
  }catch(error){reason=error instanceof assert.AssertionError?String(error.message).split('\n')[0]:'isolated_probe_failure';}
  finally{
    if(page){
      await page.getByRole('button',{name:'Ukončit hovor',exact:true}).click().catch(()=>{});
      await page.request.post('http://127.0.0.1:8008/dagmar/test-finish',{headers:{'x-test-csrf':'dagmar-test-only'}}).catch(()=>{});
    }
    try{
      const provider=JSON.parse(await readFile(hostEvidence,'utf8'));
      if(provider.control_token_in_provider){status='FAIL';reason='control_token_in_provider_configuration';}
    }catch{status='FAIL';reason='provider_evidence_missing';}
    await browser?.close();
    host.kill('SIGTERM');vite.kill('SIGTERM');
    await writeFile(evidence,JSON.stringify({status,reason,tested_sha:candidate,
      credential_leaks:leaks,backend_mail_status:backendMailStatus,events,bundle_sha256:bundleHashes,played_audio_observations:events.filter(event=>event.type==='played_audio').length,
      full_spoken_content_verification:'NOT_RUN',groups_A_H:'NOT_RUN',synthetic_SMTP_acceptance:'NOT_RUN',production_activation:'NOT_RUN'},null,2),{flag:'wx',mode:0o600});
  }
  process.stdout.write(JSON.stringify({status,reason,tested_sha:candidate})+'\n');
  if(status!=='PASS')process.exitCode=1;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(()=>{process.stdout.write('{"status":"BLOCKED","code":"runner_failed","paid_calls":"UNCONFIRMED"}\n');process.exitCode=2;});
}
