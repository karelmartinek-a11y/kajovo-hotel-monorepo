import {expect,test} from '@playwright/test';
import {getAdminCredentials} from '../test-admin-credentials';

test('debug toggle, orange animated orb, flush and actual authenticated storage/export',async({page})=>{
  test.setTimeout(45000);
  await page.addInitScript(()=>{
    class Peer {
      connectionState='connected';iceConnectionState='connected';localDescription:any;ontrack:any;onconnectionstatechange:any;
      addTrack(){}
      createDataChannel(){return {readyState:'open',close(){},send(){},onmessage:null,onopen:null};}
      async createOffer(){return {sdp:'v=0\r\nisolated-offer'};}
      async setLocalDescription(value:any){this.localDescription=value;}
      async setRemoteDescription(){const stream=await navigator.mediaDevices.getUserMedia({audio:true});this.ontrack?.({streams:[stream],track:stream.getAudioTracks()[0]});}
      close(){this.connectionState='closed';}
    }
    (window as any).RTCPeerConnection=Peer;
  });
  const credentials=getAdminCredentials();
  await page.goto('/admin/login');await page.getByLabel(/e-mail administrátora/i).fill(credentials.email);await page.getByLabel(/heslo administrátora/i).fill(credentials.password);await page.getByRole('button',{name:/přihlásit/i}).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto('/admin/hlasovy-chat');
  await page.getByLabel('Nový API klíč').fill('sk-isolated-test-only');await page.getByRole('button',{name:'Uložit',exact:true}).click();
  await expect(page.getByText('Klíč je uložen.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Zahájit hovor',exact:true}).click();
  const toggle=page.getByRole('button',{name:'Zapnout debug',exact:true});await expect(toggle).toBeEnabled();
  await toggle.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'Vypnout debug',exact:true})).toBeVisible();
  await expect(page.locator('.vc-orb')).toHaveAttribute('data-debug','true');
  await expect(page.locator('.dg-debug-label')).toContainText('DEBUG');
  await page.waitForTimeout(1500);
  await page.getByRole('button',{name:'Vypnout debug',exact:true}).click();
  await expect(page.locator('.dg-debug-label')).toContainText('vypnutý');
  await page.getByRole('button',{name:'Zapnout debug',exact:true}).click();
  await expect(page.getByRole('button',{name:'Vypnout debug',exact:true})).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole('button',{name:'Vypnout debug',exact:true}).click();
  await expect(page.locator('.dg-debug-label')).toContainText('vypnutý');
  await page.getByRole('button',{name:'Ukončit hovor',exact:true}).click();
  await expect(page.getByRole('button',{name:'Zahájit hovor',exact:true})).toBeVisible();
  const panel=page.getByRole('region',{name:'Diagnostika hlasových hovorů'});
  await panel.getByRole('button',{name:'Načíst hovory a kapacitu'}).click();
  await panel.getByRole('button',{name:/uzavřený/}).first().click();
  await expect(panel.getByRole('heading',{name:/Hovor/})).toBeVisible();
  const calls=await (await page.request.get('/api/v1/admin/voice-core/diagnostics/calls')).json();
  const manifest=await (await page.request.get(`/api/v1/admin/voice-core/diagnostics/calls/${calls.calls[0].id}`)).json();
  expect(manifest.objects.some((value:any)=>value.kind==='audio')).toBeTruthy();
  expect(manifest.events.length).toBeGreaterThan(0);
  await panel.getByRole('button',{name:'Připnout uzavřený incident'}).click();await expect(panel.getByRole('status')).toContainText('chráněný');
  // Read the real protected export and decode concatenated recorder fragments in the browser.
  // These are test-only synthetic microphone/remote streams, never production audio.
  const exported=await page.evaluate(async(call)=>{
    const csrf=decodeURIComponent(document.cookie.split('; ').find(v=>v.startsWith('kajovo_csrf='))?.split('=')[1] ?? '');
    const response=await fetch(`/api/v1/admin/voice-core/diagnostics/calls/${call}/export`,{method:'POST',headers:{'X-CSRF-Token':csrf}});
    if(!response.ok) throw new Error('export_http_'+response.status);
    const bytes=new Uint8Array(await response.arrayBuffer()),decoder=new TextDecoder(),files=new Map<string,Uint8Array>();
    for(let offset=0;offset+512<=bytes.length;) {
      const header=bytes.slice(offset,offset+512),name=decoder.decode(header.slice(0,100)).replace(/\0.*$/,'');
      if(!name) break;
      const size=parseInt(decoder.decode(header.slice(124,136)).replace(/\0.*$/,'').trim(),8);
      files.set(name,bytes.slice(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512;
    }
    const groups=new Map<string,{sequence:number;data:Uint8Array}[]>();
    for(const [name,data] of files) {
      if(!name.endsWith('_manifest.json')) continue;
      const value=JSON.parse(decoder.decode(data));if(!value.track_id) continue;
      const id=name.replace(/_manifest\.json$/,'.bin'),audio=files.get(id);
      if(!audio) throw new Error('missing_audio');
      const group=value.segment_id+':'+value.source_id+':'+value.track_id;
      groups.set(group,[...(groups.get(group) ?? []),{sequence:value.sequence,data:audio}]);
    }
    const context=new AudioContext(),results=[];
    try {
      for(const [group,parts] of groups) {
        parts.sort((a,b)=>a.sequence-b.sequence);
        const blob=new Blob(parts.map(v=>new Uint8Array(v.data).buffer)),audio=await Promise.race([context.decodeAudioData(await blob.arrayBuffer()),new Promise<AudioBuffer>((_,reject)=>setTimeout(()=>reject(new Error('decode_timeout_'+group)),10000))]);
        results.push({group,duration:audio.duration,channels:audio.numberOfChannels});
      }
    } finally {await context.close();}
    return results;
  },calls.calls[0].id);
  expect(exported.length).toBe(4);expect(exported.every(value=>value.duration>0 && value.channels>0)).toBeTruthy();
  const download=page.waitForEvent('download');await panel.getByRole('button',{name:'Stáhnout chráněný export'}).click();expect((await download).suggestedFilename()).toMatch(/\.tar$/);
  await panel.getByRole('button',{name:'Smazat celý hovor'}).click();await panel.getByRole('button',{name:'Potvrdit smazání hovoru'}).click();await expect(panel.getByRole('status')).toContainText('smazán');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
