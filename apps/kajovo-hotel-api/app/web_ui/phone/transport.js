import {action,element} from './controls.js';
import {text} from './locale.js';

export const prefix = '/sections/hotel/';
const meta = name=>document.querySelector('meta[name="cml-section-'+name+'"]')?.content ?? '';

export async function request(path,{role,method='GET',body,id,media,signal} = {}) {
  const url = new URL(prefix+path,location.origin);
  if (url.origin!==location.origin || !url.pathname.startsWith(prefix)) throw Error('Neplatná cesta služby.');
  if (role) url.searchParams.set('_role',role);
  const changes = method!=='GET' && method!=='HEAD';
  const multipart = body instanceof FormData;
  const headers = {'X-CML-Section-Capability':meta('capability')};
  if (changes) headers['X-CSRF-Token'] = meta('csrf');
  if (id) headers['Idempotency-Key'] = id;
  if (body!==undefined && !multipart) headers['Content-Type'] = 'application/json';
  if (media) headers.Accept = media;
  let result;
  try {
    result = await fetch(url,{method,headers,credentials:'omit',body:body===undefined||multipart?body:JSON.stringify(body),
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});
  } catch (error) {
    if (signal?.aborted) throw error;
    const failed = Error(changes?'Uložený výsledek zatím nelze ověřit.':'Načtení se nepodařilo.');
    failed.uncertain = changes;
    throw failed;
  }
  if (!result.ok) {
    const payload = await result.json().catch(()=>({}));
    const detail = payload.detail;
    const message = Array.isArray(detail)?detail.map(issue=>[(issue.loc??[]).slice(1).join(' · '),issue.msg].join(' — ')).join('\n'):
      typeof detail==='string'?detail:detail?.message;
    const error = Error(payload.error?.message ?? message ?? 'Služba požadavek nepotvrdila.');
    error.status = result.status;
    error.uncertain = changes && (payload.uncertain===true || ![401,403,422].includes(result.status));
    throw error;
  }
  if (result.status===204) return null;
  return media?result.blob():result.json();
}

export async function receipt(read,id) {
  const record = await read('api/request-status?request_id='+encodeURIComponent(id));
  if (record.state!=='completed') throw Error('Původní požadavek se ještě zpracovává.');
  if (record.status<200 || record.status>=300) throw Error('Původní požadavek vrátil chybu. Obnovte uložená data.');
  return record.body;
}

export async function commit(host,{read,path,method='POST',body,verify,done}) {
  if (host.dataset.pending) return;
  const id = crypto.randomUUID();
  host.dataset.pending = id;
  const controls = [...host.querySelectorAll('input,select,textarea,button')];
  const enabled = controls.filter(control=>!control.disabled);
  enabled.forEach(control=>{control.disabled=true;});
  const status = element('p',{role:'status'},text('Ukládám a ověřuji…'));
  host.prepend(status);
  let value;
  let accepted = false;
  const finish = async ()=>{
    await verify(value,id);
    status.textContent = text('Uložený výsledek byl ověřen.');
    delete host.dataset.pending;
    await done(value,id);
  };
  try {
    value = await read(path,{method,body,id});
    accepted = true;
    await finish();
  } catch (error) {
    status.textContent = error.message;
    if (!accepted && !error.uncertain) {
      delete host.dataset.pending;
      enabled.forEach(control=>{control.disabled=false;});
      return;
    }
    const recovery = action('Ověřit původní výsledek',async()=>{
      recovery.disabled = true;
      try {
        if (!accepted) {
          value = await receipt(read,id);
          accepted = true;
        }
        await finish();
        recovery.remove();
      } catch (failure) {
        status.textContent = failure.message;
      } finally {
        recovery.disabled = false;
      }
    },true);
    status.after(recovery);
    recovery.focus();
  }
}
