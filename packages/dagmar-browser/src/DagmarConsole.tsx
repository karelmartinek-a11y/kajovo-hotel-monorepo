import React, {useMemo, useRef, useState} from 'react';
import {VoiceConsole, type VoiceConfigSnapshot, type VoiceConfigStore, type VoiceSecretStore, type RealtimeSessionProvider} from '@voice-core/browser';
import '@voice-core/browser/styles.css';
import {LogicalCallClient} from './calls.js';
import {VoiceMemoryPanel} from './VoiceMemoryPanel.js';
import {VoiceMailPanel} from './VoiceMailPanel.js';
import {VoiceRegistryPanel} from './VoiceRegistryPanel.js';
import type {DagmarRequest} from './ports.js';

/** Dagmar owns configuration, orchestration and all panels. Host maps/authenticates transport. */
export function DagmarConsole({request,memoryRequest}:{request:DagmarRequest;memoryRequest:DagmarRequest}) {
  const revision=useRef(0);
  const calls=useMemo(()=>new LogicalCallClient(request),[request]);
  const [sessionId,setSessionId]=useState<string|null>(null);
  const configStore=useMemo<VoiceConfigStore>(()=>{
    const remember=(value:VoiceConfigSnapshot)=>{revision.current=value.revision;return value;};
    return {read:async()=>remember(await request('/config')),save:async(config,expected)=>remember(await request('/config','PUT',{...config,revision:expected}))};
  },[request]);
  const secretStore=useMemo<VoiceSecretStore>(()=>({
    save:async(key)=>{const value=await request<VoiceConfigSnapshot>('/api-key','PUT',{api_key:key});revision.current=value.revision;return value;},
    delete:async()=>{const value=await request<VoiceConfigSnapshot>('/api-key','DELETE');revision.current=value.revision;return value;},
  }),[request]);
  const provider=useMemo<RealtimeSessionProvider>(()=>({
    beginCall:()=>calls.start(),
    endCall:()=>calls.end(),
    create:async(sdp,signal)=>{
      const logical_call_id=await calls.identity(signal);
      const answer=await request<Awaited<ReturnType<RealtimeSessionProvider['create']>>>('/sessions','POST',{sdp,revision:revision.current,...(logical_call_id?{logical_call_id}:{})},signal);
      setSessionId(answer.session_id??null);return answer;
    },
    heartbeat:async(id,signal)=>{const value=await request<Awaited<ReturnType<NonNullable<RealtimeSessionProvider['heartbeat']>>>>(`/sessions/${encodeURIComponent(id)}/heartbeat`,'POST',undefined,signal);if(value.closed)setSessionId(current => current === id ? null : current);return value;},
    close:async(id)=>{setSessionId(current => current === id ? null : current);await request(`/sessions/${encodeURIComponent(id)}`,'DELETE');},
    playbackReady:async(id)=>{await request(`/sessions/${encodeURIComponent(id)}/playback-ready`,'POST');},
    connectionTimeoutMs:60000,
    disclosure:'Hovoříte s AI asistentkou Dagmar. Oprávnění administrátoři sdílejí paměť. E-mail a rizikový správní návrh vyžadují celé přečtení a následné skutečné hlasové potvrzení. Automatická paměť neukládá poštu; výslovný lidský zápis je samostatný. Potvrzení běžného povelu znamená přijaté provedení podle kontraktu.',
    capabilityLabels:{ready:'Externí schopnosti jsou připravené.',connecting:'Načítám externí schopnosti…',waiting:'Čekám na obnovení limitu hlasové služby. Odeslaný povel se nebude opakovat.',unavailable:'Externí schopnosti jsou nedostupné. Běžný rozhovor může pokračovat.'},
  }),[request,calls]);
  return <section aria-label="Dagmar"><h1>Hlasový chat</h1><VoiceConsole configStore={configStore} secretStore={secretStore} sessionProvider={provider}/><VoiceRegistryPanel sessionId={sessionId} request={request}/><VoiceMailPanel sessionId={sessionId} request={request}/><VoiceMemoryPanel request={memoryRequest}/></section>;
}
