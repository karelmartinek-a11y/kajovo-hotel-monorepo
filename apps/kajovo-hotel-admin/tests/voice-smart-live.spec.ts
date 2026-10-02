import {test, expect} from '@playwright/test';
import {getAdminCredentials} from '../test-admin-credentials';

test('opt-in real voice control, live read and camera input through backend sideband', async ({page}) => {
  // @ts-expect-error Playwright provides the Node environment.
  test.skip(process.env.VOICE_CORE_LIVE_SMOKE !== '1', 'Paid calls require explicit opt-in');
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    // No transcripts, images, raw arguments or outputs are retained in test artifacts.
    const evidence = {streams, channel: null as RTCDataChannel | null, speech: 0, audio: 0, images: 0, controls: 0, reads: 0, camera: 0, confirmed: 0, errors: 0, lastOutput: 0};
    Object.assign(window, {voiceSmartEvidence: evidence});
    const media = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {const stream = await media(constraints); streams.push(stream); return stream;};
    const create = RTCPeerConnection.prototype.createDataChannel;
    const seen = new Set<string>();
    RTCPeerConnection.prototype.createDataChannel = function (...args) {
      const channel = create.apply(this, args); evidence.channel = channel;
      channel.addEventListener('message', message => {
        try {
          const event = JSON.parse(message.data);
          if (event.type === 'input_audio_buffer.speech_started') evidence.speech++;
          if (event.type === 'output_audio_buffer.started') evidence.audio++;
          if (!['conversation.item.created', 'conversation.item.done', 'response.output_item.done'].includes(event.type) || !event.item?.id || seen.has(event.item.id)) return;
          if (event.item.type === 'function_call' && event.type !== 'response.output_item.done') return;
          seen.add(event.item.id);
          if (event.item.content?.some((part: {type: string}) => part.type === 'input_image')) evidence.images++;
          if (event.item.type === 'function_call' && event.item.name === 'smart_technologie') {
            const operation = JSON.parse(event.item.arguments).operation;
            if (operation === 'control') evidence.controls++;
            if (operation === 'read') evidence.reads++;
            if (operation === 'camera_view') evidence.camera++;
          }
          if (event.item.type === 'function_call_output') {
            const value = JSON.parse(event.item.output);
            evidence.lastOutput++;
            if (value.error) evidence.errors++;
            if (value.results?.some((row: {status: string}) => ['completed', 'executed', 'accepted', 'success', 'observed', 'image_fetched', 'ok'].includes(row.status))) evidence.confirmed++;
          }
        } catch { /* Never report raw provider events. */ }
      });
      return channel;
    };
  });
  await page.goto('/admin/login');
  const credentials = getAdminCredentials();
  await page.getByLabel(/e-mail administrátora/i).fill(credentials.email);
  await page.getByLabel(/heslo administrátora/i).fill(credentials.password);
  await page.getByRole('button', {name: /přihlásit/i}).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto('/admin/hlasovy-chat');
  await expect(page.getByText('Klíč je uložen.')).toBeVisible();
  await page.getByRole('button', {name: 'Zahájit hovor'}).click();
  const metric = (name: string) => page.evaluate(key => (window as any).voiceSmartEvidence[key] as number, name);
  const ask = async (text: string) => {
    await page.evaluate(text => {
      const channel = (window as any).voiceSmartEvidence.channel as RTCDataChannel;
      channel.send(JSON.stringify({type: 'conversation.item.create', item: {type: 'message', role: 'user', content: [{type: 'input_text', text}]}}));
      channel.send(JSON.stringify({type: 'response.create'}));
    }, text);
  };
  try {
    await expect(page.getByTestId('voice-capability-status')).toHaveText('Smart technologie jsou připravené.', {timeout: 45000});
    await page.evaluate(() => {
      const channel = (window as any).voiceSmartEvidence.channel as RTCDataChannel;
      channel.send(JSON.stringify({type: 'conversation.item.create', item: {type: 'message', role: 'user', content: [{type: 'input_text', text: 'Následující hlasový povel se týká výhradně zařízení s přesným katalogovým názvem 0P0BSvetlo. Jeho vyslovený název je nula pé nula bé světlo. Žádné jiné zařízení neovládej a neměň jas ani barvu.'}]}}));
    });
    await expect.poll(() => metric('speech'), {timeout: 60000}).toBeGreaterThan(0);
    await expect.poll(() => metric('controls'), {timeout: 90000}).toBeGreaterThan(0);
    await expect.poll(() => metric('lastOutput'), {timeout: 60000}).toBeGreaterThan(0);
    await expect.poll(() => metric('audio'), {timeout: 60000}).toBeGreaterThan(0);
    await expect(page.getByTestId('voice-state')).toHaveText('Poslouchám', {timeout: 60000});
    await page.waitForTimeout(60000);
    await ask('Přečti aktuální stav zařízení s přesným názvem 0P0BSvetlo. Nic dalšího neovládej.');
    await expect.poll(() => metric('reads'), {timeout: 90000}).toBeGreaterThan(0);
    await expect(page.getByTestId('voice-state')).toHaveText('Poslouchám', {timeout: 60000});
    await page.waitForTimeout(60000);
    const audioBeforeCamera = await metric('audio');
    await ask('Vyber první kameru ze schváleného katalogu, která podporuje získání snímku, použij camera_view a popiš její skutečný obraz. Nenahrávej video a nic neovládej.');
    await expect.poll(() => metric('camera'), {timeout: 90000}).toBeGreaterThan(0);
    await expect.poll(() => metric('images'), {timeout: 60000}).toBeGreaterThan(0);
    await expect.poll(() => metric('confirmed'), {timeout: 60000}).toBeGreaterThan(0);
    await expect.poll(() => metric('audio'), {timeout: 120000}).toBeGreaterThan(audioBeforeCamera);
    await expect(page.getByTestId('voice-state')).toHaveText('Poslouchám', {timeout: 120000});
    expect(await metric('errors')).toBe(0);
  } finally {
    console.log('Smart voice event counts:', await page.evaluate(() => {
      const {speech, audio, images, controls, reads, camera, confirmed, errors, lastOutput} = (window as any).voiceSmartEvidence;
      return {speech, audio, images, controls, reads, camera, confirmed, errors, lastOutput};
    }));
    const end = page.getByRole('button', {name: 'Ukončit hovor'});
    if (await end.isVisible()) await end.click();
  }
  expect(await page.evaluate(() => (window as any).voiceSmartEvidence.streams.every((stream: MediaStream) => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true);
});
