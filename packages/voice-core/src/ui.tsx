import React, {useEffect, useMemo, useState, useSyncExternalStore} from 'react';
import {callActive, type VoiceConfigSnapshot, type VoiceCoreConfig, type VoiceConfigStore, type VoiceSecretStore, type RealtimeSessionProvider, type VoiceTelemetrySink, type VoiceSnapshot} from './contracts.js';
import {VoiceRealtimeClient} from './runtime.js';
import {errorMessage, stateLabels} from './messages.js';

export function VoiceOrb({snapshot}: {snapshot: VoiceSnapshot}) {
  const level = Math.max(snapshot.inputLevel, snapshot.outputLevel);
  return <div className="vc-orb" data-state={snapshot.state} aria-hidden="true" style={{'--vc-level': level} as React.CSSProperties}><span /><span /><span /></div>;
}
function configuration(snapshot: VoiceConfigSnapshot): VoiceCoreConfig {
  const {model_mode, manual_model, response_length, language_mode, manual_language, voice} = snapshot;
  return {model_mode, manual_model, response_length, language_mode, manual_language, voice};
}
export function VoiceConsole({configStore, secretStore, sessionProvider, telemetry}: {
  configStore: VoiceConfigStore; secretStore: VoiceSecretStore; sessionProvider: RealtimeSessionProvider; telemetry: VoiceTelemetrySink;
}) {
  const client = useMemo(() => new VoiceRealtimeClient(sessionProvider, telemetry), [sessionProvider, telemetry]);
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [saved, setSaved] = useState<VoiceConfigSnapshot | null>(null);
  const [draft, setDraft] = useState<VoiceCoreConfig | null>(null);
  const [key, setKey] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const active = callActive(snapshot.state); const locked = active || busy;
  useEffect(() => {let alive = true; void configStore.read().then(value => {if (alive) {setSaved(value); setDraft(configuration(value));}}).catch(() => {if (alive) setError('Konfiguraci nelze načíst. Přihlaste se jako administrátor nebo obnovte stránku.');}); return () => {alive = false; client.dispose();};}, [client, configStore]);
  const apply = (value: VoiceConfigSnapshot) => {setSaved(value); setDraft(configuration(value));};
  const action = async (work: () => Promise<VoiceConfigSnapshot>) => {
    if (locked) return; setBusy(true); setError(null);
    try {apply(await work());} catch (failure) {
      const category = typeof failure === 'object' && failure !== null && 'category' in failure ? String(failure.category) : 'configuration_failed';
      setError(category === "configuration_failed" ? "Konfiguraci se nepodařilo uložit. Zkuste to znovu." : errorMessage(category));
      if (category === 'configuration_conflict') {try {apply(await configStore.read());} catch { /* Keep the last verified configuration. */ }}
    } finally {setBusy(false);}
  };
  const update = (patch: Partial<VoiceCoreConfig>) => {if (!locked && draft) setDraft({...draft, ...patch});};
  const dirty = saved && draft && JSON.stringify(configuration(saved)) !== JSON.stringify(draft);
  return <section className="vc-console" aria-label="Hlasový chat" data-testid="voice-console">
    <div className="vc-conversation">
      <VoiceOrb snapshot={snapshot} />
      <p className="vc-state" role="status" aria-live="polite" data-testid="voice-state">{stateLabels[snapshot.state]}</p>
      {snapshot.model && <p className="vc-detail">Model hovoru: {snapshot.model}</p>}
      <button className="vc-primary" disabled={busy || (!active && (!saved?.configured || Boolean(dirty)))} onClick={() => {if (active) void client.stop(); else {setError(null); void client.start();}}}>{active ? 'Ukončit hovor' : 'Zahájit hovor'}</button>
      <button className="vc-button" disabled={!active || !['listening', 'user-speaking', 'assistant-processing', 'assistant-speaking', 'reconnecting'].includes(snapshot.state)} aria-pressed={snapshot.muted} onClick={() => client.setMuted(!snapshot.muted)}>{snapshot.muted ? 'Zapnout mikrofon' : 'Ztlumit mikrofon'}</button>
      <p className="vc-detail">Hovoříte s AI. Tato verze nemá přístup k živým datům ani externím nástrojům.</p>
      {(snapshot.error || error) && <p className="vc-error" role="alert">{snapshot.error ? errorMessage(snapshot.error.category) : error}</p>}
    </div>
    <div className="vc-controls">
      <form onSubmit={event => {event.preventDefault(); const value = key; setKey(''); void action(() => secretStore.save(value));}}>
        <fieldset disabled={locked}>
          <legend>OpenAI API klíč</legend>
          <p>{saved?.configured ? 'Klíč je uložen.' : 'Klíč není uložen.'}</p>
          <label htmlFor="vc-api-key">Nový API klíč</label>
          <input id="vc-api-key" type="password" value={key} autoComplete="off" spellCheck={false} onChange={event => setKey(event.target.value)} />
          <div className="vc-actions"><button className="vc-button" disabled={!key.trim()} type="submit">Uložit</button><button className="vc-button" type="button" disabled={!saved?.configured} onClick={() => {setKey(''); void action(() => secretStore.delete());}}>Smazat klíč</button></div>
        </fieldset>
      </form>
      {draft && saved && <form onSubmit={event => {event.preventDefault(); void action(() => configStore.save(draft, saved.revision));}}>
        <fieldset disabled={locked}>
          <legend>Hovor</legend>
          <label htmlFor="vc-model-mode">Výběr modelu</label>
          <select id="vc-model-mode" value={draft.model_mode} onChange={event => update({model_mode: event.target.value as VoiceCoreConfig['model_mode'], manual_model: draft.manual_model ?? saved.catalog.models[0]})}><option value="automatic">Automaticky</option><option value="manual">Ručně</option></select>
          {draft.model_mode === 'manual' && <><label htmlFor="vc-model">Model</label><select id="vc-model" value={draft.manual_model ?? ''} onChange={event => update({manual_model: event.target.value})}>{saved.catalog.models.map(model => <option key={model}>{model}</option>)}</select></>}
          <label htmlFor="vc-length">Délka odpovědi</label><select id="vc-length" value={draft.response_length} onChange={event => update({response_length: event.target.value as VoiceCoreConfig['response_length']})}><option value="short">Krátká</option><option value="medium">Střední</option><option value="long">Dlouhá</option></select>
          <label htmlFor="vc-language-mode">Výběr jazyka</label><select id="vc-language-mode" value={draft.language_mode} onChange={event => update({language_mode: event.target.value as VoiceCoreConfig['language_mode'], manual_language: draft.manual_language ?? saved.catalog.languages[0].id})}><option value="automatic">Automaticky</option><option value="manual">Ručně</option></select>
          {draft.language_mode === 'manual' && <><label htmlFor="vc-language">Jazyk</label><select id="vc-language" value={draft.manual_language ?? ''} onChange={event => update({manual_language: event.target.value})}>{saved.catalog.languages.map(language => <option key={language.id} value={language.id}>{language.label}</option>)}</select></>}
          <label htmlFor="vc-voice">Hlas</label><select id="vc-voice" value={draft.voice} onChange={event => update({voice: event.target.value})}>{saved.catalog.voices.map(voice => <option key={voice}>{voice}</option>)}</select>
          <button className="vc-button" disabled={!dirty} type="submit">Uložit nastavení hovoru</button>
          {dirty && <p>Nejprve uložte změny nastavení.</p>}
        </fieldset>
      </form>}
      {locked && <p className="vc-detail">Nastavení je během hovoru nebo zápisu uzamčeno.</p>}
    </div>
  </section>;
}
