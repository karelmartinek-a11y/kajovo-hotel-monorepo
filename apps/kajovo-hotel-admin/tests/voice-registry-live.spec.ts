import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {expect, test} from '@playwright/test';
import {getAdminCredentials} from '../test-admin-credentials';

test('real audio registry dialogue changes only unique temporary rooms', async ({page}) => {
  test.skip(process.env.VOICE_CORE_LIVE_SMOKE !== '1', 'Explicit paid acceptance only');
  const directory = process.env.VOICE_REGISTRY_AUDIO_DIR!;
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  await page.addInitScript(() => {
    const ctx = new AudioContext();
    const output = ctx.createMediaStreamDestination();
    navigator.mediaDevices.getUserMedia = async () => {await ctx.resume(); return output.stream;};
    (window as any).registryAudio = {ctx, output, speech: 0, audio: 0, bufferStops: 0, operations: {}, errors: 0, frames: []};
    const create = RTCPeerConnection.prototype.createDataChannel;
    RTCPeerConnection.prototype.createDataChannel = function(...args) {
      const channel = create.apply(this, args);
      channel.addEventListener('message', event => {
        try {
          const value = JSON.parse(event.data), metrics = (window as any).registryAudio;
          if (value.type === 'input_audio_buffer.speech_started') metrics.speech++;
          if (value.type === 'output_audio_buffer.started') metrics.audio++;
          if (value.type === 'output_audio_buffer.stopped') metrics.bufferStops++;
          if (value.type === 'error') metrics.errors++;
          const item = value.item;
          if (item?.type === 'function_call' && item.name === 'smart_technologie' && item.arguments) {
            const operation = JSON.parse(item.arguments).operation;
            metrics.operations[operation] = (metrics.operations[operation] ?? 0) + 1;
          }
          if (item?.id?.startsWith('kvha_') && item.content?.[0]?.type === 'input_text') {
            const text = item.content[0].text;
            const data = JSON.parse(text.slice(text.indexOf('\n') + 1));
            metrics.frames.push(data); if (metrics.frames.length > 30) metrics.frames.shift();
          }
        } catch { /* No raw events or transcripts in artifacts. */ }
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
  await expect(page.getByText('Klíč je uložen.')).toBeVisible();
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'kajovo_csrf')!.value;
  const memorySettings = await (await page.request.get('/api/v1/admin/voice-memory/settings')).json();
  let temporaryMemoryRevision: number | null = null;
  if (memorySettings.automatic) {
    const response = await page.request.put('/api/v1/admin/voice-memory/settings', {headers: {'x-csrf-token': csrf}, data: {automatic: false, revision: memorySettings.revision}});
    expect(response.status()).toBe(200);
    temporaryMemoryRevision = (await response.json()).revision;
  }
  const view = async () => page.evaluate(async () => {
    const entries = performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('/registry-plan'));
    if (!entries.length) return null;
    return (await fetch(entries[entries.length - 1].name, {credentials: 'include', cache: 'no-store'})).json();
  });
  const speak = async (name: string) => {
    await expect(page.getByTestId('voice-state')).toHaveText('Poslouchám', {timeout: 120000});
    const data = readFileSync(join(directory, name + '.wav')).toString('base64');
    await page.evaluate(async data => {
      const {ctx, output} = (window as any).registryAudio;
      const raw = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      const buffer = await ctx.decodeAudioData(raw.buffer);
      const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(output);
      await ctx.resume();
      await new Promise<void>(resolve => {source.onended = () => {source.disconnect(); resolve();}; source.start();});
    }, data);
  };
  const awaitPlan = async (previous?: string) => {
    await expect.poll(async () => {const v = await view(); return v?.state === 'awaiting_confirmation' && v.plan.id !== previous;}, {timeout: 150000}).toBe(true);
    return (await view()).plan.id as string;
  };
  const applied = async () => expect.poll(async () => (await view())?.state, {timeout: 120000}).toBe('applied');
  try {
    await page.getByRole('button', {name: 'Zahájit hovor'}).click();
    await expect(page.getByTestId('voice-capability-status')).toHaveText('Smart technologie jsou připravené.', {timeout: 60000});
    await speak('list');
    await expect.poll(() => page.evaluate(() => (window as any).registryAudio.operations.rooms_list ?? 0), {timeout: 120000}).toBeGreaterThan(0);
    await speak('create'); await applied();
    await speak('rename'); const rejected = await awaitPlan();
    const panel = page.getByTestId('voice-registry');
    for (const [name, width, height] of [['desktop', 1440, 900], ['tablet', 768, 1024], ['phone', 390, 844]] as const) {
      await page.setViewportSize({width, height});
      await panel.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(panel.getByRole('button')).toHaveCount(0);
      await expect(panel.locator('li')).toHaveCount(2);
      await panel.screenshot({path: join(directory, `production-proposal-${name}.png`)});
    }
    await page.setViewportSize({width: 1440, height: 900});
    await speak('no');
    await expect.poll(async () => (await view())?.state, {timeout: 60000}).toBe('refused');
    await speak('rename'); await awaitPlan(rejected);
    await speak('yes'); await applied();
    await speak('delete-both'); const original = await awaitPlan();
    await speak('delete-first'); await awaitPlan(original);
    await speak('yes'); await applied();
    await speak('delete-last'); await awaitPlan();
    await speak('yes'); await applied();
    await speak('verify-list');
    await expect.poll(() => page.evaluate(names => {
      const frame = [...(window as any).registryAudio.frames].reverse().find(f => Array.isArray(f.rooms));
      return frame && frame.has_more === false && !frame.rooms.some((r: any) => names.includes(r.name));
    }, manifest.allowed_names), {timeout: 120000}).toBe(true);
    expect(await page.evaluate(() => (window as any).registryAudio.operations.control ?? 0)).toBe(0);
    expect(await page.evaluate(() => (window as any).registryAudio.operations.read ?? 0)).toBe(0);
  } finally {
    console.log('Registry live aggregate evidence:', await page.evaluate(() => {
      const {speech, audio, bufferStops, operations, errors} = (window as any).registryAudio;
      return {speech, audio, bufferStops, operations, errors};
    }));
    const end = page.getByRole('button', {name: 'Ukončit hovor'});
    if (await end.isVisible()) await end.click();
    if (temporaryMemoryRevision !== null) {
      const response = await page.request.put('/api/v1/admin/voice-memory/settings', {headers: {'x-csrf-token': csrf}, data: {automatic: true, revision: temporaryMemoryRevision}});
      expect(response.status()).toBe(200);
    }
  }
});
