import {readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';

test('native WebRTC voice command uses only isolated public-contract MCP',async({page})=>{
  test.skip((process.env.DAGMAR_NATIVE_BOUNDED==='1'&&process.env.DAGMAR_NATIVE_COMPACT_CONTROL!=='1')||process.env.VOICE_CORE_LIVE_SMOKE!=='1'||!!process.env.CI||!!process.env.GITHUB_ACTIONS,'Explicit paid opt-in required');
  await page.goto('/');
  await page.evaluate(async()=>{
    const ctx=new AudioContext(),destination=ctx.createMediaStreamDestination();
    const clock=ctx.createOscillator(),silence=ctx.createGain();silence.gain.value=0;clock.connect(silence);silence.connect(destination);clock.start();
    const peer=new RTCPeerConnection(),audio=new Audio();audio.autoplay=true;
    destination.stream.getTracks().forEach(track=>peer.addTrack(track,destination.stream));
    peer.ontrack=event=>{audio.srcObject=event.streams[0];void audio.play();};
    const channel=peer.createDataChannel('events');
    const offer=await peer.createOffer();await peer.setLocalDescription(offer);
    const answer=await fetch('/offer',{method:'POST',body:offer.sdp}).then(r=>r.json());
    await peer.setRemoteDescription({type:'answer',sdp:answer.sdp});await ctx.resume();
    Object.assign(window,{nativeTest:{ctx,destination,peer,audio,channel}});
  });
  const status=()=>page.evaluate(()=>fetch('/status').then(r=>r.json()));
  try {
    await expect.poll(async()=>(await status()).ready,{timeout:30000}).toBe(true);
    if(process.env.DAGMAR_NATIVE_COMPACT_CONTROL!=='1') await page.evaluate(()=>fetch('/ready',{method:'POST'}));
    await expect.poll(async()=>(await status()).technologies,{timeout:20000}).toBe('ready');
    if(process.env.DAGMAR_NATIVE_COMPACT_CONTROL!=='1') await expect.poll(async()=>(await status()).events.filter((e:any)=>e.type==='output_audio_buffer.stopped').length,{timeout:15000}).toBeGreaterThan(0);
    const wav=readFileSync(process.env.DAGMAR_NATIVE_AUDIO!).toString('base64');
    await page.evaluate(async data=>{
      const {ctx,destination}=(window as any).nativeTest;
      const source=ctx.createBufferSource();source.buffer=await ctx.decodeAudioData(Uint8Array.from(atob(data),c=>c.charCodeAt(0)).buffer);
      if(source.buffer.duration>20)throw new Error('fixture duration exceeds paid bound');
      source.connect(destination);await new Promise<void>(resolve=>{source.onended=()=>{source.disconnect();resolve();};source.start();});
    },wav);
    await expect.poll(async()=>(await status()).fake_mcp_calls.filter((e:any)=>e.operation==='control').length,{timeout:45000}).toBe(1);
    const sent=await status();
    expect(sent.fake_mcp_calls.some((e:any)=>e.operation==='read')).toBe(false);
    await expect.poll(async()=>(await status()).events.filter((e:any)=>e.type==='output_audio_buffer.stopped').length,{timeout:10000}).toBeGreaterThan(process.env.DAGMAR_NATIVE_COMPACT_CONTROL==='1'?0:1);
    if(process.env.DAGMAR_NATIVE_TWO_RESPONSES==='1') await expect.poll(async()=>(await status()).events.some((e:any)=>e.type==='response.done'&&e.concise_success),{timeout:3000}).toBe(true);
    await page.waitForTimeout(2000);
    expect((await status()).fake_mcp_calls.filter((e:any)=>e.operation==='control')).toHaveLength(1);
  } finally {
    await page.evaluate(async()=>{await fetch('/end',{method:'POST'});const {peer,ctx}=(window as any).nativeTest;peer.close();await ctx.close();});
  }
});


test('bounded native voice playback accepts genuine synthetic barge-in',async({page})=>{
  test.skip(process.env.DAGMAR_NATIVE_COMPACT_CONTROL==='1'||process.env.DAGMAR_NATIVE_BOUNDED!=='1'||process.env.VOICE_CORE_LIVE_SMOKE!=='1'||!!process.env.CI||!!process.env.GITHUB_ACTIONS,'Separate bounded paid opt-in required');
  await page.goto('/');
  await page.evaluate(async()=>{
    const ctx=new AudioContext(),destination=ctx.createMediaStreamDestination(),peer=new RTCPeerConnection(),audio=new Audio();
    const clock=ctx.createOscillator(),silence=ctx.createGain();silence.gain.value=0;clock.connect(silence);silence.connect(destination);clock.start();
    destination.stream.getTracks().forEach(track=>peer.addTrack(track,destination.stream));audio.autoplay=true;peer.ontrack=e=>{audio.srcObject=e.streams[0];void audio.play();};
    const channel=peer.createDataChannel('events');
    const offer=await peer.createOffer();await peer.setLocalDescription(offer);
    const answer=await fetch('/offer',{method:'POST',body:offer.sdp}).then(r=>r.json());
    await peer.setRemoteDescription({type:'answer',sdp:answer.sdp});await ctx.resume();
    Object.assign(window,{nativeTest:{ctx,destination,peer,audio,channel}});
  });
  const status=()=>page.evaluate(()=>fetch('/status').then(r=>r.json()));
  const speak=async(path:string)=>page.evaluate(async data=>{
    const {ctx,destination}=(window as any).nativeTest,source=ctx.createBufferSource();
    source.buffer=await ctx.decodeAudioData(Uint8Array.from(atob(data),c=>c.charCodeAt(0)).buffer);
    if(source.buffer.duration>4)throw new Error('bounded fixture too long');source.connect(destination);
    await new Promise<void>(resolve=>{source.onended=()=>{source.disconnect();resolve();};source.start();});
  },readFileSync(path).toString('base64'));
  try{
    await expect.poll(async()=>(await status()).ready,{timeout:8000}).toBe(true);
    await speak(process.env.DAGMAR_NATIVE_QUESTION!);
    await expect.poll(async()=>(await status()).events.some((e:any)=>e.type==='output_audio_buffer.started'),{timeout:5000}).toBe(true);
    await speak(process.env.DAGMAR_NATIVE_INTERRUPT!);
    await expect.poll(async()=>(await status()).events.some((e:any)=>e.type==='response.done'&&e.status==='cancelled'),{timeout:4000}).toBe(true);
    expect((await status()).fake_mcp_calls.filter((e:any)=>e.operation==='control')).toHaveLength(0);
  }finally{
    await page.evaluate(async()=>{await fetch('/end',{method:'POST'});const {peer,ctx}=(window as any).nativeTest;peer.close();await ctx.close();});
  }
});
