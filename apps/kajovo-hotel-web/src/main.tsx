import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom';
import ia from '../../kajovo-hotel/ux/ia.json';
import { AppShell, Card, DataTable, FormField, StateView } from '@kajovo/ui';
import '@kajovo/ui/src/tokens.css';

type ViewState = 'default' | 'loading' | 'empty' | 'error' | 'offline' | 'maintenance' | '404';

const requiredStates: ViewState[] = ['default', 'loading', 'empty', 'error', 'offline', 'maintenance', '404'];

const breakfastItems = [
  { id: 'sn-101', room: '101', guest: 'Novák', status: 'Připraveno', note: 'Bez lepku' },
  { id: 'sn-102', room: '205', guest: 'Svoboda', status: 'Čeká', note: 'Vegetariánské' },
  { id: 'sn-103', room: '307', guest: 'Kučera', status: 'Vydáno', note: 'Standard' },
];

function useViewState(): ViewState {
  const [params] = useSearchParams();
  const input = params.get('state') as ViewState | null;
  return input && requiredStates.includes(input) ? input : 'default';
}

function renderState(state: ViewState): JSX.Element | null {
  switch (state) {
    case 'loading':
      return <StateView title="Načítání" description="Připravujeme data modulu." />;
    case 'empty':
      return <StateView title="Prázdný stav" description="Zatím zde nejsou žádná data." />;
    case 'error':
      return <StateView title="Chyba" description="Nastala chyba. Zkuste akci opakovat." action={<button className="k-button">Obnovit</button>} />;
    case 'offline':
      return <StateView title="Offline" description="Aplikace je dočasně bez připojení." />;
    case 'maintenance':
      return <StateView title="Údržba" description="Služba je v režimu údržby." />;
    case '404':
      return <StateView title="404" description="Požadovaný obsah nebyl nalezen." action={<Link className="k-nav-link" to="/">Zpět na přehled</Link>} />;
    default:
      return null;
  }
}

function StateSwitcher(): JSX.Element {
  return (
    <div className="k-toolbar">
      <span>Stavy view:</span>
      <div className="k-inline-links">
        {requiredStates.map((state) => (
          <Link key={state} className="k-nav-link" to={`?state=${state}`}>
            {state}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Dashboard(): JSX.Element {
  const state = useViewState();
  const stateUI = renderState(state);

  return (
    <main className="k-page" data-testid="dashboard-page">
      <h1>Přehled</h1>
      <StateSwitcher />
      {stateUI ?? (
        <div className="k-grid cards-3">
          <Card title="Snídaně dnes">
            <strong>18</strong>
            <p>3 čekající objednávky</p>
          </Card>
          <Card title="Závady">
            <strong>4</strong>
            <p>1 kritická závada</p>
          </Card>
          <Card title="Sklad">
            <strong>12</strong>
            <p>2 položky pod minimem</p>
          </Card>
        </div>
      )}
    </main>
  );
}

function BreakfastList(): JSX.Element {
  const state = useViewState();
  const stateUI = renderState(state);

  return (
    <main className="k-page" data-testid="breakfast-list-page">
      <h1>Snídaně</h1>
      <StateSwitcher />
      {stateUI ?? (
        <>
          <div className="k-toolbar">
            <input className="k-input" placeholder="Hledat dle pokoje nebo hosta" aria-label="Hledat" />
            <button className="k-button">Nová objednávka</button>
          </div>
          <DataTable
            headers={['Pokoj', 'Host', 'Stav', 'Poznámka', 'Akce']}
            rows={breakfastItems.map((item) => [
              item.room,
              item.guest,
              item.status,
              item.note,
              <Link className="k-nav-link" to={`/snidane/${item.id}`} key={item.id}>
                Detail
              </Link>,
            ])}
          />
        </>
      )}
    </main>
  );
}

function BreakfastDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = renderState(state);
  const { id } = useParams();
  const item = breakfastItems.find((breakfast) => breakfast.id === id);

  return (
    <main className="k-page" data-testid="breakfast-detail-page">
      <h1>Detail snídaně</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : item ? (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/snidane">
              Zpět na seznam
            </Link>
            <button className="k-button">Uložit změny</button>
          </div>
          <div className="k-form-grid">
            <FormField id="room" label="Pokoj">
              <input id="room" defaultValue={item.room} className="k-input" />
            </FormField>
            <FormField id="guest" label="Host">
              <input id="guest" defaultValue={item.guest} className="k-input" />
            </FormField>
            <FormField id="status" label="Stav">
              <select id="status" defaultValue={item.status} className="k-select">
                <option>Připraveno</option>
                <option>Čeká</option>
                <option>Vydáno</option>
              </select>
            </FormField>
            <FormField id="note" label="Poznámka">
              <textarea id="note" defaultValue={item.note} className="k-textarea" rows={3} />
            </FormField>
          </div>
        </div>
      ) : (
        <StateView title="404" description="Objednávka snídaně neexistuje." />
      )}
    </main>
  );
}

function GenericModule({ title }: { title: string }): JSX.Element {
  const state = useViewState();
  const stateUI = renderState(state);

  return (
    <main className="k-page">
      <h1>{title}</h1>
      <StateSwitcher />
      {stateUI ?? <StateView title={`${title} připraveno`} description="Modul je připraven na implementaci workflow." />}
    </main>
  );
}

function UtilityStatePage({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <main className="k-page">
      <StateView title={title} description={description} />
    </main>
  );
}

function AppRoutes(): JSX.Element {
  const location = useLocation();
  const modules = ia.modules;

  return (
    <AppShell modules={modules} navigationRules={ia.navigation.rules} currentPath={location.pathname}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/snidane" element={<BreakfastList />} />
        <Route path="/snidane/:id" element={<BreakfastDetail />} />
        <Route path="/ztraty-a-nalezy" element={<GenericModule title="Ztráty a nálezy" />} />
        <Route path="/zavady" element={<GenericModule title="Závady" />} />
        <Route path="/sklad" element={<GenericModule title="Skladové hospodářství" />} />
        <Route path="/offline" element={<UtilityStatePage title="Offline" description="Aplikace je bez připojení." />} />
        <Route path="/maintenance" element={<UtilityStatePage title="Maintenance" description="Probíhá údržba systému." />} />
        <Route path="/404" element={<UtilityStatePage title="404" description="Stránka nebyla nalezena." />} />
        <Route path="/dalsi" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </AppShell>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </React.StrictMode>,
);
