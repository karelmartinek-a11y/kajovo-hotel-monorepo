import {readFileSync} from 'node:fs';
import {expect, test} from '@playwright/test';
import {getAdminCredentials} from '../test-admin-credentials';

test('silent startup and residual speaker echo do not create or interrupt assistant turns', async ({page}, info) => {
  test.skip(process.env.VOICE_CORE_LIVE_SMOKE !== '1' || process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true', 'Explicit paid acceptance only');
  await page.addInitScript(() => {
    const ctx = new AudioContext(), output = ctx.createMediaStreamDestination();
    const clock = ctx.createOscillator(), silence = ctx.createGain();
    silence.gain.value = 0; clock.connect(silence); silence.connect(output); clock.start();
    navigator.mediaDevices.getUserMedia = async () => {await ctx.resume(); return output.stream;};
    const evidence = {speech: 0, echoSpeech: 0, responses: 0, audio: 0, drained: 0, cleared: 0, cancelled: 0, failures: 0, errors: 0, writes: 0, startedWithId: 0, stoppedWithId: 0, matchingStops: 0};
    const echo = ctx.createGain(), delay = ctx.createDelay(); echo.gain.value = 0; delay.delayTime.value = 0.15;
    echo.connect(delay); delay.connect(output);
    Object.assign(window, {speakerAudio: {ctx, output, echo}, speakerEvidence: evidence});
    const playing = new Set<string>();
    const create = RTCPeerConnection.prototype.createDataChannel;
    RTCPeerConnection.prototype.createDataChannel = function (...args) {
      // Simulate residual loudspeaker pickup after AEC, without any real room recording.
      this.addEventListener('track', e => ctx.createMediaStreamSource(e.streams[0] ?? new MediaStream([e.track])).connect(echo));
      const channel = create.apply(this, args);
      channel.addEventListener('message', message => {
        try {
          const e = JSON.parse(message.data);
          if (e.type === 'input_audio_buffer.speech_started') {evidence.speech++; if (playing.size) evidence.echoSpeech++;}
          if (e.type === 'response.created') evidence.responses++;
          if (e.type === 'output_audio_buffer.started') {evidence.audio++; if (e.response_id) evidence.startedWithId++; playing.add(e.response_id);}
          if (e.type === 'output_audio_buffer.stopped') {evidence.drained++; if (e.response_id) evidence.stoppedWithId++; if (playing.has(e.response_id)) evidence.matchingStops++; playing.clear();}
          if (e.type === 'output_audio_buffer.cleared') {evidence.cleared++; playing.clear();}
          if (e.type === 'response.done' && e.response?.status === 'cancelled') evidence.cancelled++;
          if (e.type === 'response.done' && e.response?.status === 'failed') evidence.failures++;
          if (e.type === 'error') evidence.errors++;
          if (e.type === 'response.output_item.done' && e.item?.type === 'function_call' && /^(mail_send_|mail_draft_(create|update|move)|mail_message_(mark|move|trash))/.test(e.item.name)) evidence.writes++;
        } catch { /* No content or raw events retained. */ }
      });
      return channel;
    };
  });
  const credentials = getAdminCredentials();
  await page.goto('/admin/login');
  await page.getByLabel(/e-mail administrátora/i).fill(credentials.email);
  await page.getByLabel(/heslo administrátora/i).fill(credentials.password);
  await page.getByRole('button', {name: /přihlásit/i}).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto('/admin/hlasovy-chat');
  await page.getByRole('button', {name: 'Zahájit hovor'}).click();
  const metric = (key: string) => page.evaluate(key => (window as any).speakerEvidence[key] as number, key);
  const speak = async () => {
    await expect(page.getByTestId('voice-state')).toHaveText('Poslouchám', {timeout: 45000});
    const data = readFileSync(process.env.VOICE_CORE_AUDIO_FIXTURE!).toString('base64');
    await page.evaluate(async data => {
      const {ctx, output} = (window as any).speakerAudio;
      const raw = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      const source = ctx.createBufferSource(); source.buffer = await ctx.decodeAudioData(raw.buffer); source.connect(output);
      await ctx.resume();
      await new Promise<void>(resolve => {source.onended = () => {source.disconnect(); resolve();}; source.start();});
    }, data);
  };
  try {
    await expect(page.getByRole('region', {name: 'E-mail v hlasovém chatu'})).toContainText('omezení', {timeout: 45000});
    await page.waitForTimeout(12000);
    console.log('Silent startup counters:', await page.evaluate(() => (window as any).speakerEvidence));
    expect(await metric('speech')).toBe(0); expect(await metric('responses')).toBe(0); expect(await metric('audio')).toBe(0);
    await page.evaluate(() => {(window as any).speakerAudio.echo.gain.value = 0.22;});
    await speak();
    await expect.poll(() => metric('audio'), {timeout: 45000}).toBeGreaterThan(0);
    await expect.poll(() => metric('drained'), {timeout: 45000}).toBeGreaterThan(0);
    expect(await metric('echoSpeech')).toBe(0); expect(await metric('cleared')).toBe(0); expect(await metric('cancelled')).toBe(0);
    console.log('Protected echo counters:', await page.evaluate(() => (window as any).speakerEvidence));
    await page.evaluate(() => {(window as any).speakerAudio.echo.gain.value = 0;});
    await page.waitForTimeout(2000);
    const microphone = await page.evaluate(() => {
      const {ctx, output} = (window as any).speakerAudio;
      return {enabled: output.stream.getAudioTracks()[0].enabled, readyState: output.stream.getAudioTracks()[0].readyState, contextState: ctx.state};
    });
    console.log('Microphone before next turn:', microphone);
    expect(microphone).toEqual({enabled: true, readyState: 'live', contextState: 'running'});
    const before = await metric('audio');
    await speak();
    await expect.poll(() => metric('audio'), {timeout: 45000}).toBeGreaterThan(before);
    await expect.poll(() => metric('drained'), {timeout: 45000}).toBeGreaterThan(1);
    await speak();
    await expect.poll(() => metric('audio'), {timeout: 45000}).toBeGreaterThan(before + 1);
    await page.getByRole('button', {name: 'Přerušit odpověď', exact: true}).click();
    await expect.poll(() => metric('cleared'), {timeout: 15000}).toBe(1);
    await expect(page.getByTestId('voice-state')).toHaveText('Poslouchám');
    await page.waitForTimeout(1000);
    expect(await metric('echoSpeech')).toBe(0);
    for (const [name, width, height] of [['desktop', 1440, 900], ['tablet', 834, 1112], ['phone', 390, 844]] as const) {
      await page.setViewportSize({width, height});
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.vc-conversation').screenshot({path: info.outputPath(`speaker-${name}.png`)});
    }
    await page.getByLabel('Používám reproduktory').uncheck();
    await expect(page.getByRole('button', {name: 'Přerušit odpověď', exact: true})).toHaveCount(0);
    expect(await metric('writes')).toBe(0); expect(await metric('errors')).toBe(0); expect(await metric('failures')).toBe(0);
  } finally {
    console.log('Speaker test counters:', await page.evaluate(() => (window as any).speakerEvidence));
    const end = page.getByRole('button', {name: 'Ukončit hovor'});
    if (await end.isVisible()) await end.click();
  }
});
