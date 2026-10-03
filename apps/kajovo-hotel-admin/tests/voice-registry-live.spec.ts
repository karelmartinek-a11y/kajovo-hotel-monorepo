import {readFileSync, writeFileSync} from 'node:fs';
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
    // Keep the media graph active between utterances so WebRTC delivers silence for VAD.
    const clock = ctx.createOscillator(), silence = ctx.createGain();
    silence.gain.value = 0; clock.connect(silence); silence.connect(output); clock.start();
    navigator.mediaDevices.getUserMedia = async () => {await ctx.resume(); return output.stream;};
    (window as any).registryAudio = {ctx, output, speech: 0, speechStops: 0, responses: 0, audio: 0, bufferStops: 0, operations: {}, errors: 0, frames: [], usage: [], latency: [], started: {}, lastInputStop: 0, shapes: []};
    const create = RTCPeerConnection.prototype.createDataChannel;
    RTCPeerConnection.prototype.createDataChannel = function(...args) {
      const channel = create.apply(this, args);
      channel.addEventListener('message', event => {
        try {
          const value = JSON.parse(event.data), metrics = (window as any).registryAudio;
          if (value.type === 'input_audio_buffer.speech_started') metrics.speech++;
          if (value.type === 'input_audio_buffer.speech_stopped') metrics.speechStops++;
          if (value.type === 'response.created') metrics.responses++;
          if (value.type === 'output_audio_buffer.started') metrics.audio++;
          if (value.type === 'output_audio_buffer.stopped') metrics.bufferStops++;
          if (value.type === 'error') metrics.errors++;
          if (value.type === 'input_audio_buffer.speech_stopped') metrics.lastInputStop = performance.now();
          if (value.type === 'response.created') metrics.started[value.response.id] = performance.now();
          if (value.type === 'response.done') {
            metrics.usage.push(value.response.usage?.input_tokens ?? 0);
            const started = metrics.started[value.response.id];
            if (started) metrics.latency.push(Math.round(performance.now() - started));
            delete metrics.started[value.response.id];
          }
          const item = value.item;
          if (value.type === 'response.output_item.done' && item?.type === 'function_call' && item.name === 'smart_technologie' && item.arguments) {
            const args = JSON.parse(item.arguments);
            const operation = ['overview', 'search', 'describe', 'read', 'control', 'camera_snapshot', 'camera_record', 'operation_status', 'rooms_list', 'registry_prepare', 'registry_apply'].includes(args.operation) ? args.operation : '<unknown>';
            const safeKeys = new Set(['operation', 'catalog_revision', 'changes', 'plan_id', 'room_refs', 'room_selection_id', 'rows', 'selection_id', 'new_name', 'name_template', 'start_index', 'index_width', 'action', 'query', 'filters', 'limit', 'offset', 'destination_room_ref', 'request_id', 'controls', 'parameters']);
            const keys = (v: any) => Object.keys(v ?? {}).map(k => safeKeys.has(k) ? k : '<unknown>');
            metrics.shapes.push({operation, keys: keys(args), changes: Array.isArray(args.changes) ? args.changes.map((c: any) => ({action: ['create_room', 'rename_room', 'delete_room', 'assign_devices', 'remove_devices', 'rename_devices'].includes(c.action) ? c.action : '<unknown>', keys: keys(c), empty: keys(c).filter(k => c[k] === '' || (Array.isArray(c[k]) && c[k].length === 0))})) : null});
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
    await expect.poll(() => page.evaluate(() => (window as any).registryAudio.output.stream.getAudioTracks().every((track: MediaStreamTrack) => track.enabled && track.readyState === 'live')), {timeout: 30000}).toBe(true);
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
    console.log('Voice registry: rooms_list PASS');
    if (process.env.VOICE_REGISTRY_BASELINE_ONLY === '1') {
      for (const name of ['types', 'rooms', 'ordinary', 'ordinary', 'ordinary', 'ordinary']) {
        const before = await page.evaluate(() => (window as any).registryAudio.responses);
        await speak(name);
        await expect.poll(() => page.evaluate(() => (window as any).registryAudio.responses), {timeout: 120000}).toBeGreaterThan(before);
      }
      expect(await page.evaluate(() => (window as any).registryAudio.operations.registry_apply ?? 0)).toBe(0);
      console.log('Voice registry: pre-deploy read-only usage baseline PASS');
      return;
    }
    await speak('occupied'); await awaitPlan();
    const occupied = await view();
    expect(occupied.plan.changes.some((c: any) => c.action === 'delete_room' && c.detached_devices > 0)).toBe(true);
    await speak('no');
    await expect.poll(async () => (await view())?.state, {timeout: 60000}).toBe('refused');
    console.log('Voice registry: occupied numeric-name readback and refusal without apply PASS');
    await speak('create'); await applied();
    const created = async () => page.evaluate(() => {
      const frame = [...(window as any).registryAudio.frames].reverse().find(f => f.results?.some((r: any) => r.status === 'created'));
      return frame?.results.filter((r: any) => r.status === 'created').map((r: any) => r.room_ref) ?? [];
    });
    await expect.poll(async () => (await created()).length, {timeout: 30000}).toBe(2);
    const recordPath = join(directory, 'cleanup.json'), record = JSON.parse(readFileSync(recordPath, 'utf8'));
    const refs = await created();
    expect(new Set(refs).size).toBe(2);
    expect(refs.some((ref: string) => record.baseline_refs.includes(ref))).toBe(false);
    writeFileSync(recordPath, JSON.stringify({...record, created_refs: refs}), {mode: 0o600});
    console.log('Voice registry: temporary-room creation PASS');
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
    console.log('Voice registry: audio refusal and responsive proposal PASS');
    await speak('rename'); await awaitPlan(rejected);
    await speak('yes'); await applied();
    console.log('Voice registry: audio-confirmed rename PASS');
    await speak('delete-both'); const original = await awaitPlan();
    await speak('delete-first'); await awaitPlan(original);
    console.log('Voice registry: changed target requires a new proposal PASS');
    await speak('yes'); await applied();
    await speak('delete-last'); await awaitPlan();
    await speak('yes'); await applied();
    console.log('Voice registry: audio-confirmed test-room deletion PASS');
    await speak('verify-list');
    await expect.poll(() => page.evaluate(({names, expected, refs}) => {
      const frame = [...(window as any).registryAudio.frames].reverse().find(f => Array.isArray(f.rooms));
      const normalized = (name: string) => name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ') ?? '';
      return frame && frame.total === expected && frame.rooms.length === expected && !frame.rooms.some((r: any) => refs.includes(r.room_ref) || names.map(normalized).includes(normalized(r.name)));
    }, {names: manifest.allowed_names, expected: record.baseline_refs.length, refs}), {timeout: 120000}).toBe(true);
    for (const name of ['types', 'rooms']) {
      const before = await page.evaluate(() => (window as any).registryAudio.operations.rooms_list ?? 0);
      await speak(name);
      await expect.poll(() => page.evaluate(() => (window as any).registryAudio.operations.rooms_list ?? 0), {timeout: 120000}).toBeGreaterThan(before);
    }
    await speak('zero');
    await expect.poll(() => page.evaluate(() => {
      const frames = (window as any).registryAudio.frames;
      return frames.some((f: any) => f.selection?.count === 0 && Array.isArray(f.matches) && f.matches.length === 0 && f.last_target === null);
    }), {timeout: 120000}).toBe(true);
    // Continue ordinary dialogue in the same long call after an empty technology result.
    for (let i = 0; i < 4; i++) {
      const before = await page.evaluate(() => (window as any).registryAudio.responses);
      await speak('ordinary');
      await expect.poll(() => page.evaluate(() => (window as any).registryAudio.responses), {timeout: 120000}).toBeGreaterThan(before);
    }
    expect(await page.evaluate(() => (window as any).registryAudio.operations.control ?? 0)).toBe(0);
    expect(await page.evaluate(() => (window as any).registryAudio.operations.read ?? 0)).toBe(0);
  } finally {
    console.log('Registry live aggregate evidence:', await page.evaluate(() => {
      const {speech, speechStops, responses, audio, bufferStops, operations, errors, usage, latency, shapes} = (window as any).registryAudio;
      return {speech, speechStops, responses, audio, bufferStops, operations, errors, usage, latency, shapes};
    }));
    console.log('Registry live argument shapes:', JSON.stringify(await page.evaluate(() => (window as any).registryAudio.shapes)));
    const end = page.getByRole('button', {name: 'Ukončit hovor'});
    if (await end.isVisible()) await end.click();
    if (temporaryMemoryRevision !== null) {
      const response = await page.request.put('/api/v1/admin/voice-memory/settings', {headers: {'x-csrf-token': csrf}, data: {automatic: true, revision: temporaryMemoryRevision}});
      expect(response.status()).toBe(200);
    }
  }
});
