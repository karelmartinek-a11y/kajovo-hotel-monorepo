import {expect,test} from '@playwright/test';
import {getAdminCredentials} from '../test-admin-credentials';

test('real auth/call/reconnect/Stop without diagnostic requests, recorder or stats timer',async({page},info)=>{
  test.setTimeout(45000);
  const diagnostics:string[]=[];
  const connections:{logical_call_id:string}[]=[];
  page.on('request',request=>{if(request.url().includes('/diagnostics'))diagnostics.push(request.url());});
  page.on('response',async response=>{if(response.url().endsWith('/voice-core/sessions')&&response.request().method()==='POST'&&response.ok())connections.push(await response.json());});
  await page.addInitScript(()=>{
    (window as any).voiceFixture={recorders:0,stats:0,peers:[]};
    (window as any).MediaRecorder=class {constructor(){(window as any).voiceFixture.recorders++;throw new Error('unexpected_recorder');}};
    class Peer {
      connectionState='connected';ontrack:any;onconnectionstatechange:any;capture:any;remote:any;
      constructor(){(window as any).voiceFixture.peers.push(this);}
      addTrack(_:any,stream:any){this.capture=stream;}
      createDataChannel(){return {readyState:'open',close(){},send(){},onmessage:null,onopen:null};}
      async createOffer(){return {sdp:'v=0\r\nisolated-offer'};}
      async setLocalDescription(){}
      async setRemoteDescription(){const stream=new MediaStream(this.capture.getAudioTracks().map((track:any)=>track.clone()));this.remote=stream;this.ontrack?.({streams:[stream],track:stream.getAudioTracks()[0]});}
      async getStats(){(window as any).voiceFixture.stats++;return new Map();}
      close(){this.connectionState='closed';this.remote?.getTracks().forEach((track:any)=>track.stop());}
    }
    (window as any).RTCPeerConnection=Peer;
  });
  const credentials=getAdminCredentials();
  await page.goto('/admin/login');await page.getByLabel(/e-mail administrátora/i).fill(credentials.email);await page.getByLabel(/heslo administrátora/i).fill(credentials.password);await page.getByRole('button',{name:/přihlásit/i}).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto('/admin/hlasovy-chat');
  await expect(page.getByRole('button',{name:/debug/i})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Diagnostika hlasových hovorů'})).toHaveCount(0);
  await page.getByLabel('Nový API klíč').fill('sk-isolated-test-only');await page.getByRole('button',{name:'Uložit',exact:true}).click();
  await expect(page.getByText('Klíč je uložen.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Zahájit hovor',exact:true}).click();
  await expect(page.getByTestId('voice-state')).toContainText('Poslouchám');
  await expect(page.getByTestId('voice-mcp-hotel_mail')).toHaveText('Pošta není aktivovaná.');
  await expect.poll(()=>connections.length).toBe(1);
  await expect(page.locator('.vc-orb')).not.toHaveAttribute('data-debug');
  // Wait beyond the old five-second diagnostic stats interval.
  await page.screenshot({path:info.outputPath('voice-active.png'),fullPage:true});
  await page.waitForTimeout(5500);
  await expect(page.getByTestId('voice-state')).toContainText('Poslouchám');
  await page.evaluate(()=>{const peer=(window as any).voiceFixture.peers.at(-1);peer.connectionState='disconnected';peer.onconnectionstatechange();});
  await expect.poll(()=>connections.length).toBe(2);
  expect(connections[1].logical_call_id).toBe(connections[0].logical_call_id);
  await expect(page.getByTestId('voice-state')).toContainText('Poslouchám');
  await page.getByRole('button',{name:'Ukončit hovor',exact:true}).click();
  await expect(page.getByRole('button',{name:'Zahájit hovor',exact:true})).toBeVisible();
  const fixture=await page.evaluate(()=>{
    const value=(window as any).voiceFixture;
    return {recorders:value.recorders,stats:value.stats,live:value.peers.some((p:any)=>p.connectionState!=='closed'||p.capture?.getTracks().some((t:any)=>t.readyState==='live'))};
  });
  expect(fixture).toEqual({recorders:0,stats:0,live:false});
  expect(diagnostics).toEqual([]);
  await expect.poll(async()=>{const result=await (await page.request.get('/api/__voice_fixture')).json();return result.open_calls;}).toBe(0);
  const metrics=await (await page.request.get('/api/__voice_fixture')).json();
  expect(metrics.technical_audits).toBe(0);expect(metrics.key_audits).toBeGreaterThan(0);
  expect(metrics.greetings).toBe(metrics.call_count);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
