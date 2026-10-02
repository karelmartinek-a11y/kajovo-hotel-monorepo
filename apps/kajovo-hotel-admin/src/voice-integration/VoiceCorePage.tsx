import React from 'react';
import {VoiceConsole, type VoiceConfigStore, type VoiceConfigSnapshot, type VoiceSecretStore, type RealtimeSessionProvider, type VoiceTelemetrySink} from '@voice-core/browser';
import '@voice-core/browser/styles.css';

const BASE = '/api/v1/admin/voice-core';
let revision = 0;
async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const csrf = document.cookie.split('; ').find(value => value.startsWith('kajovo_csrf='))?.split('=').slice(1).join('=') ?? '';
  const response = await fetch(`${BASE}${path}`, {method, credentials: 'include', cache: 'no-store', signal,
    headers: {'Content-Type': 'application/json', ...(method === 'GET' ? {} : {'x-csrf-token': decodeURIComponent(csrf)})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  if (!response.ok) {
    let category = response.status === 401 || response.status === 403 ? 'unauthorized' : 'request_failed';
    try {const payload = await response.json(); if (typeof payload.detail?.code === 'string') category = payload.detail.code;} catch { /* Never surface raw server error bodies. */ }
    throw {category};
  }
  return response.json() as Promise<T>;
}
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
  disclosure: 'Hovoříte s AI. Smart technologie používají MCP v2 pro hledání schválených zařízení. Potvrzení povelu znamená jeho odeslání.',
  capabilityLabels: {ready: 'Smart technologie jsou připravené.', connecting: 'Načítám Smart technologie…', waiting: 'Čekám na obnovení limitu hlasové služby. Odeslaný povel se nebude opakovat.', unavailable: 'Smart technologie jsou nedostupné. Běžný rozhovor může pokračovat.'},
};
// Browser conversation/audio data is never sent to analytics or persistent telemetry.
const telemetry: VoiceTelemetrySink = {emit() {}};
export function VoiceCorePage() {
  return <main className="k-page"><h1>Hlasový chat</h1><VoiceConsole configStore={configStore} secretStore={secretStore} sessionProvider={sessionProvider} telemetry={telemetry} /></main>;
}
