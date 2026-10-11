import React, {useEffect, useState} from 'react';
import type {DagmarRequest} from './ports.js';

type Connection = {status: string; owner_confirmation_url?: string | null};
export function SmartPlanPanel({request}: {request: DagmarRequest}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void request<Connection>('/smartplan', 'GET', undefined, abort.signal)
      .then(value => {if (!abort.signal.aborted) setConnection(value);})
      .catch(() => {if (!abort.signal.aborted) setFailed(true);});
    return () => abort.abort();
  }, [request]);
  const update = async (link: boolean) => {
    setBusy(true); setFailed(false);
    try {setConnection(await request<Connection>(link ? '/smartplan/link' : '/smartplan', link ? 'POST' : 'GET'));}
    catch {setFailed(true);} finally {setBusy(false);}
  };
  const url = connection?.owner_confirmation_url;
  const safeUrl = url && /^https:\/\/smartplan\.hcasc\.cz\//.test(url) ? url : null;
  return <section aria-label="SmartPlan" className="voice-registry">
    <h2>Plánované scénáře</h2>
    <p role="status">{failed ? 'Spojení se SmartPlanem není dostupné.' : connection?.status === 'ready' ? 'SmartPlan je propojený s vaším účtem.' : 'Pro stejné scénáře a historii propojte tento hlasový účet ve SmartPlanu.'}</p>
    {connection?.status !== 'ready' && <button className="vc-button" type="button" disabled={busy} onClick={() => {void update(true);}}>Propojit účet SmartPlanu</button>}
    {safeUrl && <p><a href={safeUrl} target="_blank" rel="noopener noreferrer">Přihlásit se a potvrdit propojení ve SmartPlanu</a></p>}
    <button className="vc-button" type="button" disabled={busy} onClick={() => {void update(false);}}>Ověřit propojení</button>
    <p>Po propojení začněte nový hlasový hovor. Odvolání propojení je dostupné v účtu SmartPlanu. Ukončení hovoru neruší běžící scénáře.</p>
  </section>;
}
