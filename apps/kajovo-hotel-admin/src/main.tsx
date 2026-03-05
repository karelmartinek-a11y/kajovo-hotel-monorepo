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

type InventoryMovement = InventoryMovementRead & {
  document_number?: string | null;
  document_reference?: string | null;
  document_date?: string | null;
};



type InventoryDetail = Omit<InventoryItemWithAuditRead, 'movements'> & { movements: InventoryMovement[] };

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
const portalRoleLabels: Record<PortalRole, string> = {
  pokojskĂˇ: 'PokojskĂˇ',
  ĂşdrĹľba: 'ĂšdrĹľba',
  recepce: 'Recepce',
  snĂ­danÄ›: 'SnĂ­danÄ›',
  sklad: 'Sklad',
};

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
            description={this.state.message ?? 'Aplikace narazila na neoĂ„Ĺ¤ekÄ‚Ë‡vanou chybu.'}
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
  pending: 'Ă„ĹšekÄ‚Ë‡',
  preparing: 'PÄąâ„˘ipravuje se',
  served: 'VydÄ‚Ë‡no',
  cancelled: 'ZruÄąË‡eno',
};

const lostFoundStatusLabels: Record<LostFoundStatus, string> = {
  new: 'Nový',
  stored: 'Uskladněno',
  disposed: 'Zlikvidovat',
  claimed: 'Nárokováno',
  returned: 'Vráceno',
};

const lostFoundTypeLabels: Record<LostFoundType, string> = {
  lost: 'Ztraceno',
  found: 'Nalezeno',
};

const issuePriorityLabels: Record<IssuePriority, string> = {
  low: 'NÄ‚Â­zkÄ‚Ë‡',
  medium: 'StÄąâ„˘ednÄ‚Â­',
  high: 'VysokÄ‚Ë‡',
  critical: 'KritickÄ‚Ë‡',
};

const issueStatusLabels: Record<IssueStatus, string> = {
  new: 'Nová',
  in_progress: 'V řešení',
  resolved: 'Odstraněno',
  closed: 'Uzavřena',
};

const reportStatusLabels: Record<ReportStatus, string> = {
  open: 'OtevÄąâ„˘enÄ‚Â©',
  in_progress: 'V Äąâ„˘eÄąË‡enÄ‚Â­',
  closed: 'UzavÄąâ„˘enÄ‚Â©',
};


const inventoryMovementLabels: Record<InventoryMovementType, string> = {
  in: 'PÄąâ„˘Ä‚Â­jem',
  out: 'VÄ‚Ëťdej',
  adjust: 'Odpis',
};



function breakfastStatusLabel(status: BreakfastStatus | null | undefined): string {
  return status ? statusLabels[status] : '-';
}

function lostFoundStatusLabel(status: LostFoundStatus | null | undefined): string {
  return status ? lostFoundStatusLabels[status] : '-';
}

const lostFoundTagLabels: Record<string, string> = {
  kontaktova: 'Kontaktová',
  nezastizen: 'Nezastižen',
  vyzvedne: 'Vyzvedne',
  odesleme: 'Odešleme',
};

function lostFoundTagLabel(tag: string): string {
  return lostFoundTagLabels[tag] ?? tag;
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
  default: 'VÄ‚ËťchozÄ‚Â­',
  loading: 'NaĂ„Ĺ¤Ä‚Â­tÄ‚Ë‡nÄ‚Â­',
  empty: 'PrÄ‚Ë‡zdno',
  error: 'Chyba',
  offline: 'Offline',
  maintenance: 'Ä‚ĹˇdrÄąÄľba',
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
          title="PrÄ‚Ë‡zdnÄ‚Ëť stav"
          description={`Pro modul ${title} zatÄ‚Â­m nejsou dostupnÄ‚Ë‡ data.`}
          stateKey="empty"
          action={<Link className="k-button secondary" to={fallbackRoute}>Obnovit data</Link>}
        />
      );
    case 'error':
      return (
        <StateView
          title="Chyba"
          description="NepodaÄąâ„˘ilo se naĂ„Ĺ¤Ä‚Â­st data. Zkuste strÄ‚Ë‡nku obnovit."
          stateKey="error"
          action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>}
        />
      );
    case 'offline':
      return (
        <StateView
          title="Offline"
          description="Aplikace je doĂ„Ĺ¤asnĂ„â€ş bez pÄąâ„˘ipojenÄ‚Â­."
          stateKey="offline"
          action={<Link className="k-button secondary" to="/offline">Diagnostika pÄąâ„˘ipojenÄ‚Â­</Link>}
        />
      );
    case 'maintenance':
      return (
        <StateView
          title="Ä‚ĹˇdrÄąÄľba"
          description="Modul je doĂ„Ĺ¤asnĂ„â€ş v reÄąÄľimu Ä‚ĹźdrÄąÄľby."
          stateKey="maintenance"
          action={<Link className="k-button secondary" to="/maintenance">Zobrazit status</Link>}
        />
      );
    case '404':
      return (
        <StateView
          title="404"
          description="PoÄąÄľadovanÄ‚Ëť obsah nebyl nalezen."
          stateKey="404"
          action={
            <Link className="k-nav-link" to={fallbackRoute}>
              ZpĂ„â€şt
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
  if (inventoryMoveId && method === 'POST') return (await apiClient.addMovementApiV1InventoryItemIdMovementsPost(Number(inventoryMoveId[1]), body as { movement_type: InventoryMovementType; quantity: number; document_date: string; document_reference?: string | null; note?: string | null })) as T;

  if (path === '/api/v1/reports' && method === 'GET') return (await apiClient.listReportsApiV1ReportsGet({ status: url.searchParams.get('status') })) as T;
  const reportId = path.match(/^\/api\/v1\/reports\/(\d+)$/);
  if (reportId && method === 'GET') return (await apiClient.getReportApiV1ReportsReportIdGet(Number(reportId[1]))) as T;
  if (reportId && method === 'PUT') return (await apiClient.updateReportApiV1ReportsReportIdPut(Number(reportId[1]), body as ReportCreate)) as T;
  if (path === '/api/v1/reports' && method === 'POST') return (await apiClient.createReportApiV1ReportsPost(body as ReportCreate)) as T;



  if (path === '/api/v1/users' && method === 'GET') {
    const response = await fetch(path, { credentials: 'include' });
    if (!response.ok) throw new Error('NepodaÄąâ„˘ilo se naĂ„Ĺ¤Ä‚Â­st uÄąÄľivatele.');
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
  const stateUI = stateViewForRoute(state, 'PÄąâ„˘ehled', '/');
  const stateMarker = <StateMarker state={state} />;

  return (
    <main className="k-page" data-testid="dashboard-page">
      {stateMarker}
      <h1>PÄąâ„˘ehled</h1>
      <StateSwitcher />
      {stateUI ?? (
        <div className="k-grid cards-3">
          <Card title="SnÄ‚Â­danĂ„â€ş dnes">
            <strong>18</strong>
            <p>3 Ă„Ĺ¤ekajÄ‚Â­cÄ‚Â­ objednÄ‚Ë‡vky</p>
          </Card>
          <Card title="ZÄ‚Ë‡vady">
            <strong>4</strong>
            <p>1 kritickÄ‚Ë‡ zÄ‚Ë‡vada</p>
          </Card>
          <Card title="Sklad">
            <strong>12</strong>
            <p>2 poloÄąÄľky pod minimem</p>
          </Card>
        </div>
      )}
    </main>
  );
}

function BreakfastList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'SnÄ‚Â­danĂ„â€ş', '/snidane');
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
        setError('NepodaÄąâ„˘ilo se naĂ„Ĺ¤Ä‚Â­st seznam snÄ‚Â­danÄ‚Â­.');
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
      setImportInfo(`Import OK: ${result.items.length} pokojÄąĹ» (${result.date}).`);
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
        aria-label="Import PDF"
        onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
      />
      <button className="k-button secondary" type="button" onClick={() => void importPdf()}>
        Import PDF
      </button>
      <Link className="k-button" to="/snidane/nova">
        NovÄ‚Ë‡ objednÄ‚Ë‡vka
      </Link>
    </div>
  );

  return (
    <main className="k-page" data-testid="breakfast-list-page">
      {stateMarker}
      <h1>SnÄ‚Â­danĂ„â€ş</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : filteredItems.length === 0 ? (
        <>
          {breakfastToolbar}
          {importInfo ? <p>{importInfo}</p> : null}
          <StateView title="PrÄ‚Ë‡zdnÄ‚Ëť stav" description="Nebyly nalezeny ÄąÄľÄ‚Ë‡dnÄ‚Â© objednÄ‚Ë‡vky." stateKey="empty" action={<Link className="k-button" to="/snidane/nova">NovÄ‚Ë‡ objednÄ‚Ë‡vka</Link>} />
        </>
      ) : (
        <>
          <div className="k-grid cards-3">
            <Card title="ObjednÄ‚Ë‡vky dne">
              <strong>{summary?.total_orders ?? 0}</strong>
            </Card>
            <Card title="HostÄ‚Â© dne">
              <strong>{summary?.total_guests ?? 0}</strong>
            </Card>
            <Card title="Ă„ĹšekajÄ‚Â­cÄ‚Â­">
              <strong>{getSummaryCount(summary, 'pending')}</strong>
            </Card>
          </div>
          {breakfastToolbar}
          {importInfo ? <p>{importInfo}</p> : null}
          <DataTable
            headers={['Datum', 'Pokoj', 'Host', 'PoĂ„Ĺ¤et', 'Stav', 'PoznÄ‚Ë‡mka', 'Akce']}
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
  const stateUI = stateViewForRoute(state, 'SnÄ‚Â­danĂ„â€ş', '/snidane');
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
        setError('ObjednÄ‚Ë‡vku se nepodaÄąâ„˘ilo naĂ„Ĺ¤Ä‚Â­st.');
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
      setError('ObjednÄ‚Ë‡vku se nepodaÄąâ„˘ilo uloÄąÄľit.');
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'breakfast-create-page' : 'breakfast-edit-page'}>
      {stateMarker}
      <h1>{mode === 'create' ? 'NovÄ‚Ë‡ snÄ‚Â­danĂ„â€ş' : 'Upravit snÄ‚Â­dani'}</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/snidane">
              ZpĂ„â€şt na seznam
            </Link>
            <button className="k-button" type="button" onClick={() => void save()}>
              UloÄąÄľit
            </button>
          </div>
          <div className="k-form-grid">
            <FormField id="service_date" label="Datum sluÄąÄľby">
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
            <FormField id="guest_count" label="PoĂ„Ĺ¤et hostÄąĹ»">
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
                onChange={(event) =>                <option value="new">Nová</option>
                <option value="stored">Uskladněno</option>
                <option value="disposed">Zlikvidovat</option>
                <option value="claimed">Nárokováno</option>
                <option value="returned">Vráceno</option></select>
            </FormField>            <FormField id="tags" label="Tagy">
              <div className="k-toolbar">
                {Object.keys(lostFoundTagLabels).map((tag) => (
                  <label className="k-role-label" key={tag}>
                    <input
                      type="checkbox"
                      checked={(payload.tags ?? []).includes(tag)}
                      onChange={(event) => {
                        setPayload((prev) => {
                          const current = new Set(prev.tags ?? []);
                          if (event.target.checked) {
                            current.add(tag);
                          } else {
                            current.delete(tag);
                          }
                          return { ...prev, tags: Array.from(current) };
                        });
                      }}
                    />
                    {lostFoundTagLabel(tag)}
                  </label>
                ))}
              </div>
            </FormField>
            <FormField id="note" label="PoznÄ‚Ë‡mka">
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
  const stateUI = stateViewForRoute(state, 'SnÄ‚Â­danĂ„â€ş', '/snidane');
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
        setError('ObjednÄ‚Ë‡vka nebyla nalezena.');
      });
  }, [id, state]);

  return (
    <main className="k-page" data-testid="breakfast-detail-page">
      {stateMarker}
      <h1>Detail snÄ‚Â­danĂ„â€ş</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : notFound ? (
        <StateView title="404" description={error ?? 'ObjednÄ‚Ë‡vka neexistuje.'} stateKey="404" action={<Link className="k-button secondary" to="/snidane">ZpĂ„â€şt na seznam</Link>} />
      ) : item ? (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/snidane">
              ZpĂ„â€şt na seznam
            </Link>
            <Link className="k-button" to={`/snidane/${item.id}/edit`}>
              Upravit
            </Link>
          </div>
          <DataTable
            headers={['PoloÄąÄľka', 'Hodnota']}
            rows={[
              ['Datum sluÄąÄľby', item.service_date],
              ['Pokoj', item.room_number],
              ['Host', item.guest_name],
              ['PoĂ„Ĺ¤et hostÄąĹ»', item.guest_count],
              ['Stav', breakfastStatusLabel(item.status)],
              ['PoznÄ‚Ë‡mka', item.note ?? '-'],
            ]}
          />
        </div>
      ) : (
        <SkeletonPage />
      )}
    </main>
  );
}

function HousekeepingAdmin(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Pokojská', '/pokojska');
  const stateMarker = <StateMarker state={state} />;

  return (
    <main className="k-page" data-testid="housekeeping-admin-page">
      {stateMarker}
      <h1>Pokojská</h1>
      <StateSwitcher />
      {stateUI ?? (
        <StateView
          title="Pokojská"
          description="Tento modul je určen pro portálové role. Pro zadání použijte portál."
          stateKey="empty"
          action={<Link className="k-button secondary" to="/">Zpět na přehled</Link>}
        />
      )}
    </main>
  );
}

function LostFoundList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'ZtrÄ‚Ë‡ty a nÄ‚Ë‡lezy', '/ztraty-a-nalezy');
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
      .catch(() => setError('NepodaÄąâ„˘ilo se naĂ„Ĺ¤Ä‚Â­st poloÄąÄľky ztrÄ‚Ë‡t a nÄ‚Ë‡lezÄąĹ».'));
  }, [state, statusFilter, typeFilter]);

  return (
    <main className="k-page" data-testid="lost-found-list-page">
      {stateMarker}
      <h1>ZtrÄ‚Ë‡ty a nÄ‚Ë‡lezy</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : items.length === 0 ? (
        <StateView title="PrÄ‚Ë‡zdnÄ‚Ëť stav" description="ZatÄ‚Â­m nenÄ‚Â­ evidovÄ‚Ë‡na ÄąÄľÄ‚Ë‡dnÄ‚Ë‡ poloÄąÄľka." stateKey="empty" action={<Link className="k-button" to="/ztraty-a-nalezy/novy">PÄąâ„˘idat zÄ‚Ë‡znam</Link>} />
      ) : (
        <>
          <div className="k-grid cards-3">
            <Card title="Celkem poloÄąÄľek">
              <strong>{items.length}</strong>
            </Card>
            <Card title="NovÄ‚Ë‡">
              <strong>{items.filter((item) => item.status === 'new').length}</strong>
            </Card>
            <Card title="UskladnÄ›no">
              <strong>{items.filter((item) => item.status === 'stored').length}</strong>
            </Card>
          </div>
          <div className="k-toolbar">
            <select
              className="k-select"
              aria-label="Filtr typu"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as 'all' | LostFoundType)}
            >
              <option value="all">VÄąË‡echny typy</option>
              <option value="lost">ZtracenÄ‚Â©</option>
              <option value="found">NalezenÄ‚Â©</option>
            </select>
            <select
              className="k-select"
              aria-label="Filtr stavu"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | LostFoundStatus)}
            >
              <option value="all">VÄąË‡echny stavy</option>
              <option value="new">NovÄ‚Ë‡</option>
              <option value="stored">UskladnÄ›no</option>
              <option value="disposed">Zlikvidovat</option>
            </select>
            <Link className="k-button" to="/ztraty-a-nalezy/novy">
              NovÄ‚Ë‡ poloÄąÄľka
            </Link>
          </div>
          <DataTable
            headers={['Pokoj', 'Popis', 'Tagy', 'Stav', 'Miniatura', 'Akce']}
            rows={items.map((item) => [
              item.room_number ?? '-',
              item.description,
              item.tags && item.tags.length > 0 ? (
                <div className="k-inline-links" key={`tags-${item.id}`}>
                  {item.tags.map((tag) => (
                    <Badge key={`${item.id}-${tag}`} tone="warning">
                      {lostFoundTagLabel(tag)}
                    </Badge>
                  ))}
                </div>
              ) : (
                '-'
              ),
              lostFoundStatusLabel(item.status),
              item.photos && item.photos.length > 0 ? (
                <img
                  key={`thumb-${item.id}`}
                  src={`/api/v1/lost-found/${item.id}/photos/${item.photos[0].id}/thumb`}
                  alt="Miniatura nĂˇlezu"
                  className="k-photo-thumb"
                />
              ) : (
                '-'
              ),
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
  const stateUI = stateViewForRoute(state, 'ZtrÄ‚Ë‡ty a nÄ‚Ë‡lezy', '/ztraty-a-nalezy');
  const stateMarker = <StateMarker state={state} />;
  const { id } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = React.useState<LostFoundPayload>({
    item_type: 'found',
    description: '',
    category: '',
    location: '',
    room_number: '',
    event_at: '2026-02-18T10:00:00Z',
    status: 'new',
    tags: [],
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
          room_number: item.room_number ?? '',
          tags: item.tags ?? [],
          claimant_name: item.claimant_name ?? '',
          claimant_contact: item.claimant_contact ?? '',
          handover_note: item.handover_note ?? '',
        });
      })
      .catch(() => setError('PoloÄąÄľku se nepodaÄąâ„˘ilo naĂ„Ĺ¤Ä‚Â­st.'));
  }, [id, mode, state]);

  const save = async (): Promise<void> => {
    const body: LostFoundPayload = {
      ...payload,
      room_number: payload.room_number || null,
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
      setError('PoloÄąÄľku se nepodaÄąâ„˘ilo uloÄąÄľit.');
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'lost-found-create-page' : 'lost-found-edit-page'}>
      {stateMarker}
      <h1>{mode === 'create' ? 'NovÄ‚Ë‡ poloÄąÄľka' : 'Upravit poloÄąÄľku'}</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/ztraty-a-nalezy">
              ZpĂ„â€şt na seznam
            </Link>
            <button className="k-button" type="button" onClick={() => void save()}>
              UloÄąÄľit
            </button>
          </div>
          <div className="k-form-grid">
            <FormField id="item_type" label="Typ zÄ‚Ë‡znamu">
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
            <FormField id="location" label="MÄ‚Â­sto nÄ‚Ë‡lezu/ztrÄ‚Ë‡ty">
              <input
                id="location"
                className="k-input"
                value={payload.location}
                onChange={(event) => setPayload((prev) => ({ ...prev, location: event.target.value }))}
              />
            </FormField>
            <FormField id="room_number" label="Číslo pokoje (volitelné)">
              <input
                id="room_number"
                className="k-input"
                value={payload.room_number ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, room_number: event.target.value }))}
              />
            </FormField>
            <FormField id="event_at" label="Datum a Ă„Ĺ¤as">
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
                <option value="new">Nová</option>
                <option value="stored">Uskladněno</option>
                <option value="disposed">Zlikvidovat</option>
                <option value="claimed">Nárokováno</option>
                <option value="returned">Vráceno</option>
              </select>
            </FormField>
            <FormField id="tags" label="Tagy">
              <div className="k-toolbar">
                {Object.keys(lostFoundTagLabels).map((tag) => (
                  <label className="k-role-label" key={tag}>
                    <input
                      type="checkbox"
                      checked={(payload.tags ?? []).includes(tag)}
                      onChange={(event) => {
                        setPayload((prev) => {
                          const current = new Set(prev.tags ?? []);
                          if (event.target.checked) {
                            current.add(tag);
                          } else {
                            current.delete(tag);
                          }
                          return { ...prev, tags: Array.from(current) };
                        });
                      }}
                    />
                    {lostFoundTagLabel(tag)}
                  </label>
                ))}
              </div>
            </FormField>
            <FormField id="description" label="Popis poloÄąÄľky">
              <textarea
                id="description"
                className="k-textarea"
                rows={3}
                value={payload.description}
                onChange={(event) => setPayload((prev) => ({ ...prev, description: event.target.value }))}
              />
            </FormField>
            <FormField id="claimant_name" label="JmÄ‚Â©no nÄ‚Ë‡lezce/ÄąÄľadatele (volitelnÄ‚Â©)">
              <input
                id="claimant_name"
                className="k-input"
                value={payload.claimant_name ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, claimant_name: event.target.value }))}
              />
            </FormField>
            <FormField id="claimant_contact" label="Kontakt (volitelnÄ‚Â©)">
              <input
                id="claimant_contact"
                className="k-input"
                value={payload.claimant_contact ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, claimant_contact: event.target.value }))}
              />
            </FormField>
            <FormField id="handover_note" label="PÄąâ„˘edÄ‚Ë‡vacÄ‚Â­ zÄ‚Ë‡znam (volitelnÄ‚Â©)">
              <textarea
                id="handover_note"
                className="k-textarea"
                rows={2}
                value={payload.handover_note ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, handover_note: event.target.value }))}
              />
            </FormField>
            <FormField id="lost_found_photos" label="Fotodokumentace (volitelnÄ‚Â©)">
              <input
                id="lost_found_photos"
                type="file"
                className="k-input"
                multiple
                accept="image/*"
                onChange={(event) => { const files = Array.from(event.target.files ?? []); setPhotos(files.slice(0, 3)); }}
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
  const stateUI = stateViewForRoute(state, 'ZtrÄ‚Ë‡ty a nÄ‚Ë‡lezy', '/ztraty-a-nalezy');
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
      .catch(() => setError('PoloÄąÄľka nebyla nalezena.'));
  }, [id, state]);

  return (
    <main className="k-page" data-testid="lost-found-detail-page">
      {stateMarker}
      <h1>Detail poloÄąÄľky</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="404" description={error} />
      ) : item ? (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/ztraty-a-nalezy">
              ZpĂ„â€şt na seznam
            </Link>
            <Link className="k-button" to={`/ztraty-a-nalezy/${item.id}/edit`}>
              Upravit
            </Link>
            <button
              className="k-button secondary"
              type="button"
              onClick={() => void fetchJson(`/api/v1/lost-found/${item.id}`, { method: 'DELETE' })
                .then(() => window.location.assign('/admin/ztraty-a-nalezy'))
                .catch(() => setError('Smazání položky selhalo.'))}
            >
              Smazat
            </button>
          </div>
          <DataTable
            headers={['PoloÄąÄľka', 'Hodnota']}
            rows={[
              ['Typ', lostFoundTypeLabel(item.item_type)],
              ['Kategorie', item.category],
              ['MÄ‚Â­sto', item.location],
              ['Pokoj', item.room_number ?? '-'],
              ['Datum a Ă„Ĺ¤as', new Date(item.event_at).toLocaleString('cs-CZ')],
              ['Stav', lostFoundStatusLabel(item.status)],
              ['Popis', item.description],
              ['Tagy', (item.tags ?? []).map((tag) => lostFoundTagLabel(tag)).join(', ') || '-'],
              ['JmÄ‚Â©no ÄąÄľadatele', item.claimant_name ?? '-'],
              ['Kontakt', item.claimant_contact ?? '-'],
              ['PÄąâ„˘edÄ‚Ë‡vacÄ‚Â­ zÄ‚Ë‡znam', item.handover_note ?? '-'],
            ]}
          />
          {photos.length > 0 ? (
            <div className="k-grid cards-3">
              {photos.map((photo) => (
                <img
                  key={photo.id}
                  src={`/api/v1/lost-found/${item.id}/photos/${photo.id}/thumb`}
                  alt={`Fotografie poloÄąÄľky ${photo.id}`}
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
  const stateUI = stateViewForRoute(state, 'ZÄ‚Ë‡vady', '/zavady');
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
      .catch(() => setError('NepodaÄąâ„˘ilo se naĂ„Ĺ¤Ä‚Â­st seznam zÄ‚Ë‡vad.'));
  }, [locationFilter, priorityFilter, state, statusFilter]);

  return (
    <main className="k-page" data-testid="issues-list-page">
      {stateMarker}
      <h1>ZÄ‚Ë‡vady</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? (
        <StateView title="PrÄ‚Ë‡zdnÄ‚Ëť stav" description="ZatÄ‚Â­m nejsou evidovanÄ‚Â© ÄąÄľÄ‚Ë‡dnÄ‚Â© zÄ‚Ë‡vady." stateKey="empty" action={<Link className="k-button" to="/zavady/nova">NahlÄ‚Ë‡sit zÄ‚Ë‡vadu</Link>} />
      ) : (
        <>
          <div className="k-toolbar">
            <select className="k-select" aria-label="Filtr priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as 'all' | IssuePriority)}>
              <option value="all">VÄąË‡echny priority</option><option value="low">NÄ‚Â­zkÄ‚Ë‡</option><option value="medium">StÄąâ„˘ednÄ‚Â­</option><option value="high">VysokÄ‚Ë‡</option><option value="critical">KritickÄ‚Ë‡</option>
            </select>
            <select className="k-select" aria-label="Filtr stavu" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | IssueStatus)}>
              <option value="all">VÄąË‡echny stavy</option><option value="new">NovÄ‚Ë‡</option><option value="in_progress">V Äąâ„˘eÄąË‡enÄ‚Â­</option><option value="resolved">OdstranÄ›no</option><option value="closed">UzavÄąâ„˘ena</option>
            </select>
            <input className="k-input" aria-label="Filtr lokace" placeholder="Lokalita" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} />
            <Link className="k-button" to="/zavady/nova">NovÄ‚Ë‡ zÄ‚Ë‡vada</Link>
          </div>
          <DataTable headers={['NÄ‚Ë‡zev', 'Lokace', 'Pokoj', 'Priorita', 'Stav', 'PÄąâ„˘iÄąâ„˘azeno', 'Akce']} rows={items.map((item) => [
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
  const stateUI = stateViewForRoute(state, 'ZÄ‚Ë‡vady', '/zavady');
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
    })).catch(() => setError('ZÄ‚Ë‡vadu se nepodaÄąâ„˘ilo naĂ„Ĺ¤Ä‚Â­st.'));
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
    } catch { setError('ZÄ‚Ë‡vadu se nepodaÄąâ„˘ilo uloÄąÄľit.'); }
  };

  return <main className="k-page" data-testid={mode === 'create' ? 'issues-create-page' : 'issues-edit-page'}>{stateMarker}<h1>{mode === 'create' ? 'NovÄ‚Ë‡ zÄ‚Ë‡vada' : 'Upravit zÄ‚Ë‡vadu'}</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">ZpĂ„â€şt na seznam</Link><button className="k-button" type="button" onClick={() => void save()}>UloÄąÄľit</button></div><div className="k-form-grid">
<FormField id="issue_title" label="NÄ‚Ë‡zev"><input id="issue_title" className="k-input" value={payload.title} onChange={(e) => setPayload((prev) => ({ ...prev, title: e.target.value }))} /></FormField>
<FormField id="issue_location" label="Lokalita"><input id="issue_location" className="k-input" value={payload.location} onChange={(e) => setPayload((prev) => ({ ...prev, location: e.target.value }))} /></FormField>
<FormField id="issue_room_number" label="Pokoj (volitelnÄ‚Â©)"><input id="issue_room_number" className="k-input" value={payload.room_number ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, room_number: e.target.value }))} /></FormField>
<FormField id="issue_priority" label="Priorita"><select id="issue_priority" className="k-select" value={payload.priority} onChange={(e) => setPayload((prev) => ({ ...prev, priority: e.target.value as IssuePriority }))}><option value="low">NÄ‚Â­zkÄ‚Ë‡</option><option value="medium">StÄąâ„˘ednÄ‚Â­</option><option value="high">VysokÄ‚Ë‡</option><option value="critical">KritickÄ‚Ë‡</option></select></FormField>
<FormField id="issue_status" label="Stav"><select id="issue_status" className="k-select" value={payload.status} onChange={(e) => setPayload((prev) => ({ ...prev, status: e.target.value as IssueStatus }))}><option value="new">NovÄ‚Ë‡</option><option value="in_progress">V Äąâ„˘eÄąË‡enÄ‚Â­</option><option value="resolved">VyÄąâ„˘eÄąË‡ena</option><option value="closed">UzavÄąâ„˘ena</option></select></FormField>
<FormField id="issue_assignee" label="PÄąâ„˘iÄąâ„˘azeno (volitelnÄ‚Â©)"><input id="issue_assignee" className="k-input" value={payload.assignee ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, assignee: e.target.value }))} /></FormField>
<FormField id="issue_description" label="Popis"><textarea id="issue_description" className="k-textarea" rows={3} value={payload.description ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} /></FormField>
<FormField id="issue_photos" label="Fotodokumentace (volitelnÄ‚Â©)"><input id="issue_photos" type="file" className="k-input" multiple accept="image/*" onChange={(e) => { const files = Array.from(e.target.files ?? []); setPhotos(files.slice(0, 3)); }} /></FormField>
</div></div>}</main>;
}

function IssuesDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'ZÄ‚Ë‡vady', '/zavady');
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
      .catch(() => setError('ZÄ‚Ë‡vada nebyla nalezena.'));
  }, [id, state]);

  const timeline = item ? [
    { label: 'VytvoÄąâ„˘eno', value: formatDateTime(item.created_at) },
    ...(item.in_progress_at ? [{ label: 'V Äąâ„˘eÄąË‡enÄ‚Â­', value: new Date(item.in_progress_at).toLocaleString('cs-CZ') }] : []),
    ...(item.resolved_at ? [{ label: 'OdstranÄ›no', value: new Date(item.resolved_at).toLocaleString('cs-CZ') }] : []),
    ...(item.closed_at ? [{ label: 'UzavÄąâ„˘eno', value: new Date(item.closed_at).toLocaleString('cs-CZ') }] : []),
  ] : [];

  return (
    <main className="k-page" data-testid="issues-detail-page">
      {stateMarker}
      <h1>Detail zÄ‚Ë‡vady</h1><StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/zavady">ZpĂ„â€şt na seznam</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">ZpĂ„â€şt na seznam</Link><Link className="k-button" to={`/zavady/${item.id}/edit`}>Upravit</Link><button className="k-button secondary" type="button" onClick={() => void fetchJson(`/api/v1/issues/${item.id}`, { method: 'DELETE' }).then(() => window.location.assign('/admin/zavady')).catch(() => setError('Smazání závady selhalo.'))}>Smazat</button></div><DataTable headers={['PoloÄąÄľka', 'Hodnota']} rows={[[ 'NÄ‚Ë‡zev', item.title],[ 'Lokace', item.location],[ 'Pokoj', item.room_number ?? '-'],[ 'Priorita', issuePriorityLabel(item.priority)],[ 'Stav', issueStatusLabel(item.status)],[ 'PÄąâ„˘iÄąâ„˘azeno', item.assignee ?? '-'],[ 'Popis', item.description ?? '-' ]]} /><h2>Timeline</h2><Timeline entries={timeline} />{photos.length > 0 ? <div className="k-grid cards-3">{photos.map((photo) => <img key={photo.id} src={`/api/v1/issues/${item.id}/photos/${photo.id}/thumb`} alt={`Fotografie zÄ‚Ë‡vady ${photo.id}`} className="k-photo-thumb" />)}</div> : null}</div> : <SkeletonPage />}
    </main>
  );
}


function InventoryList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'SkladovÄ‚Â© hospodÄ‚Ë‡Äąâ„˘stvÄ‚Â­', '/sklad');
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
      .catch(() => setError('PoloÄąÄľky skladu se nepodaÄąâ„˘ilo naĂ„Ĺ¤Ä‚Â­st.'));
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
      setSeedInfo(`DoplnĂ„â€şno ${seeded.length} vÄ‚ËťchozÄ‚Â­ch poloÄąÄľek.`);
      loadItems();
    } catch {
      setSeedInfo('DoplnĂ„â€şnÄ‚Â­ vÄ‚ËťchozÄ‚Â­ch poloÄąÄľek se nepodaÄąâ„˘ilo.');
    }
  };

  const downloadStocktakePdf = (): void => {
    window.open('/api/v1/inventory/stocktake/pdf', '_blank', 'noopener');
  };

  return (
    <main className="k-page" data-testid="inventory-list-page">
      {stateMarker}
      <h1>SkladovÄ‚Â© hospodÄ‚Ë‡Äąâ„˘stvÄ‚Â­</h1>
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
              Doplnit vÄ‚ËťchozÄ‚Â­ poloÄąÄľky
            </button>
            <button className="k-button secondary" type="button" onClick={downloadStocktakePdf}>
              InventurnÄ‚Â­ protokol (PDF)
            </button>
            <Link className="k-button" to="/sklad/nova">NovÄ‚Ë‡ poloÄąÄľka</Link>
          </div>
          {seedInfo ? <p>{seedInfo}</p> : null}
          <StateView
            title="PrÄ‚Ë‡zdnÄ‚Ëť stav"
            description="Ve skladu zatÄ‚Â­m nejsou poloÄąÄľky."
            stateKey="empty"
            action={<Link className="k-button" to="/sklad/nova">NovÄ‚Ë‡ poloÄąÄľka</Link>}
          />
        </>
      ) : (
        <>
          <div className="k-toolbar">
            <button className="k-button secondary" type="button" onClick={() => void seedDefaults()}>
              Doplnit vÄ‚ËťchozÄ‚Â­ poloÄąÄľky
            </button>
            <button className="k-button secondary" type="button" onClick={downloadStocktakePdf}>
              InventurnÄ‚Â­ protokol (PDF)
            </button>
            <Link className="k-button" to="/sklad/nova">NovÄ‚Ë‡ poloÄąÄľka</Link>
          </div>
          {seedInfo ? <p>{seedInfo}</p> : null}
          <DataTable
            headers={['Ikona', 'PoloÄąÄľka', 'Skladem', 'Minimum', 'Jednotka', 'Dodavatel', 'Status', 'Akce']}
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
  const stateUI = stateViewForRoute(state, 'SkladovÄ‚Â© hospodÄ‚Ë‡Äąâ„˘stvÄ‚Â­', '/sklad');
  const stateMarker = <StateMarker state={state} />;
  const { id } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = React.useState<InventoryItemPayload>({
    name: '',
    unit: 'ks',
    min_stock: 0,
    current_stock: 0,
    supplier: '',
    amount_per_piece_base: 1,
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
    })).catch(() => setError('PoloÄąÄľku se nepodaÄąâ„˘ilo naĂ„Ĺ¤Ä‚Â­st.'));
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
      setError('PoloÄąÄľku se nepodaÄąâ„˘ilo uloÄąÄľit.');
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'inventory-create-page' : 'inventory-edit-page'}>
      {stateMarker}
      <h1>{mode === 'create' ? 'NovÄ‚Ë‡ skladovÄ‚Ë‡ poloÄąÄľka' : 'Upravit skladovou poloÄąÄľku'}</h1>
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
            <Link className="k-nav-link" to="/sklad">ZpĂ„â€şt na seznam</Link>
            <button className="k-button" type="button" onClick={() => void save()}>UloÄąÄľit</button>
          </div>
          <div className="k-form-grid">
            <FormField id="inventory_name" label="NÄ‚Ë‡zev">
              <input
                id="inventory_name"
                className="k-input"
                value={payload.name}
                onChange={(event) => setPayload((prev) => ({ ...prev, name: event.target.value }))}
              />
            </FormField>
            <FormField id="inventory_unit" label="VeliĂ„Ĺ¤ina v 1 ks">
              <select
                id="inventory_unit"
                className="k-select"
                value={payload.unit}
                onChange={(event) => setPayload((prev) => ({ ...prev, unit: event.target.value }))}
              >
                <option value="g">g</option>
                <option value="l">l</option>
                <option value="ks">ks</option>
              </select>
            </FormField>
            <FormField id="inventory_amount_per_piece_base" label="Hodnota veliĂ„Ĺ¤iny v 1 ks">
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
            <FormField id="inventory_min_stock" label="MinimÄ‚Ë‡lnÄ‚Â­ stav">
              <input
                id="inventory_min_stock"
                type="number"
                className="k-input"
                value={payload.min_stock}
                onChange={(event) => setPayload((prev) => ({ ...prev, min_stock: Number(event.target.value) }))}
              />
            </FormField>
            <FormField id="inventory_supplier" label="Dodavatel (volitelnÄ‚Â©)">
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
  const stateUI = stateViewForRoute(state, 'SkladovÄ‚Â© hospodÄ‚Ë‡Äąâ„˘stvÄ‚Â­', '/sklad');
  const stateMarker = <StateMarker state={state} />;
  const { id } = useParams();
  const [item, setItem] = React.useState<InventoryDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [receiptQuantity, setReceiptQuantity] = React.useState<number>(0);
  const [receiptDate, setReceiptDate] = React.useState<string>(new Date().toISOString().slice(0, 10));
  const [receiptReference, setReceiptReference] = React.useState<string>('');
  const [receiptNote, setReceiptNote] = React.useState<string>('');
  const [issueType, setIssueType] = React.useState<InventoryMovementType>('out');
  const [issueQuantity, setIssueQuantity] = React.useState<number>(0);
  const [issueDate, setIssueDate] = React.useState<string>(new Date().toISOString().slice(0, 10));
  const [issueNote, setIssueNote] = React.useState<string>('');
  const [pictogram, setPictogram] = React.useState<File | null>(null);
  const [mediaInfo, setMediaInfo] = React.useState<string | null>(null);

  const loadDetail = React.useCallback(() => {
    if (!id) return;
    fetchJson<InventoryDetail>(`/api/v1/inventory/${id}`).then((response) => {
      setItem(response);
      setError(null);
    }).catch(() => setError('PoloÄąÄľka nebyla nalezena.'));
  }, [id]);

  React.useEffect(() => {
    if (state !== 'default') return;
    loadDetail();
  }, [loadDetail, state]);

  const addReceipt = async (): Promise<void> => {
    if (!id) return;
    try {
      const response = await fetchJson<InventoryDetail>(`/api/v1/inventory/${id}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movement_type: 'in',
          quantity: receiptQuantity,
          document_date: receiptDate,
          document_reference: receiptReference || null,
          note: receiptNote || null,
        }),
      });
      setItem((prev) => (prev ? { ...prev, current_stock: response.current_stock, movements: response.movements } : response));
      setReceiptQuantity(0);
      setReceiptReference('');
      setReceiptNote('');
    } catch {
      setError('PÄąâ„˘Ä‚Â­jem se nepodaÄąâ„˘ilo uloÄąÄľit.');
    }
  };

  const addIssue = async (): Promise<void> => {
    if (!id) return;
    try {
      const response = await fetchJson<InventoryDetail>(`/api/v1/inventory/${id}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movement_type: issueType,
          quantity: issueQuantity,
          document_date: issueDate,
          note: issueNote || null,
        }),
      });
      setItem((prev) => (prev ? { ...prev, current_stock: response.current_stock, movements: response.movements } : response));
      setIssueQuantity(0);
      setIssueNote('');
    } catch {
      setError('VÄ‚Ëťdej se nepodaÄąâ„˘ilo uloÄąÄľit.');
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
      setMediaInfo('Piktogram uloÄąÄľen.');
      setPictogram(null);
      loadDetail();
    } catch {
      setMediaInfo('Piktogram se nepodaÄąâ„˘ilo uloÄąÄľit.');
    }
  };

  return (
    <main className="k-page" data-testid="inventory-detail-page">
      {stateMarker}
      <h1>Detail skladovÄ‚Â© poloÄąÄľky</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView
          title="404"
          description={error}
          stateKey="404"
          action={<Link className="k-button secondary" to="/sklad">ZpĂ„â€şt na seznam</Link>}
        />
      ) : item ? (
        <>
          <div className="k-card">
            <div className="k-toolbar">
              <Link className="k-nav-link" to="/sklad">ZpĂ„â€şt na seznam</Link>
              <Link className="k-button" to={`/sklad/${item.id}/edit`}>Upravit</Link>
            </div>
            <DataTable
              headers={['PoloÄąÄľka', 'Skladem', 'Minimum', 'VeliĂ„Ĺ¤ina v 1 ks', 'Dodavatel', 'Hodnota veliĂ„Ĺ¤iny v 1 ks']}
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
                  UloÄąÄľit piktogram
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
            <h2>PÄąâ„˘Ä‚Â­jem</h2>
            <div className="k-form-grid">
              <FormField id="receipt_quantity" label="PoĂ„Ĺ¤et kusÄąĹ»">
                <input
                  id="receipt_quantity"
                  type="number"
                  className="k-input"
                  value={receiptQuantity}
                  onChange={(event) => setReceiptQuantity(Number(event.target.value))}
                />
              </FormField>
              <FormField id="receipt_date" label="Datum pÄąâ„˘Ä‚Â­jmu">
                <input
                  id="receipt_date"
                  type="date"
                  className="k-input"
                  value={receiptDate}
                  onChange={(event) => setReceiptDate(event.target.value)}
                />
              </FormField>
              <FormField id="receipt_reference" label="Ă„ĹšÄ‚Â­slo dodacÄ‚Â­ho listu / faktury">
                <input
                  id="receipt_reference"
                  className="k-input"
                  value={receiptReference}
                  onChange={(event) => setReceiptReference(event.target.value)}
                />
              </FormField>
              <FormField id="receipt_note" label="PoznÄ‚Ë‡mka (volitelnÄ‚Â©)">
                <input
                  id="receipt_note"
                  className="k-input"
                  value={receiptNote}
                  onChange={(event) => setReceiptNote(event.target.value)}
                />
              </FormField>
            </div>
            <button className="k-button" type="button" onClick={() => void addReceipt()}>
              UloÄąÄľit pÄąâ„˘Ä‚Â­jem
            </button>
          </div>
          <div className="k-card">
            <h2>{issueType === 'adjust' ? 'Odpis' : 'VÄ‚Ëťdej'}</h2>
            <div className="k-form-grid">
              <FormField id="issue_kind" label="Druh vÄ‚Ëťdejky">
                <select
                  id="issue_kind"
                  className="k-select"
                  value={issueType}
                  onChange={(event) => setIssueType(event.target.value as InventoryMovementType)}
                >
                  <option value="out">VÄ‚Ëťdej</option>
                  <option value="adjust">Odpis</option>
                </select>
              </FormField>
              <FormField id="issue_quantity" label="PoĂ„Ĺ¤et kusÄąĹ»">
                <input
                  id="issue_quantity"
                  type="number"
                  className="k-input"
                  value={issueQuantity}
                  onChange={(event) => setIssueQuantity(Number(event.target.value))}
                />
              </FormField>
              <FormField id="issue_date" label="Datum vÄ‚Ëťdejky">
                <input
                  id="issue_date"
                  type="date"
                  className="k-input"
                  value={issueDate}
                  onChange={(event) => setIssueDate(event.target.value)}
                />
              </FormField>
              <FormField id="issue_note" label="PoznÄ‚Ë‡mka (volitelnÄ‚Â©)">
                <input
                  id="issue_note"
                  className="k-input"
                  value={issueNote}
                  onChange={(event) => setIssueNote(event.target.value)}
                />
              </FormField>
            </div>
            <button className="k-button" type="button" onClick={() => void addIssue()}>
              UloÄąÄľit vÄ‚Ëťdej
            </button>
          </div>
          <div className="k-card">
            <h2>Pohyby</h2>
            <DataTable
              headers={['Doklad', 'Datum', 'Druh', 'PoĂ„Ĺ¤et kusÄąĹ»', 'Reference', 'PoznÄ‚Ë‡mka']}
              rows={item.movements.map((movement) => [
                movement.document_number ?? '-',
                formatDateTime(movement.document_date ?? movement.created_at),
                inventoryMovementLabel(movement.movement_type),
                movement.quantity,
                movement.document_reference ?? '-',
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
      {stateUI ?? <StateView title={`${title} pÄąâ„˘ipraveno`} description="Modul je pÄąâ„˘ipraven na workflow." />}
    </main>
  );
}


function ReportsList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'HlÄ‚Ë‡ÄąË‡enÄ‚Â­', '/hlaseni');
  const stateMarker = <StateMarker state={state} />;
  const [items, setItems] = React.useState<Report[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default') {
      return;
    }
    fetchJson<Report[]>('/api/v1/reports')
      .then(setItems)
      .catch(() => setError('HlÄ‚Ë‡ÄąË‡enÄ‚Â­ se nepodaÄąâ„˘ilo naĂ„Ĺ¤Ä‚Â­st.'));
  }, [state]);

  return <main className="k-page" data-testid="reports-list-page">{stateMarker}<h1>HlÄ‚Ë‡ÄąË‡enÄ‚Â­</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? <StateView title="PrÄ‚Ë‡zdnÄ‚Ëť stav" description="ZatÄ‚Â­m nenÄ‚Â­ evidovÄ‚Ë‡no ÄąÄľÄ‚Ë‡dnÄ‚Â© hlÄ‚Ë‡ÄąË‡enÄ‚Â­." stateKey="empty" action={<Link className="k-button" to="/hlaseni/nove">NovÄ‚Â© hlÄ‚Ë‡ÄąË‡enÄ‚Â­</Link>} /> : <><div className="k-toolbar"><Link className="k-button" to="/hlaseni/nove">NovÄ‚Â© hlÄ‚Ë‡ÄąË‡enÄ‚Â­</Link></div><DataTable headers={['NÄ‚Ë‡zev', 'Stav', 'VytvoÄąâ„˘eno', 'Akce']} rows={items.map((item) => [item.title, <Badge key={`status-${item.id}`} tone={item.status === 'closed' ? 'success' : item.status === 'in_progress' ? 'warning' : 'neutral'}>{reportStatusLabel(item.status)}</Badge>, formatDateTime(item.created_at), <Link className="k-nav-link" key={item.id} to={`/hlaseni/${item.id}`}>Detail</Link>])} /></>}</main>;
}

function ReportsForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'HlÄ‚Ë‡ÄąË‡enÄ‚Â­', '/hlaseni');
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
      .catch(() => setError('Detail hlÄ‚Ë‡ÄąË‡enÄ‚Â­ se nepodaÄąâ„˘ilo naĂ„Ĺ¤Ä‚Â­st.'));
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
      setError('HlÄ‚Ë‡ÄąË‡enÄ‚Â­ se nepodaÄąâ„˘ilo uloÄąÄľit.');
    }
  }

  return <main className="k-page" data-testid={mode === 'create' ? 'reports-create-page' : 'reports-edit-page'}>{stateMarker}<h1>{mode === 'create' ? 'NovÄ‚Â© hlÄ‚Ë‡ÄąË‡enÄ‚Â­' : 'Upravit hlÄ‚Ë‡ÄąË‡enÄ‚Â­'}</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/hlaseni">ZpĂ„â€şt na seznam</Link><button className="k-button" type="button" onClick={() => void save()}>UloÄąÄľit</button></div><div className="k-form-grid"><FormField id="report_title" label="NÄ‚Ë‡zev"><input id="report_title" className="k-input" value={payload.title} onChange={(e) => setPayload((prev) => ({ ...prev, title: e.target.value }))} /></FormField><FormField id="report_status" label="Stav"><select id="report_status" className="k-select" value={payload.status} onChange={(e) => setPayload((prev) => ({ ...prev, status: e.target.value as ReportStatus }))}><option value="open">OtevÄąâ„˘enÄ‚Â©</option><option value="in_progress">V Äąâ„˘eÄąË‡enÄ‚Â­</option><option value="closed">UzavÄąâ„˘enÄ‚Â©</option></select></FormField><FormField id="report_description" label="Popis (volitelnÄ‚Â©)"><textarea id="report_description" className="k-input" value={payload.description ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} /></FormField></div></div>}</main>;
}

function ReportsDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'HlÄ‚Ë‡ÄąË‡enÄ‚Â­', '/hlaseni');
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
      .catch(() => setError('HlÄ‚Ë‡ÄąË‡enÄ‚Â­ nebylo nalezeno.'));
  }, [id, state]);

  return <main className="k-page" data-testid="reports-detail-page">{stateMarker}<h1>Detail hlÄ‚Ë‡ÄąË‡enÄ‚Â­</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/hlaseni">ZpĂ„â€şt na seznam</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/hlaseni">ZpĂ„â€şt na seznam</Link><Link className="k-button" to={`/hlaseni/${item.id}/edit`}>Upravit</Link></div><DataTable headers={['PoloÄąÄľka', 'Hodnota']} rows={[[ 'NÄ‚Ë‡zev', item.title],[ 'Stav', reportStatusLabel(item.status)],[ 'Popis', item.description ?? '-' ],[ 'VytvoÄąâ„˘eno', formatDateTime(item.created_at) ],[ 'AktualizovÄ‚Ë‡no', formatDateTime(item.updated_at) ]]} /></div> : <SkeletonPage />}</main>;
}

function UsersAdmin(): JSX.Element {
  const [users, setUsers] = React.useState<PortalUser[] | null>(null);
  const [selected, setSelected] = React.useState<PortalUser | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const roleView = typeof window !== 'undefined'
    ? window.sessionStorage.getItem('kajovo_admin_role_view')
    : null;
  const canDelete = roleView === null || roleView === 'admin';

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
      setMessage('Pokud ĂşÄŤet existuje a je dostupnĂ˝ e-mail, byl odeslĂˇn token pro reset hesla.');
    }
  }

  const roleToggle = (selectedRoles: PortalRole[], setter: (value: PortalRole[]) => void, role: PortalRole): void => {
    setter(selectedRoles.includes(role) ? selectedRoles.filter((item) => item !== role) : [...selectedRoles, role]);
  };

  const roleLabel = (role: string): string => portalRoleLabels[role as PortalRole] ?? role;

  const normalizePhoneInput = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    if (trimmed.startsWith('+')) return trimmed;
    if (trimmed.startsWith('00')) return `+${trimmed.slice(2)}`;
    if (/^\d+$/.test(trimmed)) {
      // Pokud uĹľivatel pĂ­Ĺˇe lokĂˇlnĂ­ ÄŤĂ­slo bez pĹ™edvolby, doplnĂ­me +420.
      if (trimmed.startsWith('420')) return `+${trimmed}`;
      return `+420${trimmed}`;
    }
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

  const scrollToSection = (id: string): void => {
    if (typeof document === 'undefined') return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectUser = (user: PortalUser): void => {
    setSelected(user);
    syncEdit(user);
    scrollToSection('users-detail');
  };

  return (
    <main className="k-page" data-testid="users-admin-page">
      <h1>UĹľivatelĂ©</h1>
      {error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button secondary" type="button" onClick={load}>Zkusit znovu</button>} /> : null}
      {message ? <StateView title="Info" description={message} stateKey="empty" /> : null}
      {users === null ? <SkeletonPage /> : (
        <div className="k-grid cards-2">
          <Card title="Seznam uĹľivatelĹŻ">
            <div className="k-toolbar">
              <button className="k-button" type="button" onClick={() => scrollToSection('users-create')}>NovĂ˝</button>
            </div>
            {users.length === 0 ? <StateView title="PrĂˇzdnĂ˝ stav" description="ZatĂ­m neexistujĂ­ ĹľĂˇdnĂ­ uĹľivatelĂ© portĂˇlu." stateKey="empty" /> : (
              <DataTable
                headers={['JmĂ©no', 'PĹ™Ă­jmenĂ­', 'Email', 'Role', 'PoslednĂ­ pĹ™ihlĂˇĹˇenĂ­', 'Stav', 'Akce']}
                rows={users.map((u) => [
                  <button key={u.id} className="k-nav-link" type="button" onClick={() => selectUser(u)}>{u.first_name}</button>,
                  u.last_name,
                  u.email,
                  u.roles.map(roleLabel).join(', '),
                  formatDateTime(u.last_login_at),
                  u.is_active ? 'AktivnĂ­' : 'NeaktivnĂ­',
                  <button key={`edit-${u.id}`} className="k-button secondary" type="button" onClick={() => selectUser(u)}>Upravit</button>,
                ])}
              />
            )}
          </Card>

          <div id="users-detail">
            <Card title="Detail / Ăšprava">
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
                  <small>NapĹ™. +420123456789. PĹ™i zadĂˇnĂ­ bez pĹ™edvolby doplnĂ­me +420.</small>
                  {!editPhoneValid ? <small>Telefon musĂ­ bĂ˝t ve formĂˇtu E.164.</small> : null}
                  <FormField id="edit_last_login" label="PoslednĂ­ pĹ™ihlĂˇĹˇenĂ­">
                    <input id="edit_last_login" className="k-input" value={formatDateTime(selected.last_login_at)} readOnly />
                  </FormField>
                  <FormField id="edit_note" label="PoznĂˇmka (volitelnĂ©)">
                    <textarea id="edit_note" className="k-input" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                  </FormField>
                  <fieldset className="k-card"><legend>Role</legend>
                    {portalRoleOptions.map((role) => (
                      <label key={`edit-role-${role}`} className="k-role-label">
                        <input type="checkbox" checked={editRoles.includes(role)} onChange={() => roleToggle(editRoles, setEditRoles, role)} /> {portalRoleLabels[role]}
                      </label>
                    ))}
                  </fieldset>
                  <small>Admin pĹ™Ă­stup se nastavuje mimo role portĂˇlu.</small>
                  <div className="k-toolbar">
                    <button className="k-button" type="button" onClick={() => void saveSelectedUser()} disabled={!editValid || saving}>Upravit</button>
                    <button className="k-button secondary" type="button" onClick={() => void toggleActive(selected)}>
                      {selected.is_active ? 'ZakĂˇzat' : 'Povolit'}
                    </button>
                    <button className="k-button secondary" type="button" onClick={() => void sendPasswordResetLink(selected)}>
                      Odeslat token pro reset hesla
                    </button>
                    {canDelete ? (
                      <button className="k-button secondary" type="button" onClick={() => void deleteUser(selected)}>
                        Smazat
                      </button>
                    ) : (
                      <small>SmazĂˇnĂ­ je dostupnĂ© pouze pro admina.</small>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div id="users-create">
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
                <small>NapĹ™. +420123456789. PĹ™i zadĂˇnĂ­ bez pĹ™edvolby doplnĂ­me +420.</small>
                {!createPhoneValid ? <small>Telefon musĂ­ bĂ˝t ve formĂˇtu E.164.</small> : null}
                <FormField id="create_note" label="PoznĂˇmka (volitelnĂ©)">
                  <textarea id="create_note" className="k-input" value={createNote} onChange={(e) => setCreateNote(e.target.value)} />
                </FormField>
                <fieldset className="k-card"><legend>Role</legend>
                  {portalRoleOptions.map((role) => (
                    <label key={`create-role-${role}`} className="k-role-label">
                      <input type="checkbox" checked={createRoles.includes(role)} onChange={() => roleToggle(createRoles, setCreateRoles, role)} /> {portalRoleLabels[role]}
                    </label>
                  ))}
                </fieldset>
                <small>Admin pĹ™Ă­stup se nastavuje mimo role portĂˇlu.</small>
                <button className="k-button" type="button" onClick={() => void createUser()} disabled={!createValid || saving}>VytvoĹ™it uĹľivatele</button>
              </div>
            </Card>
          </div>
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
        setError('NepodaÄąâ„˘ilo se naĂ„Ĺ¤Ä‚Â­st SMTP nastavenÄ‚Â­.');
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function save(): Promise<void> {
    if (!host.trim() || !username.trim() || !password.trim()) {
      setError('Host, uÄąÄľivatel a heslo jsou povinnÄ‚Â©.');
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
      setMessage('SMTP nastavenÄ‚Â­ bylo uloÄąÄľeno.');
      setPassword('');
    } catch {
      setError('SMTP nastavenÄ‚Â­ se nepodaÄąâ„˘ilo uloÄąÄľit.');
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail(): Promise<void> {
    const recipient = testRecipient.trim();
    if (!recipient) {
      setError('VyplÄąÂte pÄąâ„˘Ä‚Â­jemce testovacÄ‚Â­ho e-mailu.');
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
      setMessage('TestovacÄ‚Â­ e-mail byl odeslÄ‚Ë‡n.');
    } catch {
      setError('TestovacÄ‚Â­ e-mail se nepodaÄąâ„˘ilo odeslat.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="k-page" data-testid="settings-admin-page">
      <h1>NastavenÄ‚Â­ SMTP</h1>
      {error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button secondary" type="button" onClick={load}>Zkusit znovu</button>} /> : null}
      {message ? <StateView title="Info" description={message} stateKey="empty" /> : null}
      {loading ? <SkeletonPage /> : (
        <Card title="E-mailovÄ‚Ë‡ konfigurace">
          <div className="k-form-grid">
            <FormField id="smtp_host" label="SMTP host">
              <input id="smtp_host" className="k-input" value={host} onChange={(e) => setHost(e.target.value)} />
            </FormField>
            <FormField id="smtp_port" label="SMTP port">
              <input id="smtp_port" className="k-input" type="number" value={port} onChange={(e) => setPort(Number(e.target.value) || 0)} />
            </FormField>
            <FormField id="smtp_username" label="SMTP uÄąÄľivatel">
              <input id="smtp_username" className="k-input" value={username} onChange={(e) => setUsername(e.target.value)} />
            </FormField>
            <FormField id="smtp_password" label="SMTP heslo">
              <input id="smtp_password" className="k-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
            <label className="k-role-label">
              <input type="checkbox" checked={useTls} onChange={(e) => setUseTls(e.target.checked)} /> PouÄąÄľÄ‚Â­t TLS
            </label>
            <label className="k-role-label">
              <input type="checkbox" checked={useSsl} onChange={(e) => setUseSsl(e.target.checked)} /> PouÄąÄľÄ‚Â­t SSL
            </label>
            <FormField id="smtp_test_recipient" label="TestovacÄ‚Â­ pÄąâ„˘Ä‚Â­jemce">
              <input id="smtp_test_recipient" className="k-input" type="email" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} />
            </FormField>
            <div className="k-toolbar">
              <button className="k-button" type="button" onClick={() => void save()} disabled={saving}>UloÄąÄľit SMTP</button>
              <button className="k-button secondary" type="button" onClick={() => void sendTestEmail()} disabled={saving}>Odeslat testovacÄ‚Â­ e-mail</button>
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
      setError('VyplÄąÂte email i heslo.');
      return;
    }
    try {
      await apiClient.adminLoginApiAuthAdminLoginPost({ email: principal, password });
      window.location.assign('/admin/');
    } catch {
      setError('NeplatnÄ‚Â© pÄąâ„˘ihlaÄąË‡ovacÄ‚Â­ Ä‚Ĺźdaje.');
    }
  }

  async function sendPasswordHint(): Promise<void> {
    setHintStatus(null);
    await fetchJson('/api/auth/admin/hint', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    setHintStatus('Pokud Ä‚ĹźĂ„Ĺ¤et existuje, byl odeslÄ‚Ë‡n odkaz pro odblokovÄ‚Ë‡nÄ‚Â­.');
  }

  return (
    <main className="k-page k-admin-login-page" data-testid="admin-login-page">
      <section className="k-admin-login-layout">
        <Card title="KÄ‚Ë‡jovoHotel Admin login">
          <img className="k-admin-login-logo" src={brandWordmark} alt="KÄ‚Ë‡jovoHotel" />
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
              <button className="k-button" type="submit">PÄąâ„˘ihlÄ‚Ë‡sit</button>
              <button
                className="k-button secondary"
                type="button"
                onClick={() => void sendPasswordHint()}
                disabled={!email.trim()}
              >
                ZapomenutÄ‚Â© heslo
              </button>
            </div>
          </form>
        </Card>
        <aside className="k-admin-login-figure" aria-label="KÄ‚Ë‡ja pro admin login" data-brand-element="true">
          <img src={adminLoginFigure} alt="KÄ‚Ë‡ja pro administraci" loading="lazy" />
        </aside>
      </section>
      <KajovoSign />
    </main>
  );
}

const ADMIN_ROLE_VIEW_LABELS: Record<string, string> = {
  admin: 'AdministrĂˇtor',
  recepce: 'Recepce',
  pokojskĂˇ: 'PokojskĂˇ',
  ĂşdrĹľba: 'ĂšdrĹľba',
  snĂ­danÄ›: 'SnĂ­danÄ›',
  sklad: 'Sklad',
};

const ADMIN_ROLE_VIEW_MODULES: Record<string, string[]> = {
  recepce: ['lost_found', 'breakfast'],
  pokojskĂˇ: ['housekeeping', 'lost_found', 'issues', 'breakfast', 'inventory'],
  ĂşdrĹľba: ['issues'],
  snĂ­danÄ›: ['breakfast', 'issues', 'inventory'],
  sklad: ['breakfast', 'issues', 'inventory'],
};

const ADMIN_ROLE_VIEW_OPTIONS = ['admin', 'recepce', 'pokojskĂˇ', 'ĂşdrĹľba', 'snĂ­danÄ›', 'sklad'] as const;

type AdminRoleView = typeof ADMIN_ROLE_VIEW_OPTIONS[number];

function AppRoutes(): JSX.Element {
  const location = useLocation();
  const [auth, setAuth] = React.useState<AuthProfile | null>(null);
  const [roleView, setRoleView] = React.useState<AdminRoleView>(() => {
    if (typeof window === 'undefined') {
      return 'admin';
    }
    const stored = window.sessionStorage.getItem('kajovo_admin_role_view') as AdminRoleView | null;
    return stored ?? 'admin';
  });

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

  React.useEffect(() => {
    if (auth?.role === 'admin' && typeof window !== 'undefined') {
      window.sessionStorage.setItem('kajovo_admin_role_view', roleView);
    }
  }, [auth?.role, roleView]);

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
      { key: 'users', label: 'UĹľivatelĂ©', route: '/uzivatele', icon: 'users', active: true, section: 'records', permissions: ['read'] },
      { key: 'settings', label: 'NastavenĂ­', route: '/nastaveni', icon: 'settings', active: true, section: 'records', permissions: ['read'] },
    ]
    : [];
  const modules = [...ia.modules, ...adminModules, ...injectedModules];

  const roleViewKeys = auth.role === 'admin' && roleView !== 'admin'
    ? (ADMIN_ROLE_VIEW_MODULES[roleView] ?? [])
    : null;
  const moduleByKey = new Map(modules.map((module) => [module.key, module]));
  const orderedRoleModules = roleViewKeys
    ? roleViewKeys.map((key) => moduleByKey.get(key)).filter((module): module is typeof modules[number] => Boolean(module))
    : modules;
  const allowedModules = orderedRoleModules.filter((module) => {
    // View-state odkazy jsou internĂ­ QA trasa a v produkÄŤnĂ­ navigaci nemajĂ­ bĂ˝t vidÄ›t.
    if (module.route.includes('?state=')) {
      return false;
    }
    const required =
      Array.isArray(module.permissions) && module.permissions.length > 0 ? module.permissions : null;
    if (!required) {
      // TestovacĂ­ / injektovanĂ© moduly bez explicitnĂ­ch oprĂˇvnÄ›nĂ­ ukazujeme vĹľdy.
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
        <Route path="/" element={isAllowed('dashboard') ? <Dashboard /> : <AccessDeniedPage moduleLabel="PÄąâ„˘ehled" role={auth.role} userId={auth.userId} />} />
<Route path="/pokojska" element={isAllowed('housekeeping') ? <HousekeepingAdmin /> : <AccessDeniedPage moduleLabel="Pokojská" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane" element={isAllowed('breakfast') ? <BreakfastList /> : <AccessDeniedPage moduleLabel="SnÄ‚Â­danĂ„â€ş" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/nova" element={isAllowed('breakfast') ? <BreakfastForm mode="create" /> : <AccessDeniedPage moduleLabel="SnÄ‚Â­danĂ„â€ş" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/:id" element={isAllowed('breakfast') ? <BreakfastDetail /> : <AccessDeniedPage moduleLabel="SnÄ‚Â­danĂ„â€ş" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/:id/edit" element={isAllowed('breakfast') ? <BreakfastForm mode="edit" /> : <AccessDeniedPage moduleLabel="SnÄ‚Â­danĂ„â€ş" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy" element={isAllowed('lost_found') ? <LostFoundList /> : <AccessDeniedPage moduleLabel="ZtrÄ‚Ë‡ty a nÄ‚Ë‡lezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/novy" element={isAllowed('lost_found') ? <LostFoundForm mode="create" /> : <AccessDeniedPage moduleLabel="ZtrÄ‚Ë‡ty a nÄ‚Ë‡lezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id" element={isAllowed('lost_found') ? <LostFoundDetail /> : <AccessDeniedPage moduleLabel="ZtrÄ‚Ë‡ty a nÄ‚Ë‡lezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id/edit" element={isAllowed('lost_found') ? <LostFoundForm mode="edit" /> : <AccessDeniedPage moduleLabel="ZtrÄ‚Ë‡ty a nÄ‚Ë‡lezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady" element={isAllowed('issues') ? <IssuesList /> : <AccessDeniedPage moduleLabel="ZÄ‚Ë‡vady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/nova" element={isAllowed('issues') ? <IssuesForm mode="create" /> : <AccessDeniedPage moduleLabel="ZÄ‚Ë‡vady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/:id" element={isAllowed('issues') ? <IssuesDetail /> : <AccessDeniedPage moduleLabel="ZÄ‚Ë‡vady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/:id/edit" element={isAllowed('issues') ? <IssuesForm mode="edit" /> : <AccessDeniedPage moduleLabel="ZÄ‚Ë‡vady" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad" element={isAllowed('inventory') ? <InventoryList /> : <AccessDeniedPage moduleLabel="SkladovÄ‚Â© hospodÄ‚Ë‡Äąâ„˘stvÄ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/nova" element={isAllowed('inventory') ? <InventoryForm mode="create" /> : <AccessDeniedPage moduleLabel="SkladovÄ‚Â© hospodÄ‚Ë‡Äąâ„˘stvÄ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/:id" element={isAllowed('inventory') ? <InventoryDetail /> : <AccessDeniedPage moduleLabel="SkladovÄ‚Â© hospodÄ‚Ë‡Äąâ„˘stvÄ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/:id/edit" element={isAllowed('inventory') ? <InventoryForm mode="edit" /> : <AccessDeniedPage moduleLabel="SkladovÄ‚Â© hospodÄ‚Ë‡Äąâ„˘stvÄ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni" element={isAllowed('reports') ? <ReportsList /> : <AccessDeniedPage moduleLabel="HlÄ‚Ë‡ÄąË‡enÄ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/nove" element={isAllowed('reports') ? <ReportsForm mode="create" /> : <AccessDeniedPage moduleLabel="HlÄ‚Ë‡ÄąË‡enÄ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/:id" element={isAllowed('reports') ? <ReportsDetail /> : <AccessDeniedPage moduleLabel="HlÄ‚Ë‡ÄąË‡enÄ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/:id/edit" element={isAllowed('reports') ? <ReportsForm mode="edit" /> : <AccessDeniedPage moduleLabel="HlÄ‚Ë‡ÄąË‡enÄ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/uzivatele" element={isAllowed('users') ? <UsersAdmin /> : <AccessDeniedPage moduleLabel="UÄąÄľivatelÄ‚Â©" role={auth.role} userId={auth.userId} />} />
        <Route path="/nastaveni" element={isAllowed('settings') ? <SettingsAdmin /> : <AccessDeniedPage moduleLabel="NastavenÄ‚Â­" role={auth.role} userId={auth.userId} />} />
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













