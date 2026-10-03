import {execFileSync} from 'node:child_process';
import {test, expect} from '@playwright/test';
import {getAdminCredentials} from '../test-admin-credentials';

test('opt-in spoken account inquiry uses deployed sideband, no mail mutation', async ({page}, info) => {
  test.skip(process.env.VOICE_CORE_LIVE_SMOKE !== '1' || process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true', 'Paid calls require explicit opt-in');
  await page.addInitScript(() => {
    const evidence = {speech: 0, audio: 0, drained: 0, repliedAfterTool: 0, accountCalls: 0, accountOutputs: 0, writes: 0, errors: 0};
    Object.assign(window, {mailEvidence: evidence});
    const seen = new Set<string>();
    const afterTool = new Set<string>(), completed = new Set<string>(), drained = new Set<string>();
    const create = RTCPeerConnection.prototype.createDataChannel;
    RTCPeerConnection.prototype.createDataChannel = function (...args) {
      const channel = create.apply(this, args);
      channel.addEventListener('message', message => {
        try {
          const e = JSON.parse(message.data);
          if (e.type === 'input_audio_buffer.speech_started') evidence.speech++;
          if (e.type === 'output_audio_buffer.started') evidence.audio++;
          if (e.type === 'response.created' && evidence.accountCalls > 0 && e.response?.id) afterTool.add(e.response.id);
          if (e.type === 'response.done' && e.response?.status === 'completed' && afterTool.has(e.response.id)) completed.add(e.response.id);
          if (e.type === 'output_audio_buffer.stopped') {evidence.drained++; if (afterTool.has(e.response_id)) drained.add(e.response_id);}
          evidence.repliedAfterTool = [...completed].filter(id => drained.has(id)).length;
          if (!['conversation.item.created', 'conversation.item.added', 'conversation.item.done', 'response.output_item.done'].includes(e.type) || !e.item?.id || seen.has(e.item.id)) return;
          if (e.item.type === 'function_call' && e.type !== 'response.output_item.done') return;
          seen.add(e.item.id);
          if (e.item.type === 'function_call' && ['mail_accounts_list', 'mail_account_status'].includes(e.item.name)) evidence.accountCalls++;
          if (e.item.type === 'function_call' && /^(mail_send_|mail_draft_(create|update|move)|mail_message_(mark|move|trash))/.test(e.item.name)) evidence.writes++;
          if (e.item.type === 'function_call_output') {
            const value = JSON.parse(e.item.output);
            if (value.contract_version === 'mail-mcp/1' && value.ok && value.data?.accounts) evidence.accountOutputs++;
            if (value.contract_version === 'mail-mcp/1' && !value.ok) evidence.errors++;
          }
        } catch { /* Never retain raw provider events or bodies. */ }
      });
      return channel;
    };
  });
  let sessionId = '';
  page.on('request', req => {
    const match = req.url().match(/\/sessions\/([a-f0-9]{32})\/mail-plan$/);
    if (match) sessionId = match[1];
  });
  const credentials = getAdminCredentials();
  await page.goto('/admin/login');
  await page.getByLabel(/e-mail administrátora/i).fill(credentials.email);
  await page.getByLabel(/heslo administrátora/i).fill(credentials.password);
  await page.getByRole('button', {name: /přihlásit/i}).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto('/admin/hlasovy-chat');
  await expect(page.getByText('Klíč je uložen.')).toBeVisible();
  await page.getByRole('button', {name: 'Zahájit hovor'}).click();
  const panel = page.getByRole('region', {name: 'E-mail v hlasovém chatu'});
  const metric = (name: string) => page.evaluate(key => (window as any).mailEvidence[key] as number, name);
  try {
    await expect(panel).toContainText('omezení', {timeout: 45000});
    await expect(panel).toContainText('chybí přihlašovací údaje');
    await expect.poll(() => metric('speech'), {timeout: 60000}).toBeGreaterThan(0);
    await expect.poll(() => metric('accountCalls'), {timeout: 90000}).toBeGreaterThan(0);
    // Sideband outputs are not guaranteed to be mirrored to the WebRTC client.
    // Prove the accepted result at its owner backend without retaining any tool body.
    expect(sessionId).toMatch(/^[a-f0-9]{32}$/);
    const script = `import json,subprocess
r=subprocess.run(['docker','logs','--since','10m','kajovo-prod-api-1'],capture_output=True,text=True,check=True)
count=0
for line in (r.stdout+r.stderr).splitlines():
 try:
  e=json.loads(line)
 except ValueError:
  continue
 c=e
 if e.get('message')=='voice.host.mail_delivery' and c.get('voice_session_id')==${JSON.stringify(sessionId)} and c.get('tool') in ['mail_accounts_list','mail_account_status'] and c.get('ok') is True:
  count+=1
print(json.dumps({'accepted_results':count}))
`;
    await expect.poll(() => JSON.parse(execFileSync('ssh', ['produkce', 'python3', '-'], {input: script, encoding: 'utf8', timeout: 15000})).accepted_results, {timeout: 45000}).toBeGreaterThan(0);
    await expect.poll(() => metric('audio'), {timeout: 60000}).toBeGreaterThan(0);
    await expect.poll(() => metric('repliedAfterTool'), {timeout: 60000}).toBeGreaterThan(0);
    expect(await metric('writes')).toBe(0);
    expect(await metric('errors')).toBe(0);
    for (const [name, width, height] of [['desktop', 1440, 900], ['tablet', 834, 1112], ['phone', 390, 844]] as const) {
      await page.setViewportSize({width, height});
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({path: info.outputPath(`production-mail-${name}.png`), fullPage: true});
    }
  } finally {
    console.log('MAIL live event counts:', await page.evaluate(() => (window as any).mailEvidence));
    const end = page.getByRole('button', {name: 'Ukončit hovor'});
    if (await end.isVisible()) await end.click();
  }
});
