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
import { AppShell, Badge, Card, DataTable, FormField, SkeletonPage, StateView, Timeline } from '@kajovo/ui';
import {
  apiClient,
  type BreakfastDailySummary,
  type BreakfastOrderCreate,
  type BreakfastOrderRead,
  type BreakfastStatus,
  type InventoryItemCreate,
  type InventoryItemRead,
  type InventoryItemWithAuditRead,
  type InventoryMovementRead,
  type InventoryMovementType,
  type IssueCreate,
  type IssuePriority,
  type IssueRead,
  type IssueStatus,
  type LostFoundItemCreate,
  type LostFoundItemRead,
  type LostFoundItemType,
  type LostFoundStatus,
  type ReportCreate,
  type ReportRead,
} from '@kajovo/shared';
import '@kajovo/ui/src/tokens.css';

type ViewState = 'default' | 'loading' | 'empty' | 'error' | 'offline' | 'maintenance' | '404';
type LostFoundType = LostFoundItemType;

type BreakfastOrder = BreakfastOrderRead;

type BreakfastPayload = BreakfastOrderCreate;

type BreakfastSummary = BreakfastDailySummary;

type LostFoundItem = LostFoundItemRead;

type LostFoundPayload = LostFoundItemCreate;


type Issue = IssueRead;

type IssuePayload = IssueCreate;


type InventoryItem = InventoryItemRead;

type InventoryMovement = InventoryMovementRead;



type InventoryDetail = InventoryItemWithAuditRead;

type InventoryItemPayload = InventoryItemCreate;

type ReportStatus = 'open' | 'in_progress' | 'closed';

type Report = ReportRead;

type ReportPayload = ReportCreate;


type ErrorBoundaryProps = { children: React.ReactNode };
type ErrorBoundaryState = { hasError: boolean; message?: string };

class ClientErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const payload = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      path: window.location.pathname,
      timestamp: new Date().toISOString(),
    };
    console.error('client.error_boundary', payload);

    const endpoint = (window as Window & { __KAJOVO_ERROR_ENDPOINT__?: string }).__KAJOVO_ERROR_ENDPOINT__;
    if (endpoint) {
      void fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        console.warn('client.error_boundary.report_failed');
      });
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <main className="k-page">
          <StateView
            title="Chyba"
            description={this.state.message ?? 'Aplikace narazila na neočekávanou chybu.'}
            stateKey="error"
            action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>}
          />
        </main>
      );
    }
    return this.props.children;
  }
}

const requiredStates: ViewState[] = ['default', 'loading', 'empty', 'error', 'offline', 'maintenance', '404'];
const defaultServiceDate = '2026-02-19';


const IntroRoute = React.lazy(async () => {
  const module = await import('./routes/utilityStates');
  return { default: module.IntroRoute };
});

const OfflineRoute = React.lazy(async () => {
  const module = await import('./routes/utilityStates');
  return { default: module.OfflineRoute };
});

const MaintenanceRoute = React.lazy(async () => {
  const module = await import('./routes/utilityStates');
  return { default: module.MaintenanceRoute };
});

const NotFoundRoute = React.lazy(async () => {
  const module = await import('./routes/utilityStates');
  return { default: module.NotFoundRoute };
});


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

const issuePriorityLabels: Record<IssuePriority, string> = {
  low: 'Nízká',
  medium: 'Střední',
  high: 'Vysoká',
  critical: 'Kritická',
};

const issueStatusLabels: Record<IssueStatus, string> = {
  new: 'Nová',
  in_progress: 'V řešení',
  resolved: 'Vyřešena',
  closed: 'Uzavřena',
};

const reportStatusLabels: Record<ReportStatus, string> = {
  open: 'Otevřené',
  in_progress: 'V řešení',
  closed: 'Uzavřené',
};


const inventoryMovementLabels: Record<InventoryMovementType, string> = {
  in: 'Naskladnění',
  out: 'Výdej',
  adjust: 'Úprava',
};



function breakfastStatusLabel(status: BreakfastStatus | null | undefined): string {
  return status ? statusLabels[status] : '-';
}

function lostFoundStatusLabel(status: LostFoundStatus | null | undefined): string {
  return status ? lostFoundStatusLabels[status] : '-';
}

function lostFoundTypeLabel(itemType: LostFoundType | null | undefined): string {
  return itemType ? lostFoundTypeLabels[itemType] : '-';
}

function issuePriorityLabel(priority: IssuePriority | null | undefined): string {
  return priority ? issuePriorityLabels[priority] : '-';
}

function issueStatusLabel(status: IssueStatus | null | undefined): string {
  return status ? issueStatusLabels[status] : '-';
}

function inventoryMovementLabel(movementType: InventoryMovementType | null | undefined): string {
  return movementType ? inventoryMovementLabels[movementType] : '-';
}

function reportStatusLabel(status: string | null | undefined): string {
  if (status === 'open' || status === 'in_progress' || status === 'closed') {
    return reportStatusLabels[status];
  }
  return status ?? '-';
}

function getSummaryCount(summary: BreakfastSummary | null, status: BreakfastStatus): number {
  const value = summary?.status_counts?.[status];
  return typeof value === 'number' ? value : 0;
}
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
      return <SkeletonPage />;
    case 'empty':
      return (
        <StateView
          title="Prázdný stav"
          description={`Pro modul ${title} zatím nejsou dostupná data.`}
          stateKey="empty"
          action={<Link className="k-button secondary" to={fallbackRoute}>Obnovit data</Link>}
        />
      );
    case 'error':
      return (
        <StateView
          title="Chyba"
          description="Nepodařilo se načíst data. Zkuste stránku obnovit."
          stateKey="error"
          action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>}
        />
      );
    case 'offline':
      return (
        <StateView
          title="Offline"
          description="Aplikace je dočasně bez připojení."
          stateKey="offline"
          action={<Link className="k-button secondary" to="/offline">Diagnostika připojení</Link>}
        />
      );
    case 'maintenance':
      return (
        <StateView
          title="Údržba"
          description="Modul je dočasně v režimu údržby."
          stateKey="maintenance"
          action={<Link className="k-button secondary" to="/maintenance">Zobrazit status</Link>}
        />
      );
    case '404':
      return (
        <StateView
          title="404"
          description="Požadovaný obsah nebyl nalezen."
          stateKey="404"
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
  const method = init?.method ?? 'GET';
  const url = new URL(input, window.location.origin);
  const path = url.pathname;
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;

  if (path === '/api/v1/breakfast' && method === 'GET') return (await apiClient.listBreakfastOrdersApiV1BreakfastGet({ service_date: url.searchParams.get('service_date'), status: url.searchParams.get('status') as BreakfastStatus | null })) as T;
  if (path === '/api/v1/breakfast/daily-summary' && method === 'GET') return (await apiClient.getDailySummaryApiV1BreakfastDailySummaryGet({ service_date: url.searchParams.get('service_date') ?? '' })) as T;
  const breakfastId = path.match(/^\/api\/v1\/breakfast\/(\d+)$/);
  if (breakfastId && method === 'GET') return (await apiClient.getBreakfastOrderApiV1BreakfastOrderIdGet(Number(breakfastId[1]))) as T;
  if (breakfastId && method === 'PUT') return (await apiClient.updateBreakfastOrderApiV1BreakfastOrderIdPut(Number(breakfastId[1]), body as BreakfastOrderCreate)) as T;
  if (path === '/api/v1/breakfast' && method === 'POST') return (await apiClient.createBreakfastOrderApiV1BreakfastPost(body as BreakfastOrderCreate)) as T;

  if (path === '/api/v1/lost-found' && method === 'GET') return (await apiClient.listLostFoundItemsApiV1LostFoundGet({ type: url.searchParams.get('type') as LostFoundItemType | null, status: url.searchParams.get('status') as LostFoundStatus | null, category: url.searchParams.get('category') })) as T;
  const lostFoundId = path.match(/^\/api\/v1\/lost-found\/(\d+)$/);
  if (lostFoundId && method === 'GET') return (await apiClient.getLostFoundItemApiV1LostFoundItemIdGet(Number(lostFoundId[1]))) as T;
  if (lostFoundId && method === 'PUT') return (await apiClient.updateLostFoundItemApiV1LostFoundItemIdPut(Number(lostFoundId[1]), body as LostFoundItemCreate)) as T;
  if (path === '/api/v1/lost-found' && method === 'POST') return (await apiClient.createLostFoundItemApiV1LostFoundPost(body as LostFoundItemCreate)) as T;

  if (path === '/api/v1/issues' && method === 'GET') return (await apiClient.listIssuesApiV1IssuesGet({ priority: url.searchParams.get('priority') as IssuePriority | null, status: url.searchParams.get('status') as IssueStatus | null, location: url.searchParams.get('location'), room_number: url.searchParams.get('room_number') })) as T;
  const issueId = path.match(/^\/api\/v1\/issues\/(\d+)$/);
  if (issueId && method === 'GET') return (await apiClient.getIssueApiV1IssuesIssueIdGet(Number(issueId[1]))) as T;
  if (issueId && method === 'PUT') return (await apiClient.updateIssueApiV1IssuesIssueIdPut(Number(issueId[1]), body as IssueCreate)) as T;
  if (path === '/api/v1/issues' && method === 'POST') return (await apiClient.createIssueApiV1IssuesPost(body as IssueCreate)) as T;

  if (path === '/api/v1/inventory' && method === 'GET') return (await apiClient.listItemsApiV1InventoryGet({ low_stock: false })) as T;
  const inventoryId = path.match(/^\/api\/v1\/inventory\/(\d+)$/);
  if (inventoryId && method === 'GET') return (await apiClient.getItemApiV1InventoryItemIdGet(Number(inventoryId[1]))) as T;
  if (inventoryId && method === 'PUT') return (await apiClient.updateItemApiV1InventoryItemIdPut(Number(inventoryId[1]), body as InventoryItemCreate)) as T;
  if (path === '/api/v1/inventory' && method === 'POST') return (await apiClient.createItemApiV1InventoryPost(body as InventoryItemCreate)) as T;
  const inventoryMoveId = path.match(/^\/api\/v1\/inventory\/(\d+)\/movements$/);
  if (inventoryMoveId && method === 'POST') return (await apiClient.addMovementApiV1InventoryItemIdMovementsPost(Number(inventoryMoveId[1]), body as { movement_type: InventoryMovementType; quantity: number; note?: string | null })) as T;

  if (path === '/api/v1/reports' && method === 'GET') return (await apiClient.listReportsApiV1ReportsGet({ status: url.searchParams.get('status') })) as T;
  const reportId = path.match(/^\/api\/v1\/reports\/(\d+)$/);
  if (reportId && method === 'GET') return (await apiClient.getReportApiV1ReportsReportIdGet(Number(reportId[1]))) as T;
  if (reportId && method === 'PUT') return (await apiClient.updateReportApiV1ReportsReportIdPut(Number(reportId[1]), body as ReportCreate)) as T;
  if (path === '/api/v1/reports' && method === 'POST') return (await apiClient.createReportApiV1ReportsPost(body as ReportCreate)) as T;

  throw new Error(`Unsupported API call: ${method} ${path}`);
}


function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString('cs-CZ');
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
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : filteredItems.length === 0 ? (
        <StateView title="Prázdný stav" description="Nebyly nalezeny žádné objednávky." stateKey="empty" action={<Link className="k-button" to="/snidane/nova">Nová objednávka</Link>} />
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
              <strong>{getSummaryCount(summary, 'pending')}</strong>
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
              breakfastStatusLabel(item.status),
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
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
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
        <StateView title="404" description={error ?? 'Objednávka neexistuje.'} stateKey="404" action={<Link className="k-button secondary" to="/snidane">Zpět na seznam</Link>} />
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
              ['Stav', breakfastStatusLabel(item.status)],
              ['Poznámka', item.note ?? '-'],
            ]}
          />
        </div>
      ) : (
        <SkeletonPage />
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
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : items.length === 0 ? (
        <StateView title="Prázdný stav" description="Zatím není evidována žádná položka." stateKey="empty" action={<Link className="k-button" to="/ztraty-a-nalezy/novy">Přidat záznam</Link>} />
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
              lostFoundTypeLabel(item.item_type),
              item.category,
              item.location,
              new Date(item.event_at).toLocaleString('cs-CZ'),
              lostFoundStatusLabel(item.status),
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
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
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
              ['Typ', lostFoundTypeLabel(item.item_type)],
              ['Kategorie', item.category],
              ['Místo', item.location],
              ['Datum a čas', new Date(item.event_at).toLocaleString('cs-CZ')],
              ['Stav', lostFoundStatusLabel(item.status)],
              ['Popis', item.description],
              ['Jméno žadatele', item.claimant_name ?? '-'],
              ['Kontakt', item.claimant_contact ?? '-'],
              ['Předávací záznam', item.handover_note ?? '-'],
            ]}
          />
        </div>
      ) : (
        <SkeletonPage />
      )}
    </main>
  );
}


function IssuesList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Závady', '/zavady');
  const [items, setItems] = React.useState<Issue[]>([]);
  const [priorityFilter, setPriorityFilter] = React.useState<'all' | IssuePriority>('all');
  const [statusFilter, setStatusFilter] = React.useState<'all' | IssueStatus>('all');
  const [locationFilter, setLocationFilter] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default') return;
    const params = new URLSearchParams();
    if (priorityFilter !== 'all') params.set('priority', priorityFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (locationFilter.trim()) params.set('location', locationFilter.trim());
    const query = params.toString();
    fetchJson<Issue[]>(query ? `/api/v1/issues?${query}` : '/api/v1/issues')
      .then((response) => { setItems(response); setError(null); })
      .catch(() => setError('Nepodařilo se načíst seznam závad.'));
  }, [locationFilter, priorityFilter, state, statusFilter]);

  return (
    <main className="k-page" data-testid="issues-list-page">
      <h1>Závady</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? (
        <StateView title="Prázdný stav" description="Zatím nejsou evidované žádné závady." stateKey="empty" action={<Link className="k-button" to="/zavady/nova">Nahlásit závadu</Link>} />
      ) : (
        <>
          <div className="k-toolbar">
            <select className="k-select" aria-label="Filtr priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as 'all' | IssuePriority)}>
              <option value="all">Všechny priority</option><option value="low">Nízká</option><option value="medium">Střední</option><option value="high">Vysoká</option><option value="critical">Kritická</option>
            </select>
            <select className="k-select" aria-label="Filtr stavu" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | IssueStatus)}>
              <option value="all">Všechny stavy</option><option value="new">Nová</option><option value="in_progress">V řešení</option><option value="resolved">Vyřešena</option><option value="closed">Uzavřena</option>
            </select>
            <input className="k-input" aria-label="Filtr lokace" placeholder="Lokalita" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} />
            <Link className="k-button" to="/zavady/nova">Nová závada</Link>
          </div>
          <DataTable headers={['Název', 'Lokace', 'Pokoj', 'Priorita', 'Stav', 'Přiřazeno', 'Akce']} rows={items.map((item) => [
            item.title, item.location, item.room_number ?? '-', issuePriorityLabel(item.priority), issueStatusLabel(item.status), item.assignee ?? '-',
            <Link className="k-nav-link" key={item.id} to={`/zavady/${item.id}`}>Detail</Link>,
          ])} />
        </>
      )}
    </main>
  );
}

function IssuesForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Závady', '/zavady');
  const { id } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = React.useState<IssuePayload>({
    title: '', description: '', location: '', room_number: '', priority: 'medium', status: 'new', assignee: '',
  });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (mode !== 'edit' || state !== 'default' || !id) return;
    fetchJson<Issue>(`/api/v1/issues/${id}`).then((item) => setPayload({
      title: item.title, description: item.description ?? '', location: item.location, room_number: item.room_number ?? '', priority: item.priority, status: item.status, assignee: item.assignee ?? '',
    })).catch(() => setError('Závadu se nepodařilo načíst.'));
  }, [id, mode, state]);

  const save = async (): Promise<void> => {
    try {
      const saved = await fetchJson<Issue>(mode === 'create' ? '/api/v1/issues' : `/api/v1/issues/${id}`, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, description: payload.description || null, room_number: payload.room_number || null, assignee: payload.assignee || null }),
      });
      navigate(`/zavady/${saved.id}`);
    } catch { setError('Závadu se nepodařilo uložit.'); }
  };

  return <main className="k-page" data-testid={mode === 'create' ? 'issues-create-page' : 'issues-edit-page'}><h1>{mode === 'create' ? 'Nová závada' : 'Upravit závadu'}</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">Zpět na seznam</Link><button className="k-button" type="button" onClick={() => void save()}>Uložit</button></div><div className="k-form-grid">
<FormField id="issue_title" label="Název"><input id="issue_title" className="k-input" value={payload.title} onChange={(e) => setPayload((prev) => ({ ...prev, title: e.target.value }))} /></FormField>
<FormField id="issue_location" label="Lokalita"><input id="issue_location" className="k-input" value={payload.location} onChange={(e) => setPayload((prev) => ({ ...prev, location: e.target.value }))} /></FormField>
<FormField id="issue_room_number" label="Pokoj (volitelné)"><input id="issue_room_number" className="k-input" value={payload.room_number ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, room_number: e.target.value }))} /></FormField>
<FormField id="issue_priority" label="Priorita"><select id="issue_priority" className="k-select" value={payload.priority} onChange={(e) => setPayload((prev) => ({ ...prev, priority: e.target.value as IssuePriority }))}><option value="low">Nízká</option><option value="medium">Střední</option><option value="high">Vysoká</option><option value="critical">Kritická</option></select></FormField>
<FormField id="issue_status" label="Stav"><select id="issue_status" className="k-select" value={payload.status} onChange={(e) => setPayload((prev) => ({ ...prev, status: e.target.value as IssueStatus }))}><option value="new">Nová</option><option value="in_progress">V řešení</option><option value="resolved">Vyřešena</option><option value="closed">Uzavřena</option></select></FormField>
<FormField id="issue_assignee" label="Přiřazeno (volitelné)"><input id="issue_assignee" className="k-input" value={payload.assignee ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, assignee: e.target.value }))} /></FormField>
<FormField id="issue_description" label="Popis"><textarea id="issue_description" className="k-textarea" rows={3} value={payload.description ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} /></FormField>
</div></div>}</main>;
}

function IssuesDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Závady', '/zavady');
  const { id } = useParams();
  const [item, setItem] = React.useState<Issue | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default' || !id) return;
    fetchJson<Issue>(`/api/v1/issues/${id}`).then((response) => { setItem(response); setError(null); }).catch(() => setError('Závada nebyla nalezena.'));
  }, [id, state]);

  const timeline = item ? [
    { label: 'Vytvořeno', value: formatDateTime(item.created_at) },
    ...(item.in_progress_at ? [{ label: 'V řešení', value: new Date(item.in_progress_at).toLocaleString('cs-CZ') }] : []),
    ...(item.resolved_at ? [{ label: 'Vyřešeno', value: new Date(item.resolved_at).toLocaleString('cs-CZ') }] : []),
    ...(item.closed_at ? [{ label: 'Uzavřeno', value: new Date(item.closed_at).toLocaleString('cs-CZ') }] : []),
  ] : [];

  return (
    <main className="k-page" data-testid="issues-detail-page">
      <h1>Detail závady</h1><StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/zavady">Zpět na seznam</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">Zpět na seznam</Link><Link className="k-button" to={`/zavady/${item.id}/edit`}>Upravit</Link></div><DataTable headers={['Položka', 'Hodnota']} rows={[[ 'Název', item.title],[ 'Lokace', item.location],[ 'Pokoj', item.room_number ?? '-'],[ 'Priorita', issuePriorityLabel(item.priority)],[ 'Stav', issueStatusLabel(item.status)],[ 'Přiřazeno', item.assignee ?? '-'],[ 'Popis', item.description ?? '-' ]]} /><h2>Timeline</h2><Timeline entries={timeline} /></div> : <SkeletonPage />}
    </main>
  );
}


function InventoryList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Skladové hospodářství', '/sklad');
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default') return;
    fetchJson<InventoryItem[]>('/api/v1/inventory')
      .then((response) => {
        setItems(response);
        setError(null);
      })
      .catch(() => setError('Položky skladu se nepodařilo načíst.'));
  }, [state]);

  return <main className="k-page" data-testid="inventory-list-page"><h1>Skladové hospodářství</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? <StateView title="Prázdný stav" description="Ve skladu zatím nejsou položky." stateKey="empty" action={<Link className="k-button" to="/sklad/nova">Nová položka</Link>} /> : <><div className="k-toolbar"><Link className="k-button" to="/sklad/nova">Nová položka</Link></div><DataTable headers={['Položka', 'Skladem', 'Minimum', 'Jednotka', 'Dodavatel', 'Status', 'Akce']} rows={items.map((item) => [item.name, item.current_stock, item.min_stock, item.unit, item.supplier ?? '-', item.current_stock <= item.min_stock ? <Badge key={`low-${item.id}`} tone="danger">Pod minimem</Badge> : <Badge key={`ok-${item.id}`} tone="success">OK</Badge>, <Link className="k-nav-link" key={item.id} to={`/sklad/${item.id}`}>Detail</Link>])} /></>}</main>;
}

function InventoryForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Skladové hospodářství', '/sklad');
  const { id } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = React.useState<InventoryItemPayload>({ name: '', unit: 'ks', min_stock: 0, current_stock: 0, supplier: '' });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (mode !== 'edit' || state !== 'default' || !id) return;
    fetchJson<InventoryDetail>(`/api/v1/inventory/${id}`).then((item) => setPayload({
      name: item.name,
      unit: item.unit,
      min_stock: item.min_stock,
      current_stock: item.current_stock,
      supplier: item.supplier ?? '',
    })).catch(() => setError('Položku se nepodařilo načíst.'));
  }, [id, mode, state]);

  const save = async (): Promise<void> => {
    try {
      const saved = await fetchJson<InventoryItem>(mode === 'create' ? '/api/v1/inventory' : `/api/v1/inventory/${id}`, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, supplier: payload.supplier || null }),
      });
      navigate(`/sklad/${saved.id}`);
    } catch {
      setError('Položku se nepodařilo uložit.');
    }
  };

  return <main className="k-page" data-testid={mode === 'create' ? 'inventory-create-page' : 'inventory-edit-page'}><h1>{mode === 'create' ? 'Nová skladová položka' : 'Upravit skladovou položku'}</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/sklad">Zpět na seznam</Link><button className="k-button" type="button" onClick={() => void save()}>Uložit</button></div><div className="k-form-grid"><FormField id="inventory_name" label="Název"><input id="inventory_name" className="k-input" value={payload.name} onChange={(e) => setPayload((prev) => ({ ...prev, name: e.target.value }))} /></FormField><FormField id="inventory_unit" label="Jednotka"><input id="inventory_unit" className="k-input" value={payload.unit} onChange={(e) => setPayload((prev) => ({ ...prev, unit: e.target.value }))} /></FormField><FormField id="inventory_min_stock" label="Minimální stav"><input id="inventory_min_stock" type="number" className="k-input" value={payload.min_stock} onChange={(e) => setPayload((prev) => ({ ...prev, min_stock: Number(e.target.value) }))} /></FormField><FormField id="inventory_current_stock" label="Aktuální stav"><input id="inventory_current_stock" type="number" className="k-input" value={payload.current_stock} onChange={(e) => setPayload((prev) => ({ ...prev, current_stock: Number(e.target.value) }))} /></FormField><FormField id="inventory_supplier" label="Dodavatel (volitelné)"><input id="inventory_supplier" className="k-input" value={payload.supplier ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, supplier: e.target.value }))} /></FormField></div></div>}</main>;
}

function InventoryDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Skladové hospodářství', '/sklad');
  const { id } = useParams();
  const [item, setItem] = React.useState<InventoryDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [movementType, setMovementType] = React.useState<InventoryMovementType>('in');
  const [quantity, setQuantity] = React.useState<number>(0);
  const [note, setNote] = React.useState<string>('');

  const loadDetail = React.useCallback(() => {
    if (!id) return;
    fetchJson<InventoryDetail>(`/api/v1/inventory/${id}`).then((response) => {
      setItem(response);
      setError(null);
    }).catch(() => setError('Položka nebyla nalezena.'));
  }, [id]);

  React.useEffect(() => {
    if (state !== 'default') return;
    loadDetail();
  }, [loadDetail, state]);

  const addMovement = async (): Promise<void> => {
    if (!id) return;
    try {
      const response = await fetchJson<InventoryDetail>(`/api/v1/inventory/${id}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movement_type: movementType, quantity, note: note || null }),
      });
      setItem((prev) => (prev ? { ...prev, current_stock: response.current_stock, movements: response.movements } : response));
      setQuantity(0);
      setNote('');
    } catch {
      setError('Pohyb se nepodařilo uložit.');
    }
  };

  return <main className="k-page" data-testid="inventory-detail-page"><h1>Detail skladové položky</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/sklad">Zpět na seznam</Link>} /> : item ? <><div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/sklad">Zpět na seznam</Link><Link className="k-button" to={`/sklad/${item.id}/edit`}>Upravit</Link></div><DataTable headers={['Položka', 'Skladem', 'Minimum', 'Jednotka', 'Dodavatel']} rows={[[item.name, item.current_stock, item.min_stock, item.unit, item.supplier ?? '-']]} /></div><div className="k-card"><h2>Nový pohyb</h2><div className="k-form-grid"><FormField id="movement_type" label="Typ"><select id="movement_type" className="k-select" value={movementType} onChange={(e) => setMovementType(e.target.value as InventoryMovementType)}><option value="in">Naskladnění</option><option value="out">Výdej</option><option value="adjust">Úprava</option></select></FormField><FormField id="movement_quantity" label="Množství"><input id="movement_quantity" type="number" className="k-input" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></FormField><FormField id="movement_note" label="Poznámka (volitelné)"><input id="movement_note" className="k-input" value={note} onChange={(e) => setNote(e.target.value)} /></FormField></div><button className="k-button" type="button" onClick={() => void addMovement()}>Přidat pohyb</button></div><div className="k-card"><h2>Pohyby</h2><DataTable headers={['Datum', 'Typ', 'Množství', 'Poznámka']} rows={item.movements.map((movement) => [formatDateTime(movement.created_at), inventoryMovementLabel(movement.movement_type), movement.quantity, movement.note ?? '-'])} /></div></> : <SkeletonPage />}</main>;
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


function ReportsList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Hlášení', '/hlaseni');
  const [items, setItems] = React.useState<Report[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchJson<Report[]>('/api/v1/reports')
      .then(setItems)
      .catch(() => setError('Hlášení se nepodařilo načíst.'));
  }, []);

  return <main className="k-page" data-testid="reports-list-page"><h1>Hlášení</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? <StateView title="Prázdný stav" description="Zatím není evidováno žádné hlášení." stateKey="empty" action={<Link className="k-button" to="/hlaseni/nove">Nové hlášení</Link>} /> : <><div className="k-toolbar"><Link className="k-button" to="/hlaseni/nove">Nové hlášení</Link></div><DataTable headers={['Název', 'Stav', 'Vytvořeno', 'Akce']} rows={items.map((item) => [item.title, <Badge key={`status-${item.id}`} tone={item.status === 'closed' ? 'success' : item.status === 'in_progress' ? 'warning' : 'neutral'}>{reportStatusLabel(item.status)}</Badge>, formatDateTime(item.created_at), <Link className="k-nav-link" key={item.id} to={`/hlaseni/${item.id}`}>Detail</Link>])} /></>}</main>;
}

function ReportsForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Hlášení', '/hlaseni');
  const { id } = useParams();
  const navigate = useNavigate();
  const [error, setError] = React.useState<string | null>(null);
  const [payload, setPayload] = React.useState<ReportPayload>({ title: '', description: '', status: 'open' });

  React.useEffect(() => {
    if (mode === 'edit' && id) {
      fetchJson<Report>(`/api/v1/reports/${id}`)
        .then((item) => setPayload({ title: item.title, description: item.description, status: item.status }))
        .catch(() => setError('Detail hlášení se nepodařilo načíst.'));
    }
  }, [id, mode]);

  async function save(): Promise<void> {
    try {
      const saved = await fetchJson<Report>(mode === 'create' ? '/api/v1/reports' : `/api/v1/reports/${id}`, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      navigate(`/hlaseni/${saved.id}`);
    } catch {
      setError('Hlášení se nepodařilo uložit.');
    }
  }

  return <main className="k-page" data-testid={mode === 'create' ? 'reports-create-page' : 'reports-edit-page'}><h1>{mode === 'create' ? 'Nové hlášení' : 'Upravit hlášení'}</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/hlaseni">Zpět na seznam</Link><button className="k-button" type="button" onClick={() => void save()}>Uložit</button></div><div className="k-form-grid"><FormField id="report_title" label="Název"><input id="report_title" className="k-input" value={payload.title} onChange={(e) => setPayload((prev) => ({ ...prev, title: e.target.value }))} /></FormField><FormField id="report_status" label="Stav"><select id="report_status" className="k-select" value={payload.status} onChange={(e) => setPayload((prev) => ({ ...prev, status: e.target.value as ReportStatus }))}><option value="open">Otevřené</option><option value="in_progress">V řešení</option><option value="closed">Uzavřené</option></select></FormField><FormField id="report_description" label="Popis (volitelné)"><textarea id="report_description" className="k-input" value={payload.description ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} /></FormField></div></div>}</main>;
}

function ReportsDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Hlášení', '/hlaseni');
  const { id } = useParams();
  const [item, setItem] = React.useState<Report | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchJson<Report>(`/api/v1/reports/${id}`)
      .then(setItem)
      .catch(() => setError('Hlášení nebylo nalezeno.'));
  }, [id]);

  return <main className="k-page" data-testid="reports-detail-page"><h1>Detail hlášení</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/hlaseni">Zpět na seznam</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/hlaseni">Zpět na seznam</Link><Link className="k-button" to={`/hlaseni/${item.id}/edit`}>Upravit</Link></div><DataTable headers={['Položka', 'Hodnota']} rows={[[ 'Název', item.title],[ 'Stav', reportStatusLabel(item.status)],[ 'Popis', item.description ?? '-' ],[ 'Vytvořeno', formatDateTime(item.created_at) ],[ 'Aktualizováno', formatDateTime(item.updated_at) ]]} /></div> : <SkeletonPage />}</main>;
}

function AppRoutes(): JSX.Element {
  const location = useLocation();
  const testNav = typeof window !== 'undefined' ? (window as Window & { __KAJOVO_TEST_NAV__?: unknown }).__KAJOVO_TEST_NAV__ : undefined;
  const injectedModules = Array.isArray((testNav as { modules?: unknown } | undefined)?.modules)
    ? ((testNav as { modules: typeof ia.modules }).modules ?? [])
    : [];
  const modules = [...ia.modules, ...injectedModules];

  return (
    <AppShell
      modules={modules}
      navigationRules={ia.navigation.rules}
      navigationSections={ia.navigation.sections}
      currentPath={location.pathname}
    >
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
        <Route path="/zavady" element={<IssuesList />} />
        <Route path="/zavady/nova" element={<IssuesForm mode="create" />} />
        <Route path="/zavady/:id" element={<IssuesDetail />} />
        <Route path="/zavady/:id/edit" element={<IssuesForm mode="edit" />} />
        <Route path="/sklad" element={<InventoryList />} />
        <Route path="/sklad/nova" element={<InventoryForm mode="create" />} />
        <Route path="/sklad/:id" element={<InventoryDetail />} />
        <Route path="/sklad/:id/edit" element={<InventoryForm mode="edit" />} />
        <Route path="/hlaseni" element={<ReportsList />} />
        <Route path="/hlaseni/nove" element={<ReportsForm mode="create" />} />
        <Route path="/hlaseni/:id" element={<ReportsDetail />} />
        <Route path="/hlaseni/:id/edit" element={<ReportsForm mode="edit" />} />
        <Route
          path="/intro"
          element={
            <React.Suspense fallback={<SkeletonPage />}><IntroRoute /></React.Suspense>
          }
        />
        <Route
          path="/offline"
          element={
            <React.Suspense fallback={<SkeletonPage />}><OfflineRoute /></React.Suspense>
          }
        />
        <Route
          path="/maintenance"
          element={
            <React.Suspense fallback={<SkeletonPage />}><MaintenanceRoute /></React.Suspense>
          }
        />
        <Route
          path="/404"
          element={
            <React.Suspense fallback={<SkeletonPage />}><NotFoundRoute /></React.Suspense>
          }
        />
        <Route path="/dalsi" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </AppShell>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClientErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ClientErrorBoundary>
  </React.StrictMode>,
);
