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
import { AppShell, Badge, Card, DataTable, FormField, KajovoSign, SkeletonPage, StateView, Timeline } from '@kajovo/ui';
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
import './login.css';
import { canReadModule, resolveAuthProfile, rolePermissions, type AuthProfile } from './rbac';

const brandWordmark = '/brand/apps/kajovo-hotel/logo/exports/wordmark/svg/kajovo-hotel_wordmark.svg';
const adminLoginFigure = '/brand/postavy/kaja-admin.png';

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

type MediaPhoto = {
  id: number;
  sort_order: number;
  mime_type: string;
  size_bytes: number;
  file_path: string;
  thumb_path: string;
  created_at: string | null;
};

type PortalRole = 'pokojskĂˇ' | 'ĂşdrĹľba' | 'recepce' | 'snĂ­danÄ›' | 'sklad';

const portalRoleOptions: PortalRole[] = ['pokojskĂˇ', 'ĂşdrĹľba', 'recepce', 'snĂ­danÄ›', 'sklad'];

function toAdminNavRoute(route: string): string {
  if (!route.startsWith('/')) {
    return route;
  }
  if (route === '/admin' || route.startsWith('/admin/')) {
    return route;
  }
  if (route === '/') {
    return '/admin/';
  }
  return `/admin${route}`;
}

type PortalUser = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  roles: PortalRole[];
  phone: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  last_login_at: string | null;
};

type PortalUserUpsertPayload = {
  first_name: string;
  last_name: string;
  email: string;
  roles: PortalRole[];
  phone?: string;
  note?: string;
};

type PortalUserCreatePayload = PortalUserUpsertPayload & {
  password: string;
};

type SmtpSettingsReadModel = {
  host: string;
  port: number;
  username: string;
  use_tls: boolean;
  use_ssl: boolean;
  password_masked: string;
};

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
            description={this.state.message ?? 'Aplikace narazila na neoÄŤekĂˇvanou chybu.'}
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
  pending: 'ÄŚekĂˇ',
  preparing: 'PĹ™ipravuje se',
  served: 'VydĂˇno',
  cancelled: 'ZruĹˇeno',
};

const lostFoundStatusLabels: Record<LostFoundStatus, string> = {
  stored: 'UloĹľeno',
  claimed: 'NĂˇrokovĂˇno',
  returned: 'VrĂˇceno',
  disposed: 'ZlikvidovĂˇno',
};

const lostFoundTypeLabels: Record<LostFoundType, string> = {
  lost: 'Ztraceno',
  found: 'Nalezeno',
};

const issuePriorityLabels: Record<IssuePriority, string> = {
  low: 'NĂ­zkĂˇ',
  medium: 'StĹ™ednĂ­',
  high: 'VysokĂˇ',
  critical: 'KritickĂˇ',
};

const issueStatusLabels: Record<IssueStatus, string> = {
  new: 'NovĂˇ',
  in_progress: 'V Ĺ™eĹˇenĂ­',
  resolved: 'VyĹ™eĹˇena',
  closed: 'UzavĹ™ena',
};

const reportStatusLabels: Record<ReportStatus, string> = {
  open: 'OtevĹ™enĂ©',
  in_progress: 'V Ĺ™eĹˇenĂ­',
  closed: 'UzavĹ™enĂ©',
};


const inventoryMovementLabels: Record<InventoryMovementType, string> = {
  in: 'NaskladnÄ›nĂ­',
  out: 'VĂ˝dej',
  adjust: 'Ăšprava',
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
  default: 'VĂ˝chozĂ­',
  loading: 'NaÄŤĂ­tĂˇnĂ­',
  empty: 'PrĂˇzdno',
  error: 'Chyba',
  offline: 'Offline',
  maintenance: 'ĂšdrĹľba',
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
          title="PrĂˇzdnĂ˝ stav"
          description={`Pro modul ${title} zatĂ­m nejsou dostupnĂˇ data.`}
          stateKey="empty"
          action={<Link className="k-button secondary" to={fallbackRoute}>Obnovit data</Link>}
        />
      );
    case 'error':
      return (
        <StateView
          title="Chyba"
          description="NepodaĹ™ilo se naÄŤĂ­st data. Zkuste strĂˇnku obnovit."
          stateKey="error"
          action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>}
        />
      );
    case 'offline':
      return (
        <StateView
          title="Offline"
          description="Aplikace je doÄŤasnÄ› bez pĹ™ipojenĂ­."
          stateKey="offline"
          action={<Link className="k-button secondary" to="/offline">Diagnostika pĹ™ipojenĂ­</Link>}
        />
      );
    case 'maintenance':
      return (
        <StateView
          title="ĂšdrĹľba"
          description="Modul je doÄŤasnÄ› v reĹľimu ĂşdrĹľby."
          stateKey="maintenance"
          action={<Link className="k-button secondary" to="/maintenance">Zobrazit status</Link>}
        />
      );
    case '404':
      return (
        <StateView
          title="404"
          description="PoĹľadovanĂ˝ obsah nebyl nalezen."
          stateKey="404"
          action={
            <Link className="k-nav-link" to={fallbackRoute}>
              ZpÄ›t
            </Link>
          }
        />
      );
    default:
      return null;
  }
}

function StateSwitcher(): JSX.Element {
  const isProd = (import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD === true;
  if (isProd) {
    return <></>;
  }
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

function StateMarker({ state }: { state: ViewState }): JSX.Element | null {
  if (state !== 'default') {
    return null;
  }
  return <span className="k-state-marker" data-testid={`state-view-${state}`} aria-hidden="true" />;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const url = new URL(input, window.location.origin);
  const path = url.pathname;
  let body: Record<string, unknown> | undefined;
  if (typeof init?.body === 'string') {
    try {
      body = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      body = undefined;
    }
  }

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



  if (path === '/api/v1/users' && method === 'GET') {
    const response = await fetch(path, { credentials: 'include' });
    if (!response.ok) throw new Error('NepodaĹ™ilo se naÄŤĂ­st uĹľivatele.');
    return (await response.json()) as T;
  }
  if (path === '/api/v1/users' && method === 'POST') {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }
  const userActiveId = path.match(/^\/api\/v1\/users\/(\d+)\/active$/);
  if (userActiveId && method === 'PATCH') {
    const response = await fetch(path, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }
  const userPasswordId = path.match(/^\/api\/v1\/users\/(\d+)\/password(\/reset)?$/);
  if (userPasswordId && method === 'POST') {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }

  if (path === '/api/auth/admin/hint' && method === 'POST') {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }

  if (path === '/api/v1/admin/settings/smtp' && method === 'GET') {
    const response = await fetch(path, { credentials: 'include' });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }
  if (path === '/api/v1/admin/settings/smtp' && method === 'PUT') {
    const response = await fetch(path, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }
  if (path === '/api/v1/admin/settings/smtp/test-email' && method === 'POST') {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }

  const fallbackResponse = await fetch(path + url.search, {
    ...init,
    credentials: 'include',
  });
  if (!fallbackResponse.ok) {
    throw new Error(await fallbackResponse.text());
  }
  if (fallbackResponse.status === 204) {
    return undefined as T;
  }
  return (await fallbackResponse.json()) as T;
}


function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString('cs-CZ');
}

function Dashboard(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'PĹ™ehled', '/');
  const stateMarker = <StateMarker state={state} />;

  return (
    <main className="k-page" data-testid="dashboard-page">
      {stateMarker}
      <h1>PĹ™ehled</h1>
      <StateSwitcher />
      {stateUI ?? (
        <div className="k-grid cards-3">
          <Card title="SnĂ­danÄ› dnes">
            <strong>18</strong>
            <p>3 ÄŤekajĂ­cĂ­ objednĂˇvky</p>
          </Card>
          <Card title="ZĂˇvady">
            <strong>4</strong>
            <p>1 kritickĂˇ zĂˇvada</p>
          </Card>
          <Card title="Sklad">
            <strong>12</strong>
            <p>2 poloĹľky pod minimem</p>
          </Card>
        </div>
      )}
    </main>
  );
}

function BreakfastList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'SnĂ­danÄ›', '/snidane');
  const stateMarker = <StateMarker state={state} />;
  const [items, setItems] = React.useState<BreakfastOrder[]>([]);
  const [summary, setSummary] = React.useState<BreakfastSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [importInfo, setImportInfo] = React.useState<string | null>(null);

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
        setError('NepodaĹ™ilo se naÄŤĂ­st seznam snĂ­danĂ­.');
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

  const importPdf = async (): Promise<void> => {
    if (!importFile) {
      setImportInfo('Vyberte PDF soubor.');
      return;
    }
    const data = new FormData();
    data.append('save', 'true');
    data.append('file', importFile);
    try {
      const result = await fetchJson<{ date: string; items: Array<{ room: number; count: number }> }>(
        '/api/v1/breakfast/import',
        { method: 'POST', body: data }
      );
      setImportInfo(`Import OK: ${result.items.length} pokojĹŻ (${result.date}).`);
      const orders = await fetchJson<BreakfastOrder[]>('/api/v1/breakfast');
      setItems(orders);
      const daily = await fetchJson<BreakfastSummary>(
        `/api/v1/breakfast/daily-summary?service_date=${defaultServiceDate}`
      );
      setSummary(daily);
    } catch {
      setImportInfo('Import PDF selhal.');
    }
  };

  const breakfastToolbar = (
    <div className="k-toolbar">
      <input
        className="k-input"
        placeholder="Hledat dle pokoje nebo hosta"
        aria-label="Hledat"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <input
        className="k-input"
        type="file"
        accept="application/pdf"
        onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
      />
      <button className="k-button secondary" type="button" onClick={() => void importPdf()}>
        Import PDF
      </button>
      <Link className="k-button" to="/snidane/nova">
        NovĂˇ objednĂˇvka
      </Link>
    </div>
  );

  return (
    <main className="k-page" data-testid="breakfast-list-page">
      {stateMarker}
      <h1>SnĂ­danÄ›</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : filteredItems.length === 0 ? (
        <>
          {breakfastToolbar}
          {importInfo ? <p>{importInfo}</p> : null}
          <StateView title="PrĂˇzdnĂ˝ stav" description="Nebyly nalezeny ĹľĂˇdnĂ© objednĂˇvky." stateKey="empty" action={<Link className="k-button" to="/snidane/nova">NovĂˇ objednĂˇvka</Link>} />
        </>
      ) : (
        <>
          <div className="k-grid cards-3">
            <Card title="ObjednĂˇvky dne">
              <strong>{summary?.total_orders ?? 0}</strong>
            </Card>
            <Card title="HostĂ© dne">
              <strong>{summary?.total_guests ?? 0}</strong>
            </Card>
            <Card title="ÄŚekajĂ­cĂ­">
              <strong>{getSummaryCount(summary, 'pending')}</strong>
            </Card>
          </div>
          {breakfastToolbar}
          {importInfo ? <p>{importInfo}</p> : null}
          <DataTable
            headers={['Datum', 'Pokoj', 'Host', 'PoÄŤet', 'Stav', 'PoznĂˇmka', 'Akce']}
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
  const stateUI = stateViewForRoute(state, 'SnĂ­danÄ›', '/snidane');
  const stateMarker = <StateMarker state={state} />;
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
        setError('ObjednĂˇvku se nepodaĹ™ilo naÄŤĂ­st.');
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
      setError('ObjednĂˇvku se nepodaĹ™ilo uloĹľit.');
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'breakfast-create-page' : 'breakfast-edit-page'}>
      {stateMarker}
      <h1>{mode === 'create' ? 'NovĂˇ snĂ­danÄ›' : 'Upravit snĂ­dani'}</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/snidane">
              ZpÄ›t na seznam
            </Link>
            <button className="k-button" type="button" onClick={() => void save()}>
              UloĹľit
            </button>
          </div>
          <div className="k-form-grid">
            <FormField id="service_date" label="Datum sluĹľby">
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
            <FormField id="guest_count" label="PoÄŤet hostĹŻ">
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
                <option value="pending">ÄŚekĂˇ</option>
                <option value="preparing">PĹ™ipravuje se</option>
                <option value="served">VydĂˇno</option>
                <option value="cancelled">ZruĹˇeno</option>
              </select>
            </FormField>
            <FormField id="note" label="PoznĂˇmka">
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
  const stateUI = stateViewForRoute(state, 'SnĂ­danÄ›', '/snidane');
  const stateMarker = <StateMarker state={state} />;
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
        setError('ObjednĂˇvka nebyla nalezena.');
      });
  }, [id, state]);

  return (
    <main className="k-page" data-testid="breakfast-detail-page">
      {stateMarker}
      <h1>Detail snĂ­danÄ›</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : notFound ? (
        <StateView title="404" description={error ?? 'ObjednĂˇvka neexistuje.'} stateKey="404" action={<Link className="k-button secondary" to="/snidane">ZpÄ›t na seznam</Link>} />
      ) : item ? (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/snidane">
              ZpÄ›t na seznam
            </Link>
            <Link className="k-button" to={`/snidane/${item.id}/edit`}>
              Upravit
            </Link>
          </div>
          <DataTable
            headers={['PoloĹľka', 'Hodnota']}
            rows={[
              ['Datum sluĹľby', item.service_date],
              ['Pokoj', item.room_number],
              ['Host', item.guest_name],
              ['PoÄŤet hostĹŻ', item.guest_count],
              ['Stav', breakfastStatusLabel(item.status)],
              ['PoznĂˇmka', item.note ?? '-'],
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
  const stateUI = stateViewForRoute(state, 'ZtrĂˇty a nĂˇlezy', '/ztraty-a-nalezy');
  const stateMarker = <StateMarker state={state} />;
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
      .catch(() => setError('NepodaĹ™ilo se naÄŤĂ­st poloĹľky ztrĂˇt a nĂˇlezĹŻ.'));
  }, [state, statusFilter, typeFilter]);

  return (
    <main className="k-page" data-testid="lost-found-list-page">
      {stateMarker}
      <h1>ZtrĂˇty a nĂˇlezy</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : items.length === 0 ? (
        <StateView title="PrĂˇzdnĂ˝ stav" description="ZatĂ­m nenĂ­ evidovĂˇna ĹľĂˇdnĂˇ poloĹľka." stateKey="empty" action={<Link className="k-button" to="/ztraty-a-nalezy/novy">PĹ™idat zĂˇznam</Link>} />
      ) : (
        <>
          <div className="k-grid cards-3">
            <Card title="Celkem poloĹľek">
              <strong>{items.length}</strong>
            </Card>
            <Card title="UloĹľenĂ©">
              <strong>{items.filter((item) => item.status === 'stored').length}</strong>
            </Card>
            <Card title="VrĂˇcenĂ©">
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
              <option value="all">VĹˇechny typy</option>
              <option value="lost">ZtracenĂ©</option>
              <option value="found">NalezenĂ©</option>
            </select>
            <select
              className="k-select"
              aria-label="Filtr stavu"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | LostFoundStatus)}
            >
              <option value="all">VĹˇechny stavy</option>
              <option value="stored">UloĹľeno</option>
              <option value="claimed">NĂˇrokovĂˇno</option>
              <option value="returned">VrĂˇceno</option>
              <option value="disposed">ZlikvidovĂˇno</option>
            </select>
            <Link className="k-button" to="/ztraty-a-nalezy/novy">
              NovĂˇ poloĹľka
            </Link>
          </div>
          <DataTable
            headers={['Typ', 'Kategorie', 'MĂ­sto', 'ÄŚas', 'Stav', 'Akce']}
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
  const stateUI = stateViewForRoute(state, 'ZtrĂˇty a nĂˇlezy', '/ztraty-a-nalezy');
  const stateMarker = <StateMarker state={state} />;
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
  const [photos, setPhotos] = React.useState<File[]>([]);

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
      .catch(() => setError('PoloĹľku se nepodaĹ™ilo naÄŤĂ­st.'));
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
      if (photos.length > 0) {
        const formData = new FormData();
        photos.forEach((photo) => formData.append('photos', photo));
        await fetchJson<MediaPhoto[]>(`/api/v1/lost-found/${saved.id}/photos`, {
          method: 'POST',
          body: formData,
        });
      }
      navigate(`/ztraty-a-nalezy/${saved.id}`);
    } catch {
      setError('PoloĹľku se nepodaĹ™ilo uloĹľit.');
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'lost-found-create-page' : 'lost-found-edit-page'}>
      {stateMarker}
      <h1>{mode === 'create' ? 'NovĂˇ poloĹľka' : 'Upravit poloĹľku'}</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/ztraty-a-nalezy">
              ZpÄ›t na seznam
            </Link>
            <button className="k-button" type="button" onClick={() => void save()}>
              UloĹľit
            </button>
          </div>
          <div className="k-form-grid">
            <FormField id="item_type" label="Typ zĂˇznamu">
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
            <FormField id="location" label="MĂ­sto nĂˇlezu/ztrĂˇty">
              <input
                id="location"
                className="k-input"
                value={payload.location}
                onChange={(event) => setPayload((prev) => ({ ...prev, location: event.target.value }))}
              />
            </FormField>
            <FormField id="event_at" label="Datum a ÄŤas">
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
                <option value="stored">UloĹľeno</option>
                <option value="claimed">NĂˇrokovĂˇno</option>
                <option value="returned">VrĂˇceno</option>
                <option value="disposed">ZlikvidovĂˇno</option>
              </select>
            </FormField>
            <FormField id="description" label="Popis poloĹľky">
              <textarea
                id="description"
                className="k-textarea"
                rows={3}
                value={payload.description}
                onChange={(event) => setPayload((prev) => ({ ...prev, description: event.target.value }))}
              />
            </FormField>
            <FormField id="claimant_name" label="JmĂ©no nĂˇlezce/Ĺľadatele (volitelnĂ©)">
              <input
                id="claimant_name"
                className="k-input"
                value={payload.claimant_name ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, claimant_name: event.target.value }))}
              />
            </FormField>
            <FormField id="claimant_contact" label="Kontakt (volitelnĂ©)">
              <input
                id="claimant_contact"
                className="k-input"
                value={payload.claimant_contact ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, claimant_contact: event.target.value }))}
              />
            </FormField>
            <FormField id="handover_note" label="PĹ™edĂˇvacĂ­ zĂˇznam (volitelnĂ©)">
              <textarea
                id="handover_note"
                className="k-textarea"
                rows={2}
                value={payload.handover_note ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, handover_note: event.target.value }))}
              />
            </FormField>
            <FormField id="lost_found_photos" label="Fotodokumentace (volitelnĂ©)">
              <input
                id="lost_found_photos"
                type="file"
                className="k-input"
                multiple
                accept="image/*"
                onChange={(event) => setPhotos(Array.from(event.target.files ?? []))}
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
  const stateUI = stateViewForRoute(state, 'ZtrĂˇty a nĂˇlezy', '/ztraty-a-nalezy');
  const stateMarker = <StateMarker state={state} />;
  const { id } = useParams();
  const [item, setItem] = React.useState<LostFoundItem | null>(null);
  const [photos, setPhotos] = React.useState<MediaPhoto[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default' || !id) {
      return;
    }
    fetchJson<LostFoundItem>(`/api/v1/lost-found/${id}`)
      .then((response) => {
        setItem(response);
        setError(null);
        return fetchJson<MediaPhoto[]>(`/api/v1/lost-found/${id}/photos`);
      })
      .then((media) => setPhotos(media ?? []))
      .catch(() => setError('PoloĹľka nebyla nalezena.'));
  }, [id, state]);

  return (
    <main className="k-page" data-testid="lost-found-detail-page">
      {stateMarker}
      <h1>Detail poloĹľky</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="404" description={error} />
      ) : item ? (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/ztraty-a-nalezy">
              ZpÄ›t na seznam
            </Link>
            <Link className="k-button" to={`/ztraty-a-nalezy/${item.id}/edit`}>
              Upravit
            </Link>
          </div>
          <DataTable
            headers={['PoloĹľka', 'Hodnota']}
            rows={[
              ['Typ', lostFoundTypeLabel(item.item_type)],
              ['Kategorie', item.category],
              ['MĂ­sto', item.location],
              ['Datum a ÄŤas', new Date(item.event_at).toLocaleString('cs-CZ')],
              ['Stav', lostFoundStatusLabel(item.status)],
              ['Popis', item.description],
              ['JmĂ©no Ĺľadatele', item.claimant_name ?? '-'],
              ['Kontakt', item.claimant_contact ?? '-'],
              ['PĹ™edĂˇvacĂ­ zĂˇznam', item.handover_note ?? '-'],
            ]}
          />
          {photos.length > 0 ? (
            <div className="k-grid cards-3">
              {photos.map((photo) => (
                <img
                  key={photo.id}
                  src={`/api/v1/lost-found/${item.id}/photos/${photo.id}/thumb`}
                  alt={`Fotografie poloĹľky ${photo.id}`}
                  className="k-photo-thumb"
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <SkeletonPage />
      )}
    </main>
  );
}


function IssuesList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'ZĂˇvady', '/zavady');
  const stateMarker = <StateMarker state={state} />;
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
      .catch(() => setError('NepodaĹ™ilo se naÄŤĂ­st seznam zĂˇvad.'));
  }, [locationFilter, priorityFilter, state, statusFilter]);

  return (
    <main className="k-page" data-testid="issues-list-page">
      {stateMarker}
      <h1>ZĂˇvady</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? (
        <StateView title="PrĂˇzdnĂ˝ stav" description="ZatĂ­m nejsou evidovanĂ© ĹľĂˇdnĂ© zĂˇvady." stateKey="empty" action={<Link className="k-button" to="/zavady/nova">NahlĂˇsit zĂˇvadu</Link>} />
      ) : (
        <>
          <div className="k-toolbar">
            <select className="k-select" aria-label="Filtr priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as 'all' | IssuePriority)}>
              <option value="all">VĹˇechny priority</option><option value="low">NĂ­zkĂˇ</option><option value="medium">StĹ™ednĂ­</option><option value="high">VysokĂˇ</option><option value="critical">KritickĂˇ</option>
            </select>
            <select className="k-select" aria-label="Filtr stavu" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | IssueStatus)}>
              <option value="all">VĹˇechny stavy</option><option value="new">NovĂˇ</option><option value="in_progress">V Ĺ™eĹˇenĂ­</option><option value="resolved">VyĹ™eĹˇena</option><option value="closed">UzavĹ™ena</option>
            </select>
            <input className="k-input" aria-label="Filtr lokace" placeholder="Lokalita" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} />
            <Link className="k-button" to="/zavady/nova">NovĂˇ zĂˇvada</Link>
          </div>
          <DataTable headers={['NĂˇzev', 'Lokace', 'Pokoj', 'Priorita', 'Stav', 'PĹ™iĹ™azeno', 'Akce']} rows={items.map((item) => [
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
  const stateUI = stateViewForRoute(state, 'ZĂˇvady', '/zavady');
  const stateMarker = <StateMarker state={state} />;
  const { id } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = React.useState<IssuePayload>({
    title: '', description: '', location: '', room_number: '', priority: 'medium', status: 'new', assignee: '',
  });
  const [error, setError] = React.useState<string | null>(null);
  const [photos, setPhotos] = React.useState<File[]>([]);

  React.useEffect(() => {
    if (mode !== 'edit' || state !== 'default' || !id) return;
    fetchJson<Issue>(`/api/v1/issues/${id}`).then((item) => setPayload({
      title: item.title, description: item.description ?? '', location: item.location, room_number: item.room_number ?? '', priority: item.priority, status: item.status, assignee: item.assignee ?? '',
    })).catch(() => setError('ZĂˇvadu se nepodaĹ™ilo naÄŤĂ­st.'));
  }, [id, mode, state]);

  const save = async (): Promise<void> => {
    try {
      const saved = await fetchJson<Issue>(mode === 'create' ? '/api/v1/issues' : `/api/v1/issues/${id}`, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, description: payload.description || null, room_number: payload.room_number || null, assignee: payload.assignee || null }),
      });
      if (photos.length > 0) {
        const formData = new FormData();
        photos.forEach((photo) => formData.append('photos', photo));
        await fetchJson<MediaPhoto[]>(`/api/v1/issues/${saved.id}/photos`, {
          method: 'POST',
          body: formData,
        });
      }
      navigate(`/zavady/${saved.id}`);
    } catch { setError('ZĂˇvadu se nepodaĹ™ilo uloĹľit.'); }
  };

  return <main className="k-page" data-testid={mode === 'create' ? 'issues-create-page' : 'issues-edit-page'}>{stateMarker}<h1>{mode === 'create' ? 'NovĂˇ zĂˇvada' : 'Upravit zĂˇvadu'}</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">ZpÄ›t na seznam</Link><button className="k-button" type="button" onClick={() => void save()}>UloĹľit</button></div><div className="k-form-grid">
<FormField id="issue_title" label="NĂˇzev"><input id="issue_title" className="k-input" value={payload.title} onChange={(e) => setPayload((prev) => ({ ...prev, title: e.target.value }))} /></FormField>
<FormField id="issue_location" label="Lokalita"><input id="issue_location" className="k-input" value={payload.location} onChange={(e) => setPayload((prev) => ({ ...prev, location: e.target.value }))} /></FormField>
<FormField id="issue_room_number" label="Pokoj (volitelnĂ©)"><input id="issue_room_number" className="k-input" value={payload.room_number ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, room_number: e.target.value }))} /></FormField>
<FormField id="issue_priority" label="Priorita"><select id="issue_priority" className="k-select" value={payload.priority} onChange={(e) => setPayload((prev) => ({ ...prev, priority: e.target.value as IssuePriority }))}><option value="low">NĂ­zkĂˇ</option><option value="medium">StĹ™ednĂ­</option><option value="high">VysokĂˇ</option><option value="critical">KritickĂˇ</option></select></FormField>
<FormField id="issue_status" label="Stav"><select id="issue_status" className="k-select" value={payload.status} onChange={(e) => setPayload((prev) => ({ ...prev, status: e.target.value as IssueStatus }))}><option value="new">NovĂˇ</option><option value="in_progress">V Ĺ™eĹˇenĂ­</option><option value="resolved">VyĹ™eĹˇena</option><option value="closed">UzavĹ™ena</option></select></FormField>
<FormField id="issue_assignee" label="PĹ™iĹ™azeno (volitelnĂ©)"><input id="issue_assignee" className="k-input" value={payload.assignee ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, assignee: e.target.value }))} /></FormField>
<FormField id="issue_description" label="Popis"><textarea id="issue_description" className="k-textarea" rows={3} value={payload.description ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} /></FormField>
<FormField id="issue_photos" label="Fotodokumentace (volitelnĂ©)"><input id="issue_photos" type="file" className="k-input" multiple accept="image/*" onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} /></FormField>
</div></div>}</main>;
}

function IssuesDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'ZĂˇvady', '/zavady');
  const stateMarker = <StateMarker state={state} />;
  const { id } = useParams();
  const [item, setItem] = React.useState<Issue | null>(null);
  const [photos, setPhotos] = React.useState<MediaPhoto[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default' || !id) return;
    fetchJson<Issue>(`/api/v1/issues/${id}`)
      .then((response) => {
        setItem(response);
        setError(null);
        return fetchJson<MediaPhoto[]>(`/api/v1/issues/${id}/photos`);
      })
      .then((media) => setPhotos(media ?? []))
      .catch(() => setError('ZĂˇvada nebyla nalezena.'));
  }, [id, state]);

  const timeline = item ? [
    { label: 'VytvoĹ™eno', value: formatDateTime(item.created_at) },
    ...(item.in_progress_at ? [{ label: 'V Ĺ™eĹˇenĂ­', value: new Date(item.in_progress_at).toLocaleString('cs-CZ') }] : []),
    ...(item.resolved_at ? [{ label: 'VyĹ™eĹˇeno', value: new Date(item.resolved_at).toLocaleString('cs-CZ') }] : []),
    ...(item.closed_at ? [{ label: 'UzavĹ™eno', value: new Date(item.closed_at).toLocaleString('cs-CZ') }] : []),
  ] : [];

  return (
    <main className="k-page" data-testid="issues-detail-page">
      {stateMarker}
      <h1>Detail zĂˇvady</h1><StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/zavady">ZpÄ›t na seznam</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">ZpÄ›t na seznam</Link><Link className="k-button" to={`/zavady/${item.id}/edit`}>Upravit</Link></div><DataTable headers={['PoloĹľka', 'Hodnota']} rows={[[ 'NĂˇzev', item.title],[ 'Lokace', item.location],[ 'Pokoj', item.room_number ?? '-'],[ 'Priorita', issuePriorityLabel(item.priority)],[ 'Stav', issueStatusLabel(item.status)],[ 'PĹ™iĹ™azeno', item.assignee ?? '-'],[ 'Popis', item.description ?? '-' ]]} /><h2>Timeline</h2><Timeline entries={timeline} />{photos.length > 0 ? <div className="k-grid cards-3">{photos.map((photo) => <img key={photo.id} src={`/api/v1/issues/${item.id}/photos/${photo.id}/thumb`} alt={`Fotografie zĂˇvady ${photo.id}`} className="k-photo-thumb" />)}</div> : null}</div> : <SkeletonPage />}
    </main>
  );
}


function InventoryList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'SkladovĂ© hospodĂˇĹ™stvĂ­', '/sklad');
  const stateMarker = <StateMarker state={state} />;
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [seedInfo, setSeedInfo] = React.useState<string | null>(null);

  const loadItems = React.useCallback(() => {
    fetchJson<InventoryItem[]>('/api/v1/inventory')
      .then((response) => {
        setItems(response);
        setError(null);
      })
      .catch(() => setError('PoloĹľky skladu se nepodaĹ™ilo naÄŤĂ­st.'));
  }, []);

  React.useEffect(() => {
    if (state !== 'default') {
      return;
    }
    loadItems();
  }, [loadItems, state]);

  const seedDefaults = async (): Promise<void> => {
    try {
      const seeded = await fetchJson<InventoryItem[]>('/api/v1/inventory/seed-defaults', {
        method: 'POST',
      });
      setSeedInfo(`DoplnÄ›no ${seeded.length} vĂ˝chozĂ­ch poloĹľek.`);
      loadItems();
    } catch {
      setSeedInfo('DoplnÄ›nĂ­ vĂ˝chozĂ­ch poloĹľek se nepodaĹ™ilo.');
    }
  };

  const printInventoryList = (): void => {
    window.print();
  };

  return (
    <main className="k-page" data-testid="inventory-list-page">
      {stateMarker}
      <h1>SkladovĂ© hospodĂˇĹ™stvĂ­</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView
          title="Chyba"
          description={error}
          stateKey="error"
          action={
            <button className="k-button" type="button" onClick={() => window.location.reload()}>
              Obnovit
            </button>
          }
        />
      ) : items.length === 0 ? (
        <>
          <div className="k-toolbar">
            <button className="k-button secondary" type="button" onClick={() => void seedDefaults()}>
              Doplnit vĂ˝chozĂ­ poloĹľky
            </button>
            <button className="k-button secondary" type="button" onClick={printInventoryList}>
              Tisk inventurnĂ­ho seznamu
            </button>
            <Link className="k-button" to="/sklad/nova">NovĂˇ poloĹľka</Link>
          </div>
          {seedInfo ? <p>{seedInfo}</p> : null}
          <StateView
            title="PrĂˇzdnĂ˝ stav"
            description="Ve skladu zatĂ­m nejsou poloĹľky."
            stateKey="empty"
            action={<Link className="k-button" to="/sklad/nova">NovĂˇ poloĹľka</Link>}
          />
        </>
      ) : (
        <>
          <div className="k-toolbar">
            <button className="k-button secondary" type="button" onClick={() => void seedDefaults()}>
              Doplnit vĂ˝chozĂ­ poloĹľky
            </button>
            <button className="k-button secondary" type="button" onClick={printInventoryList}>
              Tisk inventurnĂ­ho seznamu
            </button>
            <Link className="k-button" to="/sklad/nova">NovĂˇ poloĹľka</Link>
          </div>
          {seedInfo ? <p>{seedInfo}</p> : null}
          <DataTable
            headers={['Ikona', 'PoloĹľka', 'Skladem', 'Minimum', 'Jednotka', 'Dodavatel', 'Status', 'Akce']}
            rows={items.map((item) => [
              item.pictogram_thumb_path ? (
                <img
                  key={`pic-${item.id}`}
                  src={`/api/v1/inventory/${item.id}/pictogram/thumb`}
                  alt={`Piktogram ${item.name}`}
                  className="k-pictogram-thumb k-pictogram-thumb-small"
                />
              ) : (
                '-'
              ),
              item.name,
              item.current_stock,
              item.min_stock,
              item.unit,
              item.supplier ?? '-',
              item.current_stock <= item.min_stock
                ? <Badge key={`low-${item.id}`} tone="danger">Pod minimem</Badge>
                : <Badge key={`ok-${item.id}`} tone="success">OK</Badge>,
              <Link className="k-nav-link" key={item.id} to={`/sklad/${item.id}`}>Detail</Link>,
            ])}
          />
        </>
      )}
    </main>
  );
}

function InventoryForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'SkladovĂ© hospodĂˇĹ™stvĂ­', '/sklad');
  const stateMarker = <StateMarker state={state} />;
  const { id } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = React.useState<InventoryItemPayload>({
    name: '',
    unit: 'ks',
    min_stock: 0,
    current_stock: 0,
    supplier: '',
    amount_per_piece_base: 0,
  });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (mode !== 'edit' || state !== 'default' || !id) return;
    fetchJson<InventoryDetail>(`/api/v1/inventory/${id}`).then((item) => setPayload({
      name: item.name,
      unit: item.unit,
      min_stock: item.min_stock,
      current_stock: item.current_stock,
      supplier: item.supplier ?? '',
      amount_per_piece_base: item.amount_per_piece_base,
      pictogram_path: item.pictogram_path,
      pictogram_thumb_path: item.pictogram_thumb_path,
    })).catch(() => setError('PoloĹľku se nepodaĹ™ilo naÄŤĂ­st.'));
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
      setError('PoloĹľku se nepodaĹ™ilo uloĹľit.');
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'inventory-create-page' : 'inventory-edit-page'}>
      {stateMarker}
      <h1>{mode === 'create' ? 'NovĂˇ skladovĂˇ poloĹľka' : 'Upravit skladovou poloĹľku'}</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? (
        <StateView
          title="Chyba"
          description={error}
          stateKey="error"
          action={
            <button className="k-button" type="button" onClick={() => window.location.reload()}>
              Obnovit
            </button>
          }
        />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/sklad">ZpÄ›t na seznam</Link>
            <button className="k-button" type="button" onClick={() => void save()}>UloĹľit</button>
          </div>
          <div className="k-form-grid">
            <FormField id="inventory_name" label="NĂˇzev">
              <input
                id="inventory_name"
                className="k-input"
                value={payload.name}
                onChange={(event) => setPayload((prev) => ({ ...prev, name: event.target.value }))}
              />
            </FormField>
            <FormField id="inventory_unit" label="Jednotka">
              <input
                id="inventory_unit"
                className="k-input"
                value={payload.unit}
                onChange={(event) => setPayload((prev) => ({ ...prev, unit: event.target.value }))}
              />
            </FormField>
            <FormField id="inventory_amount_per_piece_base" label="MnoĹľstvĂ­ na kus (zĂˇkladnĂ­ jednotka)">
              <input
                id="inventory_amount_per_piece_base"
                type="number"
                className="k-input"
                value={payload.amount_per_piece_base ?? 0}
                onChange={(event) =>
                  setPayload((prev) => ({ ...prev, amount_per_piece_base: Number(event.target.value) }))
                }
              />
            </FormField>
            <FormField id="inventory_min_stock" label="MinimĂˇlnĂ­ stav">
              <input
                id="inventory_min_stock"
                type="number"
                className="k-input"
                value={payload.min_stock}
                onChange={(event) => setPayload((prev) => ({ ...prev, min_stock: Number(event.target.value) }))}
              />
            </FormField>
            <FormField id="inventory_current_stock" label="AktuĂˇlnĂ­ stav">
              <input
                id="inventory_current_stock"
                type="number"
                className="k-input"
                value={payload.current_stock}
                onChange={(event) =>
                  setPayload((prev) => ({ ...prev, current_stock: Number(event.target.value) }))
                }
              />
            </FormField>
            <FormField id="inventory_supplier" label="Dodavatel (volitelnĂ©)">
              <input
                id="inventory_supplier"
                className="k-input"
                value={payload.supplier ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, supplier: event.target.value }))}
              />
            </FormField>
          </div>
        </div>
      )}
    </main>
  );
}

function InventoryDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'SkladovĂ© hospodĂˇĹ™stvĂ­', '/sklad');
  const stateMarker = <StateMarker state={state} />;
  const { id } = useParams();
  const [item, setItem] = React.useState<InventoryDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [movementType, setMovementType] = React.useState<InventoryMovementType>('in');
  const [quantity, setQuantity] = React.useState<number>(0);
  const [note, setNote] = React.useState<string>('');
  const [pictogram, setPictogram] = React.useState<File | null>(null);
  const [mediaInfo, setMediaInfo] = React.useState<string | null>(null);

  const loadDetail = React.useCallback(() => {
    if (!id) return;
    fetchJson<InventoryDetail>(`/api/v1/inventory/${id}`).then((response) => {
      setItem(response);
      setError(null);
    }).catch(() => setError('PoloĹľka nebyla nalezena.'));
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
      setError('Pohyb se nepodaĹ™ilo uloĹľit.');
    }
  };

  const uploadPictogram = async (): Promise<void> => {
    if (!id || !pictogram) {
      setMediaInfo('Vyberte soubor piktogramu.');
      return;
    }
    const formData = new FormData();
    formData.append('file', pictogram);
    try {
      await fetchJson<InventoryItem>(`/api/v1/inventory/${id}/pictogram`, { method: 'POST', body: formData });
      setMediaInfo('Piktogram uloĹľen.');
      setPictogram(null);
      loadDetail();
    } catch {
      setMediaInfo('Piktogram se nepodaĹ™ilo uloĹľit.');
    }
  };

  return (
    <main className="k-page" data-testid="inventory-detail-page">
      {stateMarker}
      <h1>Detail skladovĂ© poloĹľky</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView
          title="404"
          description={error}
          stateKey="404"
          action={<Link className="k-button secondary" to="/sklad">ZpÄ›t na seznam</Link>}
        />
      ) : item ? (
        <>
          <div className="k-card">
            <div className="k-toolbar">
              <Link className="k-nav-link" to="/sklad">ZpÄ›t na seznam</Link>
              <Link className="k-button" to={`/sklad/${item.id}/edit`}>Upravit</Link>
            </div>
            <DataTable
              headers={['PoloĹľka', 'Skladem', 'Minimum', 'Jednotka', 'Dodavatel', 'MnoĹľstvĂ­ na kus']}
              rows={[
                [
                  item.name,
                  item.current_stock,
                  item.min_stock,
                  item.unit,
                  item.supplier ?? '-',
                  item.amount_per_piece_base ?? 0,
                ],
              ]}
            />
            <div className="k-form-grid">
              <FormField id="inventory_pictogram_upload" label="Piktogram">
                <input
                  id="inventory_pictogram_upload"
                  type="file"
                  className="k-input"
                  accept="image/*"
                  onChange={(event) => setPictogram(event.target.files?.[0] ?? null)}
                />
              </FormField>
              <div className="k-align-end">
                <button className="k-button secondary" type="button" onClick={() => void uploadPictogram()}>
                  UloĹľit piktogram
                </button>
              </div>
            </div>
            {mediaInfo ? <p>{mediaInfo}</p> : null}
            {item.pictogram_thumb_path ? (
              <img
                src={`/api/v1/inventory/${item.id}/pictogram/thumb`}
                alt={`Piktogram ${item.name}`}
                className="k-pictogram-thumb k-pictogram-thumb-large"
              />
            ) : null}
          </div>
          <div className="k-card">
            <h2>NovĂ˝ pohyb</h2>
            <div className="k-form-grid">
              <FormField id="movement_type" label="Typ">
                <select
                  id="movement_type"
                  className="k-select"
                  value={movementType}
                  onChange={(event) => setMovementType(event.target.value as InventoryMovementType)}
                >
                  <option value="in">NaskladnÄ›nĂ­</option>
                  <option value="out">VĂ˝dej</option>
                  <option value="adjust">Ăšprava</option>
                </select>
              </FormField>
              <FormField id="movement_quantity" label="MnoĹľstvĂ­">
                <input
                  id="movement_quantity"
                  type="number"
                  className="k-input"
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                />
              </FormField>
              <FormField id="movement_note" label="PoznĂˇmka (volitelnĂ©)">
                <input
                  id="movement_note"
                  className="k-input"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </FormField>
            </div>
            <button className="k-button" type="button" onClick={() => void addMovement()}>
              PĹ™idat pohyb
            </button>
          </div>
          <div className="k-card">
            <h2>Pohyby</h2>
            <DataTable
              headers={['Datum', 'Typ', 'MnoĹľstvĂ­', 'PoznĂˇmka']}
              rows={item.movements.map((movement) => [
                formatDateTime(movement.created_at),
                inventoryMovementLabel(movement.movement_type),
                movement.quantity,
                movement.note ?? '-',
              ])}
            />
          </div>
        </>
      ) : (
        <SkeletonPage />
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
      {stateUI ?? <StateView title={`${title} pĹ™ipraveno`} description="Modul je pĹ™ipraven na workflow." />}
    </main>
  );
}


function ReportsList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'HlĂˇĹˇenĂ­', '/hlaseni');
  const stateMarker = <StateMarker state={state} />;
  const [items, setItems] = React.useState<Report[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default') {
      return;
    }
    fetchJson<Report[]>('/api/v1/reports')
      .then(setItems)
      .catch(() => setError('HlĂˇĹˇenĂ­ se nepodaĹ™ilo naÄŤĂ­st.'));
  }, [state]);

  return <main className="k-page" data-testid="reports-list-page">{stateMarker}<h1>HlĂˇĹˇenĂ­</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? <StateView title="PrĂˇzdnĂ˝ stav" description="ZatĂ­m nenĂ­ evidovĂˇno ĹľĂˇdnĂ© hlĂˇĹˇenĂ­." stateKey="empty" action={<Link className="k-button" to="/hlaseni/nove">NovĂ© hlĂˇĹˇenĂ­</Link>} /> : <><div className="k-toolbar"><Link className="k-button" to="/hlaseni/nove">NovĂ© hlĂˇĹˇenĂ­</Link></div><DataTable headers={['NĂˇzev', 'Stav', 'VytvoĹ™eno', 'Akce']} rows={items.map((item) => [item.title, <Badge key={`status-${item.id}`} tone={item.status === 'closed' ? 'success' : item.status === 'in_progress' ? 'warning' : 'neutral'}>{reportStatusLabel(item.status)}</Badge>, formatDateTime(item.created_at), <Link className="k-nav-link" key={item.id} to={`/hlaseni/${item.id}`}>Detail</Link>])} /></>}</main>;
}

function ReportsForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'HlĂˇĹˇenĂ­', '/hlaseni');
  const stateMarker = <StateMarker state={state} />;
  const { id } = useParams();
  const navigate = useNavigate();
  const [error, setError] = React.useState<string | null>(null);
  const [payload, setPayload] = React.useState<ReportPayload>({ title: '', description: '', status: 'open' });

  React.useEffect(() => {
    if (mode !== 'edit' || state !== 'default' || !id) {
      return;
    }
    fetchJson<Report>(`/api/v1/reports/${id}`)
      .then((item) => setPayload({ title: item.title, description: item.description, status: item.status }))
      .catch(() => setError('Detail hlĂˇĹˇenĂ­ se nepodaĹ™ilo naÄŤĂ­st.'));
  }, [id, mode, state]);

  async function save(): Promise<void> {
    try {
      const saved = await fetchJson<Report>(mode === 'create' ? '/api/v1/reports' : `/api/v1/reports/${id}`, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      navigate(`/hlaseni/${saved.id}`);
    } catch {
      setError('HlĂˇĹˇenĂ­ se nepodaĹ™ilo uloĹľit.');
    }
  }

  return <main className="k-page" data-testid={mode === 'create' ? 'reports-create-page' : 'reports-edit-page'}>{stateMarker}<h1>{mode === 'create' ? 'NovĂ© hlĂˇĹˇenĂ­' : 'Upravit hlĂˇĹˇenĂ­'}</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/hlaseni">ZpÄ›t na seznam</Link><button className="k-button" type="button" onClick={() => void save()}>UloĹľit</button></div><div className="k-form-grid"><FormField id="report_title" label="NĂˇzev"><input id="report_title" className="k-input" value={payload.title} onChange={(e) => setPayload((prev) => ({ ...prev, title: e.target.value }))} /></FormField><FormField id="report_status" label="Stav"><select id="report_status" className="k-select" value={payload.status} onChange={(e) => setPayload((prev) => ({ ...prev, status: e.target.value as ReportStatus }))}><option value="open">OtevĹ™enĂ©</option><option value="in_progress">V Ĺ™eĹˇenĂ­</option><option value="closed">UzavĹ™enĂ©</option></select></FormField><FormField id="report_description" label="Popis (volitelnĂ©)"><textarea id="report_description" className="k-input" value={payload.description ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} /></FormField></div></div>}</main>;
}

function ReportsDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'HlĂˇĹˇenĂ­', '/hlaseni');
  const stateMarker = <StateMarker state={state} />;
  const { id } = useParams();
  const [item, setItem] = React.useState<Report | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default' || !id) {
      return;
    }
    fetchJson<Report>(`/api/v1/reports/${id}`)
      .then(setItem)
      .catch(() => setError('HlĂˇĹˇenĂ­ nebylo nalezeno.'));
  }, [id, state]);

  return <main className="k-page" data-testid="reports-detail-page">{stateMarker}<h1>Detail hlĂˇĹˇenĂ­</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/hlaseni">ZpÄ›t na seznam</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/hlaseni">ZpÄ›t na seznam</Link><Link className="k-button" to={`/hlaseni/${item.id}/edit`}>Upravit</Link></div><DataTable headers={['PoloĹľka', 'Hodnota']} rows={[[ 'NĂˇzev', item.title],[ 'Stav', reportStatusLabel(item.status)],[ 'Popis', item.description ?? '-' ],[ 'VytvoĹ™eno', formatDateTime(item.created_at) ],[ 'AktualizovĂˇno', formatDateTime(item.updated_at) ]]} /></div> : <SkeletonPage />}</main>;
}

function UsersAdmin(): JSX.Element {
  const [users, setUsers] = React.useState<PortalUser[] | null>(null);
  const [selected, setSelected] = React.useState<PortalUser | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const [createFirstName, setCreateFirstName] = React.useState('');
  const [createLastName, setCreateLastName] = React.useState('');
  const [createEmail, setCreateEmail] = React.useState('');
  const [createPassword, setCreatePassword] = React.useState('');
  const [createRoles, setCreateRoles] = React.useState<PortalRole[]>([]);
  const [createPhone, setCreatePhone] = React.useState('');
  const [createNote, setCreateNote] = React.useState('');

  const [editFirstName, setEditFirstName] = React.useState('');
  const [editLastName, setEditLastName] = React.useState('');
  const [editEmail, setEditEmail] = React.useState('');
  const [editRoles, setEditRoles] = React.useState<PortalRole[]>([]);
  const [editPhone, setEditPhone] = React.useState('');
  const [editNote, setEditNote] = React.useState('');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const e164Regex = /^\+[1-9]\d{1,14}$/;

  const createEmailValid = emailRegex.test(createEmail.trim().toLowerCase());
  const editEmailValid = emailRegex.test(editEmail.trim().toLowerCase());
  const createPhoneValid = createPhone.trim() === '' || e164Regex.test(createPhone.trim());
  const editPhoneValid = editPhone.trim() === '' || e164Regex.test(editPhone.trim());

  const createValid =
    createFirstName.trim().length > 0
    && createLastName.trim().length > 0
    && createEmailValid
    && createPassword.length >= 8
    && createRoles.length > 0
    && createPhoneValid;

  const editValid =
    editFirstName.trim().length > 0
    && editLastName.trim().length > 0
    && editEmailValid
    && editRoles.length > 0
    && editPhoneValid;

  function syncEdit(user: PortalUser | null): void {
    if (!user) {
      setEditFirstName('');
      setEditLastName('');
      setEditEmail('');
      setEditRoles([]);
      setEditPhone('');
      setEditNote('');
      return;
    }
    setEditFirstName(user.first_name);
    setEditLastName(user.last_name);
    setEditEmail(user.email);
    setEditRoles(user.roles);
    setEditPhone(user.phone ?? '');
    setEditNote(user.note ?? '');
  }

  const load = React.useCallback(() => {
    setError(null);
    void fetchJson<PortalUser[]>('/api/v1/users')
      .then((items) => {
        setUsers(items);
        const nextSelected = selected ? items.find((item) => item.id === selected.id) ?? items[0] ?? null : items[0] ?? null;
        setSelected(nextSelected);
        syncEdit(nextSelected);
      })
      .catch(() => setError('NepodaĹ™ilo se naÄŤĂ­st uĹľivatele.'));
  }, [selected]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function createUser(): Promise<void> {
    if (!createValid) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: PortalUserCreatePayload = {
        first_name: createFirstName.trim(),
        last_name: createLastName.trim(),
        email: createEmail.trim().toLowerCase(),
        password: createPassword,
        roles: createRoles,
        ...(createPhone.trim() ? { phone: createPhone.trim() } : {}),
        ...(createNote.trim() ? { note: createNote.trim() } : {}),
      };
      const created = await fetchJson<PortalUser>('/api/v1/users', { method: 'POST', body: JSON.stringify(payload) });
      setUsers((prev) => (prev ? [...prev, created] : [created]));
      setSelected(created);
      syncEdit(created);
      setCreateFirstName('');
      setCreateLastName('');
      setCreateEmail('');
      setCreatePassword('');
      setCreateRoles([]);
      setCreatePhone('');
      setCreateNote('');
      setMessage('UĹľivatel byl vytvoĹ™en.');
    } catch {
      setError('UĹľivatele se nepodaĹ™ilo vytvoĹ™it.');
    } finally {
      setSaving(false);
    }
  }

  async function saveSelectedUser(): Promise<void> {
    if (!selected || !editValid) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: PortalUserUpsertPayload = {
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        email: editEmail.trim().toLowerCase(),
        roles: editRoles,
        ...(editPhone.trim() ? { phone: editPhone.trim() } : {}),
        ...(editNote.trim() ? { note: editNote.trim() } : {}),
      };
      const updated = await fetchJson<PortalUser>(`/api/v1/users/${selected.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? null);
      setSelected(updated);
      syncEdit(updated);
      setMessage('UĹľivatel byl upraven.');
    } catch {
      setError('UĹľivatele se nepodaĹ™ilo upravit.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: PortalUser): Promise<void> {
    try {
      const updated = await fetchJson<PortalUser>(`/api/v1/users/${user.id}/active`, { method: 'PATCH', body: JSON.stringify({ is_active: !user.is_active }) });
      setUsers((prev) => prev?.map((u) => (u.id === user.id ? updated : u)) ?? null);
      setSelected(updated);
      syncEdit(updated);
    } catch {
      setError('NepodaĹ™ilo se zmÄ›nit stav uĹľivatele.');
    }
  }

  async function sendPasswordResetLink(user: PortalUser): Promise<void> {
    try {
      await fetchJson<{ ok: boolean }>(`/api/v1/users/${user.id}/password/reset-link`, { method: 'POST' });
    } finally {
      setMessage('Pokud ĂşÄŤet existuje a je dostupnĂ˝ e-mail, byl odeslĂˇn odkaz na zmÄ›nu hesla.');
    }
  }

  const roleToggle = (selectedRoles: PortalRole[], setter: (value: PortalRole[]) => void, role: PortalRole): void => {
    setter(selectedRoles.includes(role) ? selectedRoles.filter((item) => item !== role) : [...selectedRoles, role]);
  };

  const normalizePhoneInput = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    if (trimmed.startsWith('+')) return trimmed;
    if (/^420\d+$/.test(trimmed)) return `+${trimmed}`;
    return trimmed;
  };

  function getCsrfTokenFromCookie(): string {
    const cookieString = typeof document !== 'undefined' ? document.cookie : '';
    if (!cookieString) return '';

    const cookiePair = cookieString
      .split('; ')
      .find((row) => row.startsWith('kajovo_csrf='));

    if (!cookiePair) return '';

    const [, value] = cookiePair.split('=');
    return decodeURIComponent(value ?? '');
  }

  async function deleteUser(user: PortalUser): Promise<void> {
    if (!window.confirm(`Opravdu smazat uĹľivatele ${user.email}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await fetchJson<void>(`/api/v1/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': getCsrfTokenFromCookie(),
        },
      });
      setMessage('UĹľivatel byl smazĂˇn.');
      setSelected(null);
      load();
    } catch {
      setError('SmazĂˇnĂ­ uĹľivatele se nepodaĹ™ilo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="k-page" data-testid="users-admin-page">
      <h1>UĹľivatelĂ©</h1>
      {error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button secondary" type="button" onClick={load}>Zkusit znovu</button>} /> : null}
      {message ? <StateView title="Info" description={message} stateKey="empty" /> : null}
      {users === null ? <SkeletonPage /> : (
        <div className="k-grid cards-2">
          <Card title="Seznam uĹľivatelĹŻ">
            {users.length === 0 ? <StateView title="PrĂˇzdnĂ˝ stav" description="ZatĂ­m neexistujĂ­ ĹľĂˇdnĂ­ uĹľivatelĂ© portĂˇlu." stateKey="empty" /> : (
              <DataTable
                headers={['JmĂ©no', 'PĹ™Ă­jmenĂ­', 'Email', 'Role', 'PoslednĂ­ pĹ™ihlĂˇĹˇenĂ­', 'Stav']}
                rows={users.map((u) => [
                  <button key={u.id} className="k-nav-link" type="button" onClick={() => { setSelected(u); syncEdit(u); }}>{u.first_name}</button>,
                  u.last_name,
                  u.email,
                  u.roles.join(', '),
                  formatDateTime(u.last_login_at),
                  u.is_active ? 'AktivnĂ­' : 'NeaktivnĂ­',
                ])}
              />
            )}
          </Card>

          <Card title="Detail / Ăşprava">
            {!selected ? <p>Vyberte uĹľivatele.</p> : (
              <div className="k-form-grid">
                <FormField id="edit_first_name" label="JmĂ©no">
                  <input id="edit_first_name" className="k-input" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
                </FormField>
                <FormField id="edit_last_name" label="PĹ™Ă­jmenĂ­">
                  <input id="edit_last_name" className="k-input" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
                </FormField>
                <FormField id="edit_email" label="Email">
                  <input id="edit_email" className="k-input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                </FormField>
                {!editEmailValid ? <small>NeplatnĂ˝ email.</small> : null}
                <FormField id="edit_phone" label="Telefon (E.164, volitelnĂ©)">
                  <input id="edit_phone" className="k-input" value={editPhone} onChange={(e) => setEditPhone(normalizePhoneInput(e.target.value))} placeholder="+420123456789" />
                </FormField>
                {!editPhoneValid ? <small>Telefon musĂ­ bĂ˝t ve formĂˇtu E.164.</small> : null}
                <FormField id="edit_note" label="PoznĂˇmka (volitelnĂ©)">
                  <textarea id="edit_note" className="k-input" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                </FormField>
                <fieldset className="k-card"><legend>Role</legend>
                  {portalRoleOptions.map((role) => (
                    <label key={`edit-role-${role}`} className="k-role-label">
                      <input type="checkbox" checked={editRoles.includes(role)} onChange={() => roleToggle(editRoles, setEditRoles, role)} /> {role}
                    </label>
                  ))}
                </fieldset>
                <div className="k-toolbar">
                  <button className="k-button" type="button" onClick={() => void saveSelectedUser()} disabled={!editValid || saving}>UloĹľit zmÄ›ny</button>
                  <button className="k-button secondary" type="button" onClick={() => void toggleActive(selected)}>
                    {selected.is_active ? 'ZakĂˇzat' : 'Povolit'}
                  </button>
                  <button className="k-button secondary" type="button" onClick={() => void sendPasswordResetLink(selected)}>
                    Poslat link na zmÄ›nu hesla
                  </button>
                  <button className="k-button secondary" type="button" onClick={() => void deleteUser(selected)}>
                    Smazat
                  </button>
                </div>
              </div>
            )}
          </Card>

          <Card title="VytvoĹ™it uĹľivatele">
            <div className="k-form-grid">
              <FormField id="create_first_name" label="JmĂ©no">
                <input id="create_first_name" className="k-input" value={createFirstName} onChange={(e) => setCreateFirstName(e.target.value)} />
              </FormField>
              <FormField id="create_last_name" label="PĹ™Ă­jmenĂ­">
                <input id="create_last_name" className="k-input" value={createLastName} onChange={(e) => setCreateLastName(e.target.value)} />
              </FormField>
              <FormField id="create_email" label="Email">
                <input id="create_email" className="k-input" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
              </FormField>
              {!createEmailValid && createEmail.trim() ? <small>NeplatnĂ˝ email.</small> : null}
              <FormField id="create_password" label="DoÄŤasnĂ© heslo">
                <input id="create_password" className="k-input" type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} />
              </FormField>
              <FormField id="create_phone" label="Telefon (E.164, volitelnĂ©)">
                <input id="create_phone" className="k-input" value={createPhone} onChange={(e) => setCreatePhone(normalizePhoneInput(e.target.value))} placeholder="+420123456789" />
              </FormField>
              {!createPhoneValid ? <small>Telefon musĂ­ bĂ˝t ve formĂˇtu E.164.</small> : null}
              <FormField id="create_note" label="PoznĂˇmka (volitelnĂ©)">
                <textarea id="create_note" className="k-input" value={createNote} onChange={(e) => setCreateNote(e.target.value)} />
              </FormField>
              <fieldset className="k-card"><legend>Role</legend>
                {portalRoleOptions.map((role) => (
                  <label key={`create-role-${role}`} className="k-role-label">
                    <input type="checkbox" checked={createRoles.includes(role)} onChange={() => roleToggle(createRoles, setCreateRoles, role)} /> {role}
                  </label>
                ))}
              </fieldset>
              <button className="k-button" type="button" onClick={() => void createUser()} disabled={!createValid || saving}>VytvoĹ™it uĹľivatele</button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}

function SettingsAdmin(): JSX.Element {
  const [host, setHost] = React.useState('');
  const [port, setPort] = React.useState(587);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [useTls, setUseTls] = React.useState(true);
  const [useSsl, setUseSsl] = React.useState(false);
  const [testRecipient, setTestRecipient] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    setMessage(null);
    void fetchJson<SmtpSettingsReadModel>('/api/v1/admin/settings/smtp')
      .then((data) => {
        setHost(data.host);
        setPort(data.port);
        setUsername(data.username);
        setUseTls(data.use_tls);
        setUseSsl(data.use_ssl);
        setTestRecipient(data.username);
      })
      .catch((err: Error) => {
        if (err.message.includes('SMTP settings not configured')) {
          return;
        }
        setError('NepodaĹ™ilo se naÄŤĂ­st SMTP nastavenĂ­.');
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function save(): Promise<void> {
    if (!host.trim() || !username.trim() || !password.trim()) {
      setError('Host, uĹľivatel a heslo jsou povinnĂ©.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await fetchJson<SmtpSettingsReadModel>('/api/v1/admin/settings/smtp', {
        method: 'PUT',
        body: JSON.stringify({
          host: host.trim(),
          port: Number(port),
          username: username.trim(),
          password,
          use_tls: useTls,
          use_ssl: useSsl,
        }),
      });
      setMessage('SMTP nastavenĂ­ bylo uloĹľeno.');
      setPassword('');
    } catch {
      setError('SMTP nastavenĂ­ se nepodaĹ™ilo uloĹľit.');
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail(): Promise<void> {
    const recipient = testRecipient.trim();
    if (!recipient) {
      setError('VyplĹte pĹ™Ă­jemce testovacĂ­ho e-mailu.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await fetchJson<{ ok: boolean }>('/api/v1/admin/settings/smtp/test-email', {
        method: 'POST',
        body: JSON.stringify({ recipient }),
      });
      setMessage('TestovacĂ­ e-mail byl odeslĂˇn.');
    } catch {
      setError('TestovacĂ­ e-mail se nepodaĹ™ilo odeslat.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="k-page" data-testid="settings-admin-page">
      <h1>NastavenĂ­ SMTP</h1>
      {error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button secondary" type="button" onClick={load}>Zkusit znovu</button>} /> : null}
      {message ? <StateView title="Info" description={message} stateKey="empty" /> : null}
      {loading ? <SkeletonPage /> : (
        <Card title="E-mailovĂˇ konfigurace">
          <div className="k-form-grid">
            <FormField id="smtp_host" label="SMTP host">
              <input id="smtp_host" className="k-input" value={host} onChange={(e) => setHost(e.target.value)} />
            </FormField>
            <FormField id="smtp_port" label="SMTP port">
              <input id="smtp_port" className="k-input" type="number" value={port} onChange={(e) => setPort(Number(e.target.value) || 0)} />
            </FormField>
            <FormField id="smtp_username" label="SMTP uĹľivatel">
              <input id="smtp_username" className="k-input" value={username} onChange={(e) => setUsername(e.target.value)} />
            </FormField>
            <FormField id="smtp_password" label="SMTP heslo">
              <input id="smtp_password" className="k-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
            <label className="k-role-label">
              <input type="checkbox" checked={useTls} onChange={(e) => setUseTls(e.target.checked)} /> PouĹľĂ­t TLS
            </label>
            <label className="k-role-label">
              <input type="checkbox" checked={useSsl} onChange={(e) => setUseSsl(e.target.checked)} /> PouĹľĂ­t SSL
            </label>
            <FormField id="smtp_test_recipient" label="TestovacĂ­ pĹ™Ă­jemce">
              <input id="smtp_test_recipient" className="k-input" type="email" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} />
            </FormField>
            <div className="k-toolbar">
              <button className="k-button" type="button" onClick={() => void save()} disabled={saving}>UloĹľit SMTP</button>
              <button className="k-button secondary" type="button" onClick={() => void sendTestEmail()} disabled={saving}>Odeslat testovacĂ­ e-mail</button>
            </div>
          </div>
        </Card>
      )}
    </main>
  );
}

type AccessDeniedProps = {
  moduleLabel: string;
  role: string;
  userId: string;
};

function AccessDeniedPage({ moduleLabel, role, userId }: AccessDeniedProps): JSX.Element {
  return (
    <main className="k-page" data-testid="access-denied-page">
      <StateView
        title="PĹ™Ă­stup odepĹ™en"
        description={`Role ${role} (uĹľivatel ${userId}) nemĂˇ oprĂˇvnÄ›nĂ­ pro modul ${moduleLabel}.`}
        stateKey="error"
        action={<Link className="k-button secondary" to="/">ZpÄ›t na pĹ™ehled</Link>}
      />
    </main>
  );
}

function AdminLoginPage(): JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [hintStatus, setHintStatus] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setHintStatus(null);
    const principal = email.trim();
    if (!principal || !password) {
      setError('VyplĹte email i heslo.');
      return;
    }
    try {
      await apiClient.adminLoginApiAuthAdminLoginPost({ email: principal, password });
      window.location.assign('/admin/');
    } catch {
      setError('NeplatnĂ© pĹ™ihlaĹˇovacĂ­ Ăşdaje.');
    }
  }

  async function sendPasswordHint(): Promise<void> {
    setHintStatus(null);
    await fetchJson('/api/auth/admin/hint', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    setHintStatus('Pokud ĂşÄŤet existuje, byl odeslĂˇn odkaz pro odblokovĂˇnĂ­.');
  }

  return (
    <main className="k-page k-admin-login-page" data-testid="admin-login-page">
      <section className="k-admin-login-layout">
        <Card title="KĂˇjovoHotel Admin login">
          <img className="k-admin-login-logo" src={brandWordmark} alt="KĂˇjovoHotel" />
          <form className="k-form-grid" onSubmit={(event) => void submit(event)}>
            <FormField id="admin_login_email" label="Admin email">
              <input id="admin_login_email" className="k-input" value={email} onChange={(event) => setEmail(event.target.value)} />
            </FormField>
            <FormField id="admin_login_password" label="Admin heslo">
              <input id="admin_login_password" className="k-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </FormField>
            {error ? <StateView title="Chyba" description={error} stateKey="error" /> : null}
            {hintStatus ? <StateView title="Info" description={hintStatus} stateKey="empty" /> : null}
            <div className="k-toolbar">
              <button className="k-button" type="submit">PĹ™ihlĂˇsit</button>
              <button
                className="k-button secondary"
                type="button"
                onClick={() => void sendPasswordHint()}
                disabled={!email.trim()}
              >
                ZapomenutĂ© heslo
              </button>
            </div>
          </form>
        </Card>
        <aside className="k-admin-login-figure" aria-label="KĂˇja pro admin login" data-brand-element="true">
          <img src={adminLoginFigure} alt="KĂˇja pro administraci" loading="lazy" />
        </aside>
      </section>
      <KajovoSign />
    </main>
  );
}

const ADMIN_ROLE_VIEW_LABELS: Record<string, string> = {
  admin: 'Administrátor',
  recepce: 'Recepce',
  pokojská: 'Pokojská',
  údržba: 'Údržba',
  snídaně: 'Snídaně',
  sklad: 'Sklad',
};

const ADMIN_ROLE_VIEW_MODULES: Record<string, string[]> = {
  recepce: ['lost_found', 'breakfast'],
  pokojská: ['lost_found', 'issues', 'breakfast', 'inventory'],
  údržba: ['issues'],
  snídaně: ['breakfast', 'issues', 'inventory'],
  sklad: ['breakfast', 'issues', 'inventory'],
};

const ADMIN_ROLE_VIEW_OPTIONS = ['admin', 'recepce', 'pokojská', 'údržba', 'snídaně', 'sklad'] as const;

type AdminRoleView = typeof ADMIN_ROLE_VIEW_OPTIONS[number];

function AppRoutes(): JSX.Element {
  const location = useLocation();
  const [auth, setAuth] = React.useState<AuthProfile | null>(null);

  React.useEffect(() => {
    void resolveAuthProfile()
      .then(setAuth)
      .catch(() =>
        setAuth({
          userId: 'anonymous',
          role: 'recepce',
          roles: ['recepce'],
          activeRole: null,
          permissions: rolePermissions('recepce'),
          actorType: 'portal',
        })
      );
  }, []);

  if (!auth) {
    return <SkeletonPage />;
  }

  if (location.pathname === '/login') {
    if (auth.actorType === 'admin') {
      return <Navigate to="/" replace />;
    }
    return <AdminLoginPage />;
  }

  if (auth.actorType !== 'admin') {
    return <Navigate to="/login" replace />;
  }

  const testNav = typeof window !== 'undefined' ? (window as Window & { __KAJOVO_TEST_NAV__?: unknown }).__KAJOVO_TEST_NAV__ : undefined;
  const injectedModules = Array.isArray((testNav as { modules?: unknown } | undefined)?.modules)
    ? ((testNav as { modules: typeof ia.modules }).modules ?? [])
    : [];
  const adminModules = auth.role === 'admin'
    ? [
      { key: 'users', label: 'Uživatelé', route: '/uzivatele', icon: 'users', active: true, section: 'records', permissions: ['read'] },
      { key: 'settings', label: 'Nastavení', route: '/nastaveni', icon: 'settings', active: true, section: 'records', permissions: ['read'] },
    ]
    : [];
  const modules = [...ia.modules, ...adminModules, ...injectedModules];

  const [roleView, setRoleView] = React.useState<AdminRoleView>(() => {
    if (typeof window === 'undefined') {
      return 'admin';
    }
    const stored = window.sessionStorage.getItem('kajovo_admin_role_view') as AdminRoleView | null;
    return stored ?? 'admin';
  });

  React.useEffect(() => {
    if (auth.role === 'admin' && typeof window !== 'undefined') {
      window.sessionStorage.setItem('kajovo_admin_role_view', roleView);
    }
  }, [auth.role, roleView]);

  const roleViewKeys = auth.role === 'admin' && roleView !== 'admin'
    ? (ADMIN_ROLE_VIEW_MODULES[roleView] ?? [])
    : null;
  const moduleByKey = new Map(modules.map((module) => [module.key, module]));
  const orderedRoleModules = roleViewKeys
    ? roleViewKeys.map((key) => moduleByKey.get(key)).filter((module): module is typeof modules[number] => Boolean(module))
    : modules;
  const allowedModules = orderedRoleModules.filter((module) => {
    // View-state odkazy jsou interní QA trasa a v produkční navigaci nemají být vidět.
    if (module.route.includes('?state=')) {
      return false;
    }
    const required =
      Array.isArray(module.permissions) && module.permissions.length > 0 ? module.permissions : null;
    if (!required) {
      // Testovací / injektované moduly bez explicitních oprávnění ukazujeme vždy.
      return true;
    }
    return required.every((permission) => auth.permissions.has(`${module.key}:${permission}`));
  });
  const extraModules = roleViewKeys
    ? modules.filter((module) => {
      const hasPermissions = Array.isArray(module.permissions) && module.permissions.length > 0;
      if (hasPermissions) {
        return false;
      }
      return !roleViewKeys.includes(module.key);
    })
    : [];
  const adminNavModules = [...allowedModules, ...extraModules].map((module) => ({
    ...module,
    route: toAdminNavRoute(module.route),
  }));
  const isAllowed = (moduleKey: string): boolean => canReadModule(auth.permissions, moduleKey);
  const panelLayout = auth.role === 'admin' ? 'admin' : 'portal';
  const adminCurrentPath = location.pathname === '/' ? '/admin/' : `/admin${location.pathname}`;

  return (
    <AppShell
      modules={adminNavModules}
      navigationRules={ia.navigation.rules}
      navigationSections={ia.navigation.sections}
      currentPath={adminCurrentPath}
      panelLayout={panelLayout}
>
      {auth.role === 'admin' ? (
        <div className="k-toolbar" data-testid="admin-role-switcher">
          <span>Role pohledu:</span>
          {ADMIN_ROLE_VIEW_OPTIONS.map((role) => (
            <button
              key={role}
              className={roleView === role ? 'k-button' : 'k-button secondary'}
              type="button"
              onClick={() => setRoleView(role)}
            >
              {ADMIN_ROLE_VIEW_LABELS[role] ?? role}
            </button>
          ))}
        </div>
      ) : null}
      <Routes>
        <Route path="/" element={isAllowed('dashboard') ? <Dashboard /> : <AccessDeniedPage moduleLabel="PĹ™ehled" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane" element={isAllowed('breakfast') ? <BreakfastList /> : <AccessDeniedPage moduleLabel="SnĂ­danÄ›" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/nova" element={isAllowed('breakfast') ? <BreakfastForm mode="create" /> : <AccessDeniedPage moduleLabel="SnĂ­danÄ›" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/:id" element={isAllowed('breakfast') ? <BreakfastDetail /> : <AccessDeniedPage moduleLabel="SnĂ­danÄ›" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/:id/edit" element={isAllowed('breakfast') ? <BreakfastForm mode="edit" /> : <AccessDeniedPage moduleLabel="SnĂ­danÄ›" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy" element={isAllowed('lost_found') ? <LostFoundList /> : <AccessDeniedPage moduleLabel="ZtrĂˇty a nĂˇlezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/novy" element={isAllowed('lost_found') ? <LostFoundForm mode="create" /> : <AccessDeniedPage moduleLabel="ZtrĂˇty a nĂˇlezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id" element={isAllowed('lost_found') ? <LostFoundDetail /> : <AccessDeniedPage moduleLabel="ZtrĂˇty a nĂˇlezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id/edit" element={isAllowed('lost_found') ? <LostFoundForm mode="edit" /> : <AccessDeniedPage moduleLabel="ZtrĂˇty a nĂˇlezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady" element={isAllowed('issues') ? <IssuesList /> : <AccessDeniedPage moduleLabel="ZĂˇvady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/nova" element={isAllowed('issues') ? <IssuesForm mode="create" /> : <AccessDeniedPage moduleLabel="ZĂˇvady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/:id" element={isAllowed('issues') ? <IssuesDetail /> : <AccessDeniedPage moduleLabel="ZĂˇvady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/:id/edit" element={isAllowed('issues') ? <IssuesForm mode="edit" /> : <AccessDeniedPage moduleLabel="ZĂˇvady" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad" element={isAllowed('inventory') ? <InventoryList /> : <AccessDeniedPage moduleLabel="SkladovĂ© hospodĂˇĹ™stvĂ­" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/nova" element={isAllowed('inventory') ? <InventoryForm mode="create" /> : <AccessDeniedPage moduleLabel="SkladovĂ© hospodĂˇĹ™stvĂ­" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/:id" element={isAllowed('inventory') ? <InventoryDetail /> : <AccessDeniedPage moduleLabel="SkladovĂ© hospodĂˇĹ™stvĂ­" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/:id/edit" element={isAllowed('inventory') ? <InventoryForm mode="edit" /> : <AccessDeniedPage moduleLabel="SkladovĂ© hospodĂˇĹ™stvĂ­" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni" element={isAllowed('reports') ? <ReportsList /> : <AccessDeniedPage moduleLabel="HlĂˇĹˇenĂ­" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/nove" element={isAllowed('reports') ? <ReportsForm mode="create" /> : <AccessDeniedPage moduleLabel="HlĂˇĹˇenĂ­" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/:id" element={isAllowed('reports') ? <ReportsDetail /> : <AccessDeniedPage moduleLabel="HlĂˇĹˇenĂ­" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/:id/edit" element={isAllowed('reports') ? <ReportsForm mode="edit" /> : <AccessDeniedPage moduleLabel="HlĂˇĹˇenĂ­" role={auth.role} userId={auth.userId} />} />
        <Route path="/uzivatele" element={isAllowed('users') ? <UsersAdmin /> : <AccessDeniedPage moduleLabel="UĹľivatelĂ©" role={auth.role} userId={auth.userId} />} />
        <Route path="/nastaveni" element={isAllowed('settings') ? <SettingsAdmin /> : <AccessDeniedPage moduleLabel="NastavenĂ­" role={auth.role} userId={auth.userId} />} />
        <Route path="/login" element={<AdminLoginPage />} />
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
      <BrowserRouter basename="/admin">
        <AppRoutes />
      </BrowserRouter>
    </ClientErrorBoundary>
  </React.StrictMode>,
);






