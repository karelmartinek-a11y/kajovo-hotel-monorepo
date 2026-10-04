import React, {useMemo, useState, useSyncExternalStore} from 'react';
import {VoiceConsole, type VoiceConfigStore, type VoiceConfigSnapshot, type VoiceSecretStore, type RealtimeSessionProvider} from '@voice-core/browser';
import '@voice-core/browser/styles.css';
import {DiagnosticClient, DiagnosticPanel, debugLabels} from '@dagmar/browser';
import '@dagmar/browser/styles.css';
import {VoiceMemoryPanel} from './VoiceMemoryPanel';
import {VoiceMailPanel} from './VoiceMailPanel';
import {VoiceRegistryPanel} from './VoiceRegistryPanel';
import {request} from './voice-request';

let revision = 0;
const remember = (value: VoiceConfigSnapshot) => {revision = value.revision; return value;};
const configStore: VoiceConfigStore = {
  read: async () => remember(await request<VoiceConfigSnapshot>('/config')),
  save: async (config, expectedRevision) => remember(await request<VoiceConfigSnapshot>('/config', 'PUT', {...config, revision: expectedRevision})),
};
const secretStore: VoiceSecretStore = {
  save: async key => remember(await request<VoiceConfigSnapshot>('/api-key', 'PUT', {api_key: key})),
  delete: async () => remember(await request<VoiceConfigSnapshot>('/api-key', 'DELETE')),
};
const sessionProvider: RealtimeSessionProvider = {
  create: (sdp, signal) => request('/sessions', 'POST', {sdp, revision}, signal),
  heartbeat: (id, signal) => request(`/sessions/${encodeURIComponent(id)}/heartbeat`, 'POST', undefined, signal),
  close: async id => {await request(`/sessions/${encodeURIComponent(id)}`, 'DELETE');},
  connectionTimeoutMs: 60000,
  speakerEchoProtection: true,
  disclosure: 'Hovoříte s AI. Debug lze během hovoru zapnout a vypnout; ukládá přepisy, obsah použitých nástrojů včetně pošty a citlivý oddělený zvuk do chráněného úložiště. Sběr může být neúplný. Paměť uchovává stručné informace a lístky vašeho účtu. Smart technologie spravují schválená zařízení, místnosti a názvy. Mazání místností a hromadné názvy vyžadují potvrzení hlasem po přečtení návrhu. E-mail před odesláním přečtu celý a vyžádám potvrzení hlasem. Mailový obsah pozastaví automatickou paměť do konce hovoru. Potvrzení povelu znamená jeho odeslání.',
  capabilityLabels: {ready: 'Smart technologie jsou připravené.', connecting: 'Načítám Smart technologie…', waiting: 'Čekám na obnovení limitu hlasové služby. Odeslaný povel se nebude opakovat.', unavailable: 'Smart technologie jsou nedostupné. Běžný rozhovor může pokračovat.'},
};

export function VoiceCorePage() {
  const telemetry = useMemo(() => new DiagnosticClient(request), []);
  const debug = useSyncExternalStore(telemetry.subscribe, telemetry.getSnapshot);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const provider = useMemo<RealtimeSessionProvider>(() => ({...sessionProvider,
    create: async (sdp, signal) => {const logical_call_id = await telemetry.begin(); const answer = await request<Awaited<ReturnType<typeof sessionProvider.create>>>('/sessions', 'POST', {sdp,revision,...(logical_call_id ? {logical_call_id} : {})}, signal); setSessionId(answer.session_id ?? null); if(answer.session_id) await telemetry.bind(answer.session_id); return answer;},
    heartbeat: async (id, signal) => {const status = await sessionProvider.heartbeat!(id, signal); if (status.closed) setSessionId(current => current === id ? null : current); return status;},
    close: async id => {setSessionId(current => current === id ? null : current); await sessionProvider.close!(id);},
  }), [telemetry]);
  return <main className="k-page"><h1>Hlasový chat</h1><VoiceConsole configStore={configStore} secretStore={secretStore} sessionProvider={provider} telemetry={telemetry} highlighted={['recording','degraded'].includes(debug.state)} adornment={<div className="dg-debug-controls"><button className="vc-button" disabled={!sessionId} aria-pressed={['starting','recording','degraded'].includes(debug.state)} onClick={()=>void telemetry.toggle()}>{['starting','recording','degraded'].includes(debug.state) ? 'Vypnout debug' : 'Zapnout debug'}</button><p className="dg-debug-label" role="status" aria-live="polite">{debugLabels[debug.state]}</p>{debug.error && <p role="status">Sběr: {debug.error}. Ztracené bytes: {debug.droppedBytes}.</p>}</div>} /><VoiceRegistryPanel sessionId={sessionId} /><VoiceMailPanel sessionId={sessionId} /><VoiceMemoryPanel /><DiagnosticPanel request={request} download={path=>{window.location.href='/api/v1/admin/voice-core'+path;}} /></main>;
}
