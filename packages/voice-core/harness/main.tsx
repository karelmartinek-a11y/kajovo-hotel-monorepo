import React from 'react';
import {createRoot} from 'react-dom/client';
import {VoiceConsole, type VoiceConfigSnapshot} from '../src/index';
import '../src/styles.css';

// Test-only ports demonstrate hosting without any application business dependencies.
let snapshot: VoiceConfigSnapshot = {model_mode: 'automatic', manual_model: null, response_length: 'medium', language_mode: 'automatic', manual_language: null, voice: 'marin', revision: 0, configured: false, catalog: {models: ['test-realtime'], voices: ['marin', 'cedar'], languages: [{id: 'cs', label: 'Čeština'}, {id: 'en', label: 'English'}]}};
const configStore = {read: async () => snapshot, save: async (config: unknown, revision: number) => {
  if (revision !== snapshot.revision) throw {category: 'configuration_conflict'};
  snapshot = {...snapshot, ...config as object, revision: revision + 1}; return snapshot;
}};
const secretStore = {save: async (_key: string) => {snapshot = {...snapshot, configured: true, revision: snapshot.revision + 1}; return snapshot;}, delete: async () => {snapshot = {...snapshot, configured: false, revision: snapshot.revision + 1}; return snapshot;}};
const sessionProvider = {create: async () => ({sdp: 'v=0 test-answer', model: 'test-realtime'})};
createRoot(document.getElementById('root')!).render(<React.StrictMode><h1>Voice Core</h1><VoiceConsole configStore={configStore} secretStore={secretStore} sessionProvider={sessionProvider} /></React.StrictMode>);
