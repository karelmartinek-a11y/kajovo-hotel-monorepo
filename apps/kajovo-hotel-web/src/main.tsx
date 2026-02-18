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
type LostFoundStatus = 'stored' | 'claimed' | 'returned' | 'disposed';
type LostFoundType = 'lost' | 'found';

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

type LostFoundItem = {
  id: number;
  item_type: LostFoundType;
  description: string;
  category: string;
  location: string;
  event_at: string;
  status: LostFoundStatus;
  claimant_name: string | null;
  claimant_contact: string | null;
  handover_note: string | null;
  claimed_at: string | null;
  returned_at: string | null;
};

type LostFoundPayload = Omit<LostFoundItem, 'id'>;

const requiredStates: ViewState[] = ['default', 'loading', 'empty', 'error', 'offline', 'maintenance', '404'];
const defaultServiceDate = '2026-02-19';

const statusLabels: Record<BreakfastStatus, string> = {
  pending: 'Čeká',
  preparing: 'Připravuje se',
  served: 'Vydáno',
  cancelled: 'Zrušeno',
};

const lostFoundStatusLabels: Record<LostFoundStatus, string> = {
  stored: 'Uloženo',
  claimed: 'Nárokováno',
  returned: 'Vráceno',
  disposed: 'Zlikvidováno',
};

const lostFoundTypeLabels: Record<LostFoundType, string> = {
  lost: 'Ztraceno',
  found: 'Nalezeno',
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

function stateViewForRoute(state: ViewState, title: string, fallbackRoute: string): JSX.Element | null {
  switch (state) {
    case 'loading':
      return <StateView title="Načítání" description={`Připravujeme data modulu ${title}.`} />;
    case 'empty':
      return <StateView title="Prázdný stav" description={`Pro modul ${title} zatím nejsou dostupná data.`} />;
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
  const stateUI = stateViewForRoute(state, 'Přehled', '/');

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
  const stateUI = stateViewForRoute(state, 'Snídaně', '/snidane');
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
  const stateUI = stateViewForRoute(state, 'Snídaně', '/snidane');
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
  const stateUI = stateViewForRoute(state, 'Snídaně', '/snidane');
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

function LostFoundList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Ztráty a nálezy', '/ztraty-a-nalezy');
  const [items, setItems] = React.useState<LostFoundItem[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<'all' | LostFoundStatus>('all');
  const [typeFilter, setTypeFilter] = React.useState<'all' | LostFoundType>('all');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default') {
      return;
    }

    const params = new URLSearchParams();
    if (statusFilter !== 'all') {
      params.set('status', statusFilter);
    }
    if (typeFilter !== 'all') {
      params.set('type', typeFilter);
    }

    const query = params.toString();
    const url = query ? `/api/v1/lost-found?${query}` : '/api/v1/lost-found';
    fetchJson<LostFoundItem[]>(url)
      .then((response) => {
        setItems(response);
        setError(null);
      })
      .catch(() => setError('Nepodařilo se načíst položky ztrát a nálezů.'));
  }, [state, statusFilter, typeFilter]);

  return (
    <main className="k-page" data-testid="lost-found-list-page">
      <h1>Ztráty a nálezy</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} />
      ) : items.length === 0 ? (
        <StateView title="Prázdný stav" description="Zatím není evidována žádná položka." />
      ) : (
        <>
          <div className="k-grid cards-3">
            <Card title="Celkem položek">
              <strong>{items.length}</strong>
            </Card>
            <Card title="Uložené">
              <strong>{items.filter((item) => item.status === 'stored').length}</strong>
            </Card>
            <Card title="Vrácené">
              <strong>{items.filter((item) => item.status === 'returned').length}</strong>
            </Card>
          </div>
          <div className="k-toolbar">
            <select
              className="k-select"
              aria-label="Filtr typu"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as 'all' | LostFoundType)}
            >
              <option value="all">Všechny typy</option>
              <option value="lost">Ztracené</option>
              <option value="found">Nalezené</option>
            </select>
            <select
              className="k-select"
              aria-label="Filtr stavu"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | LostFoundStatus)}
            >
              <option value="all">Všechny stavy</option>
              <option value="stored">Uloženo</option>
              <option value="claimed">Nárokováno</option>
              <option value="returned">Vráceno</option>
              <option value="disposed">Zlikvidováno</option>
            </select>
            <Link className="k-button" to="/ztraty-a-nalezy/novy">
              Nová položka
            </Link>
          </div>
          <DataTable
            headers={['Typ', 'Kategorie', 'Místo', 'Čas', 'Stav', 'Akce']}
            rows={items.map((item) => [
              lostFoundTypeLabels[item.item_type],
              item.category,
              item.location,
              new Date(item.event_at).toLocaleString('cs-CZ'),
              lostFoundStatusLabels[item.status],
              <Link className="k-nav-link" key={item.id} to={`/ztraty-a-nalezy/${item.id}`}>
                Detail
              </Link>,
            ])}
          />
        </>
      )}
    </main>
  );
}

function LostFoundForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Ztráty a nálezy', '/ztraty-a-nalezy');
  const { id } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = React.useState<LostFoundPayload>({
    item_type: 'found',
    description: '',
    category: '',
    location: '',
    event_at: '2026-02-18T10:00:00Z',
    status: 'stored',
    claimant_name: '',
    claimant_contact: '',
    handover_note: '',
    claimed_at: null,
    returned_at: null,
  });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (mode !== 'edit' || state !== 'default' || !id) {
      return;
    }

    fetchJson<LostFoundItem>(`/api/v1/lost-found/${id}`)
      .then((item) => {
        setPayload({
          ...item,
          claimant_name: item.claimant_name ?? '',
          claimant_contact: item.claimant_contact ?? '',
          handover_note: item.handover_note ?? '',
        });
      })
      .catch(() => setError('Položku se nepodařilo načíst.'));
  }, [id, mode, state]);

  const save = async (): Promise<void> => {
    const body: LostFoundPayload = {
      ...payload,
      claimant_name: payload.claimant_name || null,
      claimant_contact: payload.claimant_contact || null,
      handover_note: payload.handover_note || null,
    };

    const target = mode === 'create' ? '/api/v1/lost-found' : `/api/v1/lost-found/${id}`;
    const method = mode === 'create' ? 'POST' : 'PUT';

    try {
      const saved = await fetchJson<LostFoundItem>(target, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      navigate(`/ztraty-a-nalezy/${saved.id}`);
    } catch {
      setError('Položku se nepodařilo uložit.');
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'lost-found-create-page' : 'lost-found-edit-page'}>
      <h1>{mode === 'create' ? 'Nová položka' : 'Upravit položku'}</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/ztraty-a-nalezy">
              Zpět na seznam
            </Link>
            <button className="k-button" type="button" onClick={() => void save()}>
              Uložit
            </button>
          </div>
          <div className="k-form-grid">
            <FormField id="item_type" label="Typ záznamu">
              <select
                id="item_type"
                className="k-select"
                value={payload.item_type}
                onChange={(event) => setPayload((prev) => ({ ...prev, item_type: event.target.value as LostFoundType }))}
              >
                <option value="found">Nalezeno</option>
                <option value="lost">Ztraceno</option>
              </select>
            </FormField>
            <FormField id="category" label="Kategorie">
              <input
                id="category"
                className="k-input"
                value={payload.category}
                onChange={(event) => setPayload((prev) => ({ ...prev, category: event.target.value }))}
              />
            </FormField>
            <FormField id="location" label="Místo nálezu/ztráty">
              <input
                id="location"
                className="k-input"
                value={payload.location}
                onChange={(event) => setPayload((prev) => ({ ...prev, location: event.target.value }))}
              />
            </FormField>
            <FormField id="event_at" label="Datum a čas">
              <input
                id="event_at"
                type="datetime-local"
                className="k-input"
                value={payload.event_at.slice(0, 16)}
                onChange={(event) =>
                  setPayload((prev) => ({ ...prev, event_at: `${event.target.value}:00Z` }))
                }
              />
            </FormField>
            <FormField id="status" label="Stav workflow">
              <select
                id="status"
                className="k-select"
                value={payload.status}
                onChange={(event) =>
                  setPayload((prev) => ({ ...prev, status: event.target.value as LostFoundStatus }))
                }
              >
                <option value="stored">Uloženo</option>
                <option value="claimed">Nárokováno</option>
                <option value="returned">Vráceno</option>
                <option value="disposed">Zlikvidováno</option>
              </select>
            </FormField>
            <FormField id="description" label="Popis položky">
              <textarea
                id="description"
                className="k-textarea"
                rows={3}
                value={payload.description}
                onChange={(event) => setPayload((prev) => ({ ...prev, description: event.target.value }))}
              />
            </FormField>
            <FormField id="claimant_name" label="Jméno nálezce/žadatele (volitelné)">
              <input
                id="claimant_name"
                className="k-input"
                value={payload.claimant_name ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, claimant_name: event.target.value }))}
              />
            </FormField>
            <FormField id="claimant_contact" label="Kontakt (volitelné)">
              <input
                id="claimant_contact"
                className="k-input"
                value={payload.claimant_contact ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, claimant_contact: event.target.value }))}
              />
            </FormField>
            <FormField id="handover_note" label="Předávací záznam (volitelné)">
              <textarea
                id="handover_note"
                className="k-textarea"
                rows={2}
                value={payload.handover_note ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, handover_note: event.target.value }))}
              />
            </FormField>
          </div>
        </div>
      )}
    </main>
  );
}

function LostFoundDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Ztráty a nálezy', '/ztraty-a-nalezy');
  const { id } = useParams();
  const [item, setItem] = React.useState<LostFoundItem | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default' || !id) {
      return;
    }
    fetchJson<LostFoundItem>(`/api/v1/lost-found/${id}`)
      .then((response) => {
        setItem(response);
        setError(null);
      })
      .catch(() => setError('Položka nebyla nalezena.'));
  }, [id, state]);

  return (
    <main className="k-page" data-testid="lost-found-detail-page">
      <h1>Detail položky</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="404" description={error} />
      ) : item ? (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/ztraty-a-nalezy">
              Zpět na seznam
            </Link>
            <Link className="k-button" to={`/ztraty-a-nalezy/${item.id}/edit`}>
              Upravit
            </Link>
          </div>
          <DataTable
            headers={['Položka', 'Hodnota']}
            rows={[
              ['Typ', lostFoundTypeLabels[item.item_type]],
              ['Kategorie', item.category],
              ['Místo', item.location],
              ['Datum a čas', new Date(item.event_at).toLocaleString('cs-CZ')],
              ['Stav', lostFoundStatusLabels[item.status]],
              ['Popis', item.description],
              ['Jméno žadatele', item.claimant_name ?? '-'],
              ['Kontakt', item.claimant_contact ?? '-'],
              ['Předávací záznam', item.handover_note ?? '-'],
            ]}
          />
        </div>
      ) : (
        <StateView title="Načítání" description="Načítáme detail položky." />
      )}
    </main>
  );
}

function GenericModule({ title }: { title: string }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, title, '/');

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
        <Route path="/ztraty-a-nalezy" element={<LostFoundList />} />
        <Route path="/ztraty-a-nalezy/novy" element={<LostFoundForm mode="create" />} />
        <Route path="/ztraty-a-nalezy/:id" element={<LostFoundDetail />} />
        <Route path="/ztraty-a-nalezy/:id/edit" element={<LostFoundForm mode="edit" />} />
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
