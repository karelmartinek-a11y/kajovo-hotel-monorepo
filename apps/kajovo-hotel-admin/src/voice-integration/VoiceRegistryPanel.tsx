import React, {useEffect, useState} from 'react';
import {request} from './voice-request';
import type {RegistryView} from '@kajovo/shared';
import './voice-registry.css';

type View = RegistryView;
const phases: Record<string, string> = {
  idle: 'Čekám na návrh změny místností nebo názvů.', prepared: 'Návrh je připravený.',
  reading: 'Čtu přesný návrh. Potvrďte hlasem až po jeho dokončení.',
  awaiting_confirmation: 'Potvrďte tento návrh hlasem: ano nebo ne.', confirmed: 'Hlasové potvrzení bylo ověřeno.',
  applying: 'Provádím návrh…', applied: 'Výsledek změny oznámí hlasový chat.',
  partially_applied: 'Část změn byla provedena; chat oznámí odmítnuté položky.', rejected: 'Změna byla odmítnuta a nebyla provedena.', unchanged: 'Požadavek nevyžaduje žádnou změnu.',
  refused: 'Návrh byl odmítnut. Změna se neprovede.', ambiguous: 'Odpověď nebyla jednoznačná. Je nutný nový návrh.',
  invalidated: 'Návrh byl zneplatněn. Je nutné nové připravení a případné potvrzení.',
  expired: 'Návrh vypršel. Je nutné nové připravení a případné potvrzení.',
  failed: 'Přečtení celého návrhu nebylo ověřeno. Změna se neprovede.',
  uncertain: 'Výsledek zápisu je nejistý. Chat dohledá původní operaci; změnu neopakujte.',
};
const actions: Record<string, string> = {create_room: 'Vytvořit místnost', rename_room: 'Přejmenovat místnost', delete_room: 'Smazat místnost', assign_devices: 'Přesunout zařízení', remove_devices: 'Odřadit zařízení', rename_devices: 'Přejmenovat zařízení'};

export function VoiceRegistryPanel({sessionId}: {sessionId: string | null}) {
  const [view, setView] = useState<View | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setView(null); setFailed(false);
    if (!sessionId) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {const value = await request<View>(`/sessions/${encodeURIComponent(sessionId)}/registry-plan`, 'GET', undefined, abort.signal); if (!abort.signal.aborted) {setView(value); setFailed(false);}}
      catch {if (!abort.signal.aborted) {setView(null); setFailed(true);}}
      if (!abort.signal.aborted) timer = setTimeout(() => {void read();}, 1000);
    };
    void read();
    return () => {abort.abort(); clearTimeout(timer);};
  }, [sessionId]);
  return <section className="voice-registry" aria-label="Návrh správy místností" data-testid="voice-registry">
    <h2>Místnosti a názvy zařízení</h2>
    <p role="status">{!sessionId ? 'Správa je dostupná během hlasového hovoru.' : failed ? 'Přehled návrhu není dostupný. Vyčkejte na ověřený stav hlasového chatu.' : phases[view?.state ?? 'idle'] ?? 'Čekám na ověřený stav návrhu.'}</p>
    {view?.results?.length ? <ul>{view.results.map((result, i) => <li key={i}>{result.action ? actions[result.action] : 'Výsledek'}: {result.old_name ?? result.name ?? result.new_name ?? 'Cíl bez názvu'} — {result.status}</li>)}</ul> : null}
    {view?.plan && <>
      <p>Platnost návrhu do {new Date(view.plan.expires_at).toLocaleTimeString('cs-CZ', {timeZone: 'Europe/Prague'})}. {view.plan.requires_confirmation ? 'Vyžaduje hlasové potvrzení.' : 'Další potvrzení není potřebné.'}</p>
      <ol>{view.plan.changes.map((change, index) => <li key={index}>
        <strong>{actions[change.action] ?? change.action}: </strong>{change.old_name ?? change.name ?? change.new_name}
        {change.row && <> (řádek {change.row}{change.old_location ? `, původní místnost ${change.old_location}` : ', bez přiřazené místnosti'})</>}
        {change.new_name && change.action !== 'create_room' && <> → {change.new_name}</>}
        {change.new_location && <> → {change.new_location}</>}
        {' — '}{change.status === 'planned' ? 'navrženo' : change.status === 'unchanged' ? 'beze změny' : `odmítnuto: ${change.status}`}
        {change.action === 'delete_room' && change.status === 'planned' && <p>Zruší se přiřazení všech členů; zařízení zůstanou zachována. Dotčených schválených zařízení: {change.detached_devices ?? 0}.</p>}
      </li>)}</ol>
    </>}
  </section>;
}
