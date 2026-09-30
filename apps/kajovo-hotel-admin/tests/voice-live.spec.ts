import {test, expect} from '@playwright/test';
import {getAdminCredentials} from '../test-admin-credentials';

test('explicit opt-in real speech, response, interruption and cleanup', async ({page}) => {
  // @ts-expect-error Node environment is provided by Playwright.
  test.skip(process.env.VOICE_CORE_LIVE_SMOKE !== '1', 'Paid calls require explicit opt-in');
  await page.addInitScript(() => {
    const originalMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const streams: MediaStream[] = [];
    const events: string[] = [];
    Object.assign(window, {voiceLiveEvidence: {streams, events}});
    navigator.mediaDevices.getUserMedia = async constraints => {const stream = await originalMedia(constraints); streams.push(stream); return stream;};
    const originalChannel = RTCPeerConnection.prototype.createDataChannel;
    RTCPeerConnection.prototype.createDataChannel = function (...args) {
      const channel = originalChannel.apply(this, args);
      channel.addEventListener('message', message => {
        try {const event = JSON.parse(message.data); if (typeof event.type === 'string') events.push(event.type);} catch { /* No raw events or conversation content are retained. */ }
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
  try {
    await expect.poll(() => page.evaluate(() => (window as any).voiceLiveEvidence.events.includes('input_audio_buffer.speech_started')), {timeout: 30000}).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).voiceLiveEvidence.events.includes('output_audio_buffer.started')), {timeout: 60000}).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const events = (window as any).voiceLiveEvidence.events as string[];
      const output = events.indexOf('output_audio_buffer.started');
      return output >= 0 && events.slice(output + 1).includes('input_audio_buffer.speech_started') && events.slice(output + 1).includes('output_audio_buffer.cleared');
    }), {timeout: 30000}).toBe(true);
  } finally {
    const end = page.getByRole('button', {name: 'Ukončit hovor'});
    if (await end.isVisible()) await end.click();
  }
  expect(await page.evaluate(() => (window as any).voiceLiveEvidence.streams.every((stream: MediaStream) => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true);
  await expect(page.getByTestId('voice-state')).toHaveText('Hovor ukončen');
});
