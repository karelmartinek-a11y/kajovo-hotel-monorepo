#!/usr/bin/env node
// Production gate: real admin session, WebRTC and native MCP import. No raw event logs.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {hasExposedAuthorization} from './mcp_authorization_guard.mjs';
import {SpokenCompletion} from './mcp_spoken_completion.mjs';
const require = createRequire(new URL('../apps/kajovo-hotel-admin/package.json', import.meta.url));
const {chromium} = require('playwright');
const origin = process.env.VERIFY_BASE_URL || 'https://hotel.hcasc.cz';
assert(process.env.VERIFY_ADMIN_EMAIL && process.env.VERIFY_ADMIN_PASSWORD, 'admin_credentials_required');
const browser = await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const context = await browser.newContext({permissions:['microphone'], viewport:{width:1440,height:900}});
try {
  const login = await context.request.post(`${origin}/api/auth/admin/login`, {data:{email:process.env.VERIFY_ADMIN_EMAIL,password:process.env.VERIFY_ADMIN_PASSWORD}});
  assert.equal(login.status(),200,'admin_login_failed');
  const config = await context.request.get(`${origin}/api/v1/admin/voice-core/config`);
  assert.equal(config.status(),200,'voice_config_failed');
  if (!(await config.json()).configured) {
    console.log(JSON.stringify({admin_login:'PASS',voice_config:'PASS',realtime:'NOT_CONFIGURED'}));
  } else {
    const wav = process.env.VERIFY_VOICE_WAV ? (await readFile(process.env.VERIFY_VOICE_WAV)).toString('base64') : null;
    await context.addInitScript({content: `window.__voiceAuthorizationGuard = ${hasExposedAuthorization.toString()};`});
    await context.addInitScript({content: `window.__voiceSpokenCompletion = new (${SpokenCompletion.toString()})();`});
    await context.addInitScript(({wav}) => {
      window.__mcpEvidence={imported:[],importCompleted:false,credentialsExposed:false,configValid:false,call:null,devices:[],spoken:'',audioPeak:0,error:null};
      const evidence=window.__mcpEvidence;
      let audioContext, microphone, destination;
      navigator.mediaDevices.getUserMedia=async () => {
        audioContext=new AudioContext();destination=audioContext.createMediaStreamDestination();
        const silence=audioContext.createConstantSource();const gain=audioContext.createGain();gain.gain.value=0;
        silence.connect(gain).connect(destination);silence.start();await audioContext.resume();return destination.stream;
      };
      const original=RTCPeerConnection.prototype.createDataChannel;
      RTCPeerConnection.prototype.createDataChannel=function (...args) {
        const channel=original.apply(this,args);
        channel.addEventListener('message',async message => {
          const e=JSON.parse(message.data);
          window.__voiceSpokenCompletion.handle(e);
          if(window.__voiceAuthorizationGuard(e)) evidence.credentialsExposed=true;
          if(e.type==='error') evidence.error=e.error?.code||'realtime_error';
          if(e.type==='session.created'||e.type==='session.updated') {
            const tools=e.session?.tools||[];const m=tools.find(t=>t.type==='mcp');
            if(m) evidence.configValid=m.server_url==='https://hotel.hcasc.cz/mcp/home-assistant' && m.server_label==='home_assistant' && !('connector_id' in m);
          }
          if(e.type==='mcp_list_tools.completed') evidence.importCompleted=true;
          if(e.type==='conversation.item.done' && e.item?.type==='mcp_list_tools') {
            evidence.imported=(e.item.tools||[]).map(t=>t.name);
            if(wav && !microphone && !e.item.error) {
              microphone=audioContext.createBufferSource();microphone.buffer=await audioContext.decodeAudioData(Uint8Array.from(atob(wav),c=>c.charCodeAt(0)).buffer);microphone.connect(destination);microphone.start();
            }
          }
          if(e.type==='response.output_item.done' && e.item?.type==='mcp_call') {
            if(e.item.name==='execute_device_action') evidence.error='unexpected_write';
            if(e.item.name==='search_devices') {
              const args=JSON.parse(e.item.arguments||'{}');evidence.call={name:e.item.name,nameFilter:args.name,success:!e.item.error};
              try {let output=JSON.parse(e.item.output);if(Array.isArray(output)) output=JSON.parse(output.find(c=>c.type==='text').text);if(output?.content) output=JSON.parse(output.content.find(c=>c.type==='text').text);if(output?.structuredContent)output=output.structuredContent;
                if(output.status==='ok') evidence.devices=output.devices.map(d=>({name:d.name,type:d.device_type,availability:d.availability}));
              } catch {evidence.error='tool_output_parse_failed';}
            }
          }
          if(e.type==='response.output_audio_transcript.done') evidence.spoken+=e.transcript||'';
        });return channel;
      };
      const originalTrack=RTCPeerConnection.prototype.setRemoteDescription;
      RTCPeerConnection.prototype.setRemoteDescription=function (...args) {
        this.addEventListener('track',event => {
          const meter=audioContext.createAnalyser();audioContext.createMediaStreamSource(event.streams[0]||new MediaStream([event.track])).connect(meter);
          const tick=()=>{const data=new Uint8Array(meter.fftSize);meter.getByteTimeDomainData(data);const peak=Math.max(...data.map(x=>Math.abs(x-128)));evidence.audioPeak=Math.max(evidence.audioPeak,peak);window.__voiceSpokenCompletion.sample(peak);requestAnimationFrame(tick);};tick();
        });return originalTrack.apply(this,args);
      };
    },{wav});
    const page=await context.newPage();
    page.on('response',async response => {
      if(new URL(response.url()).pathname==='/api/v1/admin/voice-core/sessions' && response.status()>=400) {
        await page.evaluate(status=>{window.__mcpEvidence.error=`hotel_session_http_${status}`;},response.status()).catch(()=>{});
      }
    });
    await page.goto(`${origin}/admin/hlasovy-chat`);
    await page.getByTestId('voice-console').waitFor();
    await page.getByRole('button',{name:'Zahájit hovor',exact:true}).click();
    await page.waitForFunction(()=>window.__mcpEvidence.imported.length===3||window.__mcpEvidence.error,{},{timeout:90000});
    let evidence=await page.evaluate(()=>window.__mcpEvidence);
    assert.equal(evidence.error,null,'realtime_import_failed');
    assert.equal(evidence.credentialsExposed,false,'private_authorization_exposed');
    assert.equal(evidence.configValid,true,'native_mcp_session_configuration_missing');
    assert.equal(evidence.importCompleted,true,'mcp_import_completion_missing');
    assert.deepEqual(evidence.imported.sort(),['execute_device_action','get_device_state','search_devices']);
    if(wav) {
      await page.waitForFunction(()=>window.__mcpEvidence.error||window.__voiceSpokenCompletion.ready(window.__mcpEvidence.devices),{},{timeout:120000});
      evidence=await page.evaluate(()=>window.__mcpEvidence);
      assert.equal(evidence.error,null,'realtime_read_failed');assert.equal(evidence.call?.nameFilter,'recepce','incorrect_name_filter');assert(evidence.call.success && evidence.devices.length>0,'live_search_failed');
      const norm=s=>s.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9]/g,'');
      assert(evidence.devices.every(d=>norm(evidence.spoken).includes(norm(d.name))),'spoken_answer_missing_devices');assert(evidence.audioPeak>1,'audio_playback_missing');
      assert(await page.evaluate(()=>window.__voiceSpokenCompletion.ready(window.__mcpEvidence.devices)),'grounded_response_and_playback_completion_missing');
    }
    await page.getByRole('button',{name:'Ukončit hovor',exact:true}).click();
    console.log(JSON.stringify({admin_login:'PASS',voice_route:'PASS',realtime:'PASS',native_mcp_config:'PASS',mcp_import:'PASS',private_auth:'PASS',tools:evidence.imported,...(wav?{name_filter:'PASS',live_search:'PASS',spoken_grounded_answer:'PASS',spoken_completion:'PASS',result_count:evidence.devices.length}:{})}));
  }
} finally {await context.close();await browser.close();}
