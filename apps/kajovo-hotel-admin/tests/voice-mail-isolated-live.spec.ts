import {readFileSync} from 'node:fs';
import {test, expect} from '@playwright/test';

test('real provider mail prepare, next audio consent and explicit bypass use isolated SMTP stub', async ({page}) => {
  test.skip(process.env.VOICE_CORE_LIVE_SMOKE !== '1' || process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true', 'Paid calls require explicit opt-in outside CI');
  await page.goto('/docs');
  const connect = () => page.evaluate(async () => {
    const ctx = new AudioContext(), output = ctx.createMediaStreamDestination();
    const clock = ctx.createOscillator(), silence = ctx.createGain();
    silence.gain.value = 0; clock.connect(silence); silence.connect(output); clock.start();
    const peer = new RTCPeerConnection();
    output.stream.getTracks().forEach(track => peer.addTrack(track, output.stream));
    const audio = new Audio(); audio.autoplay = true;
    peer.ontrack = event => {audio.srcObject = event.streams[0]; void audio.play();};
    peer.createDataChannel('events');
    const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
    const result = await fetch('/offer', {method: 'POST', body: offer.sdp}).then(r => r.json());
    await peer.setRemoteDescription({type: 'answer', sdp: result.sdp}); await ctx.resume();
    Object.assign(window, {isolatedAudio: {ctx, output, peer}});
  });
  await connect();
  const status = () => page.evaluate(() => fetch('/status').then(r => r.json()));
  const speak = async (name: string) => {
    const audio = readFileSync(process.env[name]!).toString('base64');
    await page.evaluate(async data => {
      const {ctx, output} = (window as any).isolatedAudio;
      const source = ctx.createBufferSource();
      source.buffer = await ctx.decodeAudioData(Uint8Array.from(atob(data), c => c.charCodeAt(0)).buffer);
      source.connect(output); await ctx.resume();
      await new Promise<void>(resolve => {source.onended = () => {source.disconnect(); resolve();}; source.start();});
    }, audio);
  };
  try {
    await expect.poll(async () => (await status()).ready, {timeout: 45000}).toBe(true);
    await page.evaluate(() => fetch('/seed', {method: 'POST'}));
    await speak('VOICE_MAIL_SEND_AUDIO');
    await expect.poll(async () => (await status()).state, {timeout: 90000}).toBe('awaiting_confirmation');
    expect((await status()).smtp_calls).toBe(0);
    await speak('VOICE_MAIL_YES_AUDIO');
    await expect.poll(async () => (await status()).smtp_calls, {timeout: 60000}).toBe(1);
    await expect.poll(async () => (await status()).state, {timeout: 30000}).toBe('applied');
    expect((await status()).html_matches_text).toBe(true);
    await page.evaluate(async () => {
      await fetch('/end', {method: 'POST'});
      const {peer, ctx} = (window as any).isolatedAudio; peer.close(); await ctx.close();
    });
    await connect();
    await expect.poll(async () => (await status()).ready, {timeout: 45000}).toBe(true);
    await page.evaluate(() => fetch('/seed', {method: 'POST'}));
    await speak('VOICE_MAIL_BYPASS_AUDIO');
    await expect.poll(async () => (await status()).smtp_calls, {timeout: 60000}).toBe(2);
    const result = await status();
    expect(result.network_delivery_possible).toBe(false);
    expect(result.html_matches_text).toBe(true);
    expect(result.events.some((e: any) => e.type === 'response.done' && e.matches_readback && e.completed)).toBe(true);
    expect(result.events.some((e: any) => e.type === 'output_audio_buffer.stopped' && e.matches_readback)).toBe(true);
    console.log('ISOLATED MAIL provider evidence:', JSON.stringify(result));
  } finally {
    await page.evaluate(() => fetch('/end', {method: 'POST'}));
  }
});
