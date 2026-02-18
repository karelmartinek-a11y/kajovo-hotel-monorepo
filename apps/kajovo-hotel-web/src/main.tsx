import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import ia from '../../kajovo-hotel/ux/ia.json';
import { AppShell, Card, DataTable, FormField, StateView } from '@kajovo/ui';
import '@kajovo/ui/src/tokens.css';

type ViewState = 'default' | 'loading' | 'empty' | 'error' | 'offline' | 'maintenance' | '404';
type BreakfastStatus = 'pending' | 'preparing' | 'served' | 'cancelled';

type BreakfastOrder = {
  id: number;
  service_date: string;
  room_number: string;
  guest_name: string;
  guest_count: number;
  status: BreakfastStatus;
  note: string | null;
};

type BreakfastPayload = Omit<BreakfastOrder, 'id'>;

type BreakfastSummary = {
  service_date: string;
  total_orders: number;
  total_guests: number;
  status_counts: Record<BreakfastStatus, number>;
};

const requiredStates: ViewState[] = ['default', 'loading', 'empty', 'error', 'offline', 'maintenance', '404'];
const defaultServiceDate = '2026-02-19';

const statusLabels: Record<BreakfastStatus, string> = {
  pending: 'Čeká',
  preparing: 'Připravuje se',
  served: 'Vydáno',
  cancelled: 'Zrušeno',
};

const stateLabels: Record<ViewState, string> = {
  default: 'Výchozí',
  loading: 'Načítání',
  empty: 'Prázdno',
  error: 'Chyba',
  offline: 'Offline',
  maintenance: 'Údržba',
  '404': '404',
};

function useViewState(): ViewState {
  const [params] = useSearchParams();
  const input = params.get('state') as ViewState | null;
  return input && requiredStates.includes(input) ? input : 'default';
}

function stateViewForRoute(state: ViewState, fallbackRoute: string): JSX.Element | null {
  switch (state) {
    case 'loading':
      return <StateView title="Načítání" description="Připravujeme data modulu Snídaně." />;
    case 'empty':
      return <StateView title="Prázdný stav" description="Pro zvolený den zatím nejsou objednávky." />;
    case 'error':
      return (
        <StateView
          title="Chyba"
          description="Nepodařilo se načíst data. Zkuste stránku obnovit."
          action={<button className="k-button">Obnovit</button>}
        />
      );
    case 'offline':
      return <StateView title="Offline" description="Aplikace je dočasně bez připojení." />;
    case 'maintenance':
      return <StateView title="Údržba" description="Modul je dočasně v režimu údržby." />;
    case '404':
      return (
        <StateView
          title="404"
          description="Požadovaný obsah nebyl nalezen."
          action={
            <Link className="k-nav-link" to={fallbackRoute}>
              Zpět
            </Link>
          }
        />
      );
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
            {stateLabels[state]}
          </Link>
        ))}
      </div>
    </div>
  );
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error('API request failed');
  }
  return (await response.json()) as T;
}

function Dashboard(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, '/');

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
  const stateUI = stateViewForRoute(state, '/snidane');
  const [items, setItems] = React.useState<BreakfastOrder[]>([]);
  const [summary, setSummary] = React.useState<BreakfastSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    if (state !== 'default') {
      return;
    }

    let active = true;
    Promise.all([
      fetchJson<BreakfastOrder[]>(`/api/v1/breakfast?service_date=${defaultServiceDate}`),
      fetchJson<BreakfastSummary>(`/api/v1/breakfast/daily-summary?service_date=${defaultServiceDate}`),
    ])
      .then(([orders, dailySummary]) => {
        if (!active) {
          return;
        }
        setItems(orders);
        setSummary(dailySummary);
        setError(null);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setError('Nepodařilo se načíst seznam snídaní.');
      });

    return () => {
      active = false;
    };
  }, [state]);

  const filteredItems = items.filter((item) => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return true;
    }
    return item.room_number.toLowerCase().includes(term) || item.guest_name.toLowerCase().includes(term);
  });

  return (
    <main className="k-page" data-testid="breakfast-list-page">
      <h1>Snídaně</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} />
      ) : filteredItems.length === 0 ? (
        <StateView title="Prázdný stav" description="Nebyly nalezeny žádné objednávky." />
      ) : (
        <>
          <div className="k-grid cards-3">
            <Card title="Objednávky dne">
              <strong>{summary?.total_orders ?? 0}</strong>
            </Card>
            <Card title="Hosté dne">
              <strong>{summary?.total_guests ?? 0}</strong>
            </Card>
            <Card title="Čekající">
              <strong>{summary?.status_counts.pending ?? 0}</strong>
            </Card>
          </div>
          <div className="k-toolbar">
            <input
              className="k-input"
              placeholder="Hledat dle pokoje nebo hosta"
              aria-label="Hledat"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Link className="k-button" to="/snidane/nova">
              Nová objednávka
            </Link>
          </div>
          <DataTable
            headers={['Datum', 'Pokoj', 'Host', 'Počet', 'Stav', 'Poznámka', 'Akce']}
            rows={filteredItems.map((item) => [
              item.service_date,
              item.room_number,
              item.guest_name,
              item.guest_count,
              statusLabels[item.status],
              item.note ?? '-',
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

function BreakfastForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, '/snidane');
  const navigate = useNavigate();
  const { id } = useParams();
  const [payload, setPayload] = React.useState<BreakfastPayload>({
    service_date: defaultServiceDate,
    room_number: '',
    guest_name: '',
    guest_count: 1,
    status: 'pending',
    note: '',
  });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (mode !== 'edit' || state !== 'default' || !id) {
      return;
    }

    fetchJson<BreakfastOrder>(`/api/v1/breakfast/${id}`)
      .then((order) => {
        setPayload({
          service_date: order.service_date,
          room_number: order.room_number,
          guest_name: order.guest_name,
          guest_count: order.guest_count,
          status: order.status,
          note: order.note ?? '',
        });
      })
      .catch(() => {
        setError('Objednávku se nepodařilo načíst.');
      });
  }, [id, mode, state]);

  const save = async (): Promise<void> => {
    setError(null);
    const body: BreakfastPayload = {
      ...payload,
      note: payload.note ? payload.note : null,
    };

    const init: RequestInit = {
      method: mode === 'create' ? 'POST' : 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    };

    const target = mode === 'create' ? '/api/v1/breakfast' : `/api/v1/breakfast/${id}`;

    try {
      const saved = await fetchJson<BreakfastOrder>(target, init);
      navigate(`/snidane/${saved.id}`);
    } catch {
      setError('Objednávku se nepodařilo uložit.');
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'breakfast-create-page' : 'breakfast-edit-page'}>
      <h1>{mode === 'create' ? 'Nová snídaně' : 'Upravit snídani'}</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/snidane">
              Zpět na seznam
            </Link>
            <button className="k-button" type="button" onClick={() => void save()}>
              Uložit
            </button>
          </div>
          <div className="k-form-grid">
            <FormField id="service_date" label="Datum služby">
              <input
                id="service_date"
                type="date"
                className="k-input"
                value={payload.service_date}
                onChange={(event) => setPayload((prev) => ({ ...prev, service_date: event.target.value }))}
              />
            </FormField>
            <FormField id="room_number" label="Pokoj">
              <input
                id="room_number"
                className="k-input"
                value={payload.room_number}
                onChange={(event) => setPayload((prev) => ({ ...prev, room_number: event.target.value }))}
              />
            </FormField>
            <FormField id="guest_name" label="Host">
              <input
                id="guest_name"
                className="k-input"
                value={payload.guest_name}
                onChange={(event) => setPayload((prev) => ({ ...prev, guest_name: event.target.value }))}
              />
            </FormField>
            <FormField id="guest_count" label="Počet hostů">
              <input
                id="guest_count"
                type="number"
                min={1}
                className="k-input"
                value={payload.guest_count}
                onChange={(event) =>
                  setPayload((prev) => ({ ...prev, guest_count: Number(event.target.value) || 1 }))
                }
              />
            </FormField>
            <FormField id="status" label="Stav">
              <select
                id="status"
                className="k-select"
                value={payload.status}
                onChange={(event) =>
                  setPayload((prev) => ({ ...prev, status: event.target.value as BreakfastStatus }))
                }
              >
                <option value="pending">Čeká</option>
                <option value="preparing">Připravuje se</option>
                <option value="served">Vydáno</option>
                <option value="cancelled">Zrušeno</option>
              </select>
            </FormField>
            <FormField id="note" label="Poznámka">
              <textarea
                id="note"
                className="k-textarea"
                rows={3}
                value={payload.note ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, note: event.target.value }))}
              />
            </FormField>
          </div>
        </div>
      )}
    </main>
  );
}

function BreakfastDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, '/snidane');
  const { id } = useParams();
  const [item, setItem] = React.useState<BreakfastOrder | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default' || !id) {
      return;
    }

    fetchJson<BreakfastOrder>(`/api/v1/breakfast/${id}`)
      .then((order) => {
        setItem(order);
        setNotFound(false);
      })
      .catch(() => {
        setNotFound(true);
        setError('Objednávka nebyla nalezena.');
      });
  }, [id, state]);

  return (
    <main className="k-page" data-testid="breakfast-detail-page">
      <h1>Detail snídaně</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : notFound ? (
        <StateView title="404" description={error ?? 'Objednávka neexistuje.'} />
      ) : item ? (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/snidane">
              Zpět na seznam
            </Link>
            <Link className="k-button" to={`/snidane/${item.id}/edit`}>
              Upravit
            </Link>
          </div>
          <DataTable
            headers={['Položka', 'Hodnota']}
            rows={[
              ['Datum služby', item.service_date],
              ['Pokoj', item.room_number],
              ['Host', item.guest_name],
              ['Počet hostů', item.guest_count],
              ['Stav', statusLabels[item.status]],
              ['Poznámka', item.note ?? '-'],
            ]}
          />
        </div>
      ) : (
        <StateView title="Načítání" description="Načítáme detail objednávky." />
      )}
    </main>
  );
}

function GenericModule({ title }: { title: string }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, '/');

  return (
    <main className="k-page">
      <h1>{title}</h1>
      <StateSwitcher />
      {stateUI ?? <StateView title={`${title} připraveno`} description="Modul je připraven na workflow." />}
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
        <Route path="/snidane/nova" element={<BreakfastForm mode="create" />} />
        <Route path="/snidane/:id" element={<BreakfastDetail />} />
        <Route path="/snidane/:id/edit" element={<BreakfastForm mode="edit" />} />
        <Route path="/ztraty-a-nalezy" element={<GenericModule title="Ztráty a nálezy" />} />
        <Route path="/zavady" element={<GenericModule title="Závady" />} />
        <Route path="/sklad" element={<GenericModule title="Skladové hospodářství" />} />
        <Route path="/offline" element={<UtilityStatePage title="Offline" description="Aplikace je bez připojení." />} />
        <Route
          path="/maintenance"
          element={<UtilityStatePage title="Maintenance" description="Probíhá údržba systému." />}
        />
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
