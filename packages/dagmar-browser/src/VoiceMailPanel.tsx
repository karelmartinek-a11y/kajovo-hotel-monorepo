import type {DagmarRequest} from './ports.js';
import React, {useEffect, useState} from 'react';
import type {MailView} from './contracts.js';
import './voice-mail.css';

const states: Record<string, string> = {connecting: 'Připojuji e-mail…', ready: 'E-mail je připravený.', degraded: 'E-mail je dostupný s omezením. Výsledky mohou být neúplné.', unavailable: 'E-mail je nedostupný. Běžný rozhovor může pokračovat.'};
const phases: Record<string, string> = {idle: 'Koncept připravíte hlasem.', prepared: 'E-mail je připravený ke čtení.', reading: 'Čtu celý e-mail. Potvrďte hlasem až po dokončení.', awaiting_confirmation: 'Potvrďte odeslání hlasem: ano nebo ne.', confirmed: 'Hlasové potvrzení bylo ověřeno.', sending: 'Odesílání probíhá…', applied: 'Výsledek odeslání oznámí hlasový chat.', refused: 'Odeslání bylo odmítnuto.', ambiguous: 'Odpověď nebyla jednoznačná. Připravte nový návrh.', invalidated: 'Návrh byl zneplatněn. Připravte jej znovu.', expired: 'Návrh vypršel. Připravte jej znovu.', failed: 'Odeslání není potvrzené. Vyčkejte na ověřený stav.', uncertain: 'Výsledek odeslání je nejistý. Chat dohledá původní operaci; neopakujte ji.'};

export function VoiceMailPanel({sessionId,request}: {sessionId: string | null; request:DagmarRequest}) {
  const [view, setView] = useState<MailView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setView(null); setFailed(false);
    if (!sessionId) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {const value = await request<MailView>(`/sessions/${encodeURIComponent(sessionId)}/mail-plan`, 'GET', undefined, abort.signal); if (!abort.signal.aborted) {setView(value); setFailed(false);}}
      catch {if (!abort.signal.aborted) {setView(null); setFailed(true);}}
      if (!abort.signal.aborted) timer = setTimeout(() => {void read();}, 1000);
    };
    void read();
    return () => {abort.abort(); clearTimeout(timer);};
  }, [sessionId,request]);
  const preview = view?.confirmation.preview;
  return <section className="voice-mail" aria-label="E-mail v hlasovém chatu">
    <h2>E-mail</h2>
    <p role="status">{!sessionId ? 'E-mail je dostupný během hlasového hovoru.' : failed ? 'Přehled e-mailu není dostupný. Vyčkejte na ověřený stav.' : states[view?.state ?? 'connecting'] ?? states.unavailable}</p>
    {view?.accounts?.map(account => <p key={account.account}><strong>{account.display_name}: </strong>{account.email} — {account.status === 'healthy' ? 'připraveno' : 'omezená dostupnost'}{!account.configured && ', chybí přihlašovací údaje'}{!account.index_ready && ', index není připravený'}.</p>)}
    {view && <p>{phases[view.confirmation.state] ?? 'Vyčkejte na ověřený stav odeslání.'}</p>}
    {preview && <><dl><dt>Od</dt><dd>{preview.sender}</dd><dt>Komu</dt><dd>{preview.to.join(', ')}</dd><dt>Kopie</dt><dd>{preview.cc.join(', ') || 'žádná'}</dd><dt>Skrytá kopie</dt><dd>{preview.bcc.join(', ') || 'žádná'}</dd><dt>Předmět</dt><dd>{preview.subject}</dd></dl><p className="voice-mail-body">{preview.text_body}</p><p>Platnost do {new Date(preview.expires_at).toLocaleTimeString('cs-CZ', {timeZone: 'Europe/Prague'})}. Potvrzujte hlasem po přečtení celého e-mailu.</p></>}
  </section>;
}
