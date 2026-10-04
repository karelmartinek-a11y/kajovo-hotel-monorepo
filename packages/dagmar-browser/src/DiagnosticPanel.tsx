import React, {useState} from 'react';
import type {Transport} from './diagnostics.js';

type Call = {id:string;created:string;closed:string|null;pinned:boolean;release:string;model:string|null;incomplete:boolean};
export function DiagnosticPanel({request,download}:{request:Transport;download:(path:string)=>void}) {
  const [calls,setCalls]=useState<Call[]>([]),[selected,setSelected]=useState<any>(null),[capacity,setCapacity]=useState<Record<string,any>>({}),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState<string|null>(null);
  const action=async(work:()=>Promise<void>)=>{setBusy(true);try{await work();}catch{setStatus('Diagnostiku nelze načíst nebo uložit. Ověřte oprávnění a kapacitu.');}finally{setBusy(false);}};
  const refresh=async()=>{const [list,quota]=await Promise.all([request('/diagnostics/calls'),request('/diagnostics/capacity')]);setCalls(list.calls);setCapacity(quota);};
  return <section className="dg-diagnostics" aria-label="Diagnostika hlasových hovorů"><h2>Diagnostika</h2>
    <p>Debug ukládá přepisy, použitý obsah nástrojů včetně pošty a oddělený mikrofonní a přijímaný zvuk. Zvuk je citlivý a nelze automaticky redigovat. Přijatý zvuk nedokládá akustický přednes reproduktoru.</p>
    <button disabled={busy} onClick={()=>void action(refresh)}>Načíst hovory a kapacitu</button>
    <p role="status">{status}</p>
    <ul>{Object.entries(capacity).map(([category,value])=><li key={category}>{category}: {value.used_bytes} / {value.maximum_bytes} bytes {value.warning?'— upozornění na kapacitu':''}</li>)}</ul>
    <ul>{calls.map(call=><li key={call.id}><button disabled={busy} onClick={()=>void action(async()=>{setSelected(await request(`/diagnostics/calls/${call.id}`));setConfirm(null);})}>{new Date(call.created).toLocaleString('cs-CZ')} · {call.closed?'uzavřený':'otevřený'} · {call.pinned?'chráněný':'běžný'} · {call.model??'model neznámý'}</button></li>)}</ul>
    {selected&&<article><h3>Hovor {selected.call.id}</h3><p>Release: {selected.call.release}</p><p>{selected.missing_final?'Chybí finále. ':''}{selected.call.incomplete||selected.gaps.length||selected.duplicates?.length||selected.segments.some((s:any)=>!s.complete)?'Záznam je neúplný.':'Manifest nehlásí ztracené části.'}</p>
      <button disabled={busy} onClick={()=>void action(async()=>{await request(`/diagnostics/calls/${selected.call.id}/pin`,'POST');setStatus('Celý hovor je chráněný.');await refresh();})}>Připnout uzavřený incident</button>
      <button disabled={busy} onClick={()=>{download(`/diagnostics/calls/${selected.call.id}/export`);setStatus('Export se stahuje. Externí staženou kopii nelze smazáním serveru odvolat.');}}>Stáhnout chráněný export</button>
      <button disabled={busy} onClick={()=>setConfirm(selected.call.id)}>Smazat celý hovor</button>
      {confirm===selected.call.id&&<div role="alert"><p>Smazat text, zvuk i dočasné části tohoto hovoru? Paměť Dagmar se tím nemaže.</p><button disabled={busy} onClick={()=>void action(async()=>{await request(`/diagnostics/calls/${selected.call.id}`,'DELETE');setSelected(null);setConfirm(null);setStatus('Hovor byl smazán.');await refresh();})}>Potvrdit smazání hovoru</button><button onClick={()=>setConfirm(null)}>Zrušit</button></div>}
      <h4>Finále producentů</h4><pre>{JSON.stringify(selected.call.producer_final ?? {},null,2)}</pre>
      <h4>Úplnost zvuku</h4>{selected.audio?.partial&&<p>Přehled zvuku je omezený; úplné části jsou v exportu.</p>}<pre>{JSON.stringify(selected.audio ?? {status:'Starý manifest neobsahuje úplnost obou stop.'},null,2)}</pre>
      <h4>Usage</h4><pre>{JSON.stringify(selected.usage,null,2)}</pre>
      <h4>Timeline a mezery</h4>{selected.timeline_partial&&<p>Zobrazeno prvních 1000 objektů. Úplný seznam a obsah jsou v exportu.</p>}<pre>{JSON.stringify(selected.gaps,null,2)}</pre><ol>{selected.events.map((event:any)=><li key={event.event_id}>{event.timestamp} · {event.source}/{event.sequence} · {event.event_type} · {event.severity}</li>)}</ol>
    </article>}
  </section>;
}
