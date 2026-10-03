import React, {useMemo, useState} from 'react';
import {VoiceConsole, type VoiceConfigStore, type VoiceConfigSnapshot, type VoiceSecretStore, type RealtimeSessionProvider, type VoiceTelemetrySink} from '@voice-core/browser';
import '@voice-core/browser/styles.css';
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
  disclosure: 'Hovoříte s AI. Paměť uchovává stručné informace a lístky vašeho účtu. Smart technologie spravují schválená zařízení, místnosti a názvy. Mazání místností a hromadné názvy vyžadují potvrzení hlasem po přečtení návrhu. E-mail před odesláním přečtu celý a vyžádám potvrzení hlasem. Mailový obsah pozastaví automatickou paměť do konce hovoru. Potvrzení povelu znamená jeho odeslání.',
  capabilityLabels: {ready: 'Smart technologie jsou připravené.', connecting: 'Načítám Smart technologie…', waiting: 'Čekám na obnovení limitu hlasové služby. Odeslaný povel se nebude opakovat.', unavailable: 'Smart technologie jsou nedostupné. Běžný rozhovor může pokračovat.'},
};
// Browser conversation/audio data is never sent to analytics or persistent telemetry.
const telemetry: VoiceTelemetrySink = {emit() {}};
export function VoiceCorePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const provider = useMemo<RealtimeSessionProvider>(() => ({...sessionProvider,
    create: async (sdp, signal) => {const answer = await sessionProvider.create(sdp, signal); setSessionId(answer.session_id ?? null); return answer;},
    heartbeat: async (id, signal) => {const status = await sessionProvider.heartbeat!(id, signal); if (status.closed) setSessionId(current => current === id ? null : current); return status;},
    close: async id => {setSessionId(current => current === id ? null : current); await sessionProvider.close!(id);},
  }), []);
  return <main className="k-page"><h1>Hlasový chat</h1><VoiceConsole configStore={configStore} secretStore={secretStore} sessionProvider={provider} telemetry={telemetry} /><VoiceRegistryPanel sessionId={sessionId} /><VoiceMailPanel sessionId={sessionId} /><VoiceMemoryPanel /></main>;
}
