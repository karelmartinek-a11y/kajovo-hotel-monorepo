import {test, expect} from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    const state = {streams: [] as MediaStream[], peers: [] as unknown[], channels: [] as unknown[]};
    Object.assign(window, {voiceTest: state});
    const NativeAudioContext = AudioContext;
    Object.defineProperty(Object.getPrototypeOf(navigator.mediaDevices), 'getUserMedia', {value: async () => {
      const context = new NativeAudioContext(); const stream = context.createMediaStreamDestination().stream;
      state.streams.push(stream); return stream;
    }});
    class Peer {
      channel: any; onconnectionstatechange: any; ontrack: any; connectionState = 'new'; closed = false;
      constructor() {state.peers.push(this);}
      addTrack() {} async createOffer() {return {sdp: 'v=0 test-offer'};} async setLocalDescription() {}
      createDataChannel() {this.channel = {closed: false, close() {this.closed = true;}}; state.channels.push(this.channel); return this.channel;}
      async setRemoteDescription() {this.channel.onmessage({data: JSON.stringify({type: 'session.created', event_id: 'ready'})});}
      close() {this.closed = true;}
    }
    Object.defineProperty(window, 'RTCPeerConnection', {value: Peer});
    // UI tests replace OS audio activation along with the fake transport.
    Object.defineProperty(window, 'AudioContext', {value: class {
      state = 'running'; async resume() {} async close() {}
    }});
  });
  await page.goto('/');
});

test('one screen, key status, configuration, real state and complete stop', async ({page}) => {
  await expect(page.getByText('Klíč není uložen.')).toBeVisible();
  await page.getByLabel('Nový API klíč').fill('test-key');
  await page.getByRole('button', {name: 'Uložit', exact: true}).click();
  await expect(page.getByText('Klíč je uložen.')).toBeVisible();
  await expect(page.getByLabel('Nový API klíč')).toHaveValue('');
  await page.getByLabel('Výběr modelu').selectOption('manual');
  await page.getByLabel('Výběr jazyka').selectOption('manual');
  await page.getByLabel('Jazyk', {exact: true}).selectOption('en');
  await page.getByLabel('Délka odpovědi').selectOption('long');
  await page.getByLabel('Hlas', {exact: true}).selectOption('cedar');
  await expect(page.getByRole('button', {name: 'Zahájit hovor'})).toBeDisabled();
  await page.getByRole('button', {name: 'Uložit nastavení hovoru'}).click();
  await page.getByRole('button', {name: 'Zahájit hovor'}).click();
  await expect(page.getByTestId('voice-state')).toHaveText('Poslouchám');
  await expect(page.getByLabel('Hlas', {exact: true})).toBeDisabled();
  await page.getByRole('button', {name: 'Ztlumit mikrofon'}).click();
  await expect(page.getByRole('button', {name: 'Zapnout mikrofon'})).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    const state = (window as any).voiceTest; state.channels[0].onmessage({data: JSON.stringify({type: 'output_audio_buffer.started'})});
  });
  await expect(page.locator('.vc-orb')).toHaveAttribute('data-state', 'assistant-speaking');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.getByTestId('voice-state')).toHaveText('Hovor ukončen');
  expect(await page.evaluate(() => (window as any).voiceTest.streams.every((stream: MediaStream) => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true);
  await expect(page.getByLabel('Hlas', {exact: true})).toBeEnabled();
  await page.getByRole('button', {name: 'Zahájit hovor'}).click();
  await expect(page.getByTestId('voice-state')).toHaveText('Poslouchám');
  await page.getByRole('button', {name: 'Ukončit hovor'}).click();
  expect(await page.evaluate(() => (window as any).voiceTest.streams.every((stream: MediaStream) => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true);
  await page.getByRole('button', {name: 'Smazat klíč'}).click();
  await expect(page.getByText('Klíč není uložen.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('reduced motion and keyboard access', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await expect(page.locator('.vc-orb span').first()).toHaveCSS('animation-name', 'none');
  await page.getByLabel('Nový API klíč').focus();
  await page.keyboard.type('keyboard-key');
  await page.getByRole('button', {name: 'Uložit', exact: true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Klíč je uložen.')).toBeVisible();
});
