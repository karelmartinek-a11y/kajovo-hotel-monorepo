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

type PortalRole = 'pokojská' | 'údržba' | 'recepce' | 'snídaně' | 'sklad';

const portalRoleOptions: PortalRole[] = ['pokojská', 'údržba', 'recepce', 'snídaně', 'sklad'];
const portalRoleLabels: Record<PortalRole, string> = {
  pokojská: 'Pokojská',
  údržba: 'Údržba',
  recepce: 'Recepce',
  snídaně: 'Snídaně',
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
            description={this.state.message ?? 'Aplikace narazila na neoÄ‚â€žÄąÂ¤ekĂ„â€šĂ‹â€ˇvanou chybu.'}
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
  pending: 'Ä‚â€žÄąĹˇekĂ„â€šĂ‹â€ˇ',
  preparing: 'PĂ„Ä…Ă˘â€žËipravuje se',
  served: 'VydĂ„â€šĂ‹â€ˇno',
  cancelled: 'ZruĂ„Ä…Ă‹â€ˇeno',
};

const lostFoundStatusLabels: Record<LostFoundStatus, string> = {
  stored: 'UloĂ„Ä…Ă„Äľeno',
  claimed: 'NĂ„â€šĂ‹â€ˇrokovĂ„â€šĂ‹â€ˇno',
  returned: 'VrĂ„â€šĂ‹â€ˇceno',
  disposed: 'ZlikvidovĂ„â€šĂ‹â€ˇno',
};

const lostFoundTypeLabels: Record<LostFoundType, string> = {
  lost: 'Ztraceno',
  found: 'Nalezeno',
};

const issuePriorityLabels: Record<IssuePriority, string> = {
  low: 'NĂ„â€šĂ‚Â­zkĂ„â€šĂ‹â€ˇ',
  medium: 'StĂ„Ä…Ă˘â€žËednĂ„â€šĂ‚Â­',
  high: 'VysokĂ„â€šĂ‹â€ˇ',
  critical: 'KritickĂ„â€šĂ‹â€ˇ',
};

const issueStatusLabels: Record<IssueStatus, string> = {
  new: 'NovĂ„â€šĂ‹â€ˇ',
  in_progress: 'V Ă„Ä…Ă˘â€žËeĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­',
  resolved: 'VyĂ„Ä…Ă˘â€žËeĂ„Ä…Ă‹â€ˇena',
  closed: 'UzavĂ„Ä…Ă˘â€žËena',
};

const reportStatusLabels: Record<ReportStatus, string> = {
  open: 'OtevĂ„Ä…Ă˘â€žËenĂ„â€šĂ‚Â©',
  in_progress: 'V Ă„Ä…Ă˘â€žËeĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­',
  closed: 'UzavĂ„Ä…Ă˘â€žËenĂ„â€šĂ‚Â©',
};


const inventoryMovementLabels: Record<InventoryMovementType, string> = {
  in: 'NaskladnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‚Â­',
  out: 'VĂ„â€šĂ‹ĹĄdej',
  adjust: 'Ă„â€šÄąË‡prava',
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
  default: 'VĂ„â€šĂ‹ĹĄchozĂ„â€šĂ‚Â­',
  loading: 'NaÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­tĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­',
  empty: 'PrĂ„â€šĂ‹â€ˇzdno',
  error: 'Chyba',
  offline: 'Offline',
  maintenance: 'Ă„â€šÄąË‡drĂ„Ä…Ă„Äľba',
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
          title="PrĂ„â€šĂ‹â€ˇzdnĂ„â€šĂ‹ĹĄ stav"
          description={`Pro modul ${title} zatĂ„â€šĂ‚Â­m nejsou dostupnĂ„â€šĂ‹â€ˇ data.`}
          stateKey="empty"
          action={<Link className="k-button secondary" to={fallbackRoute}>Obnovit data</Link>}
        />
      );
    case 'error':
      return (
        <StateView
          title="Chyba"
          description="NepodaĂ„Ä…Ă˘â€žËilo se naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st data. Zkuste strĂ„â€šĂ‹â€ˇnku obnovit."
          stateKey="error"
          action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>}
        />
      );
    case 'offline':
      return (
        <StateView
          title="Offline"
          description="Aplikace je doÄ‚â€žÄąÂ¤asnÄ‚â€žĂ˘â‚¬Ĺź bez pĂ„Ä…Ă˘â€žËipojenĂ„â€šĂ‚Â­."
          stateKey="offline"
          action={<Link className="k-button secondary" to="/offline">Diagnostika pĂ„Ä…Ă˘â€žËipojenĂ„â€šĂ‚Â­</Link>}
        />
      );
    case 'maintenance':
      return (
        <StateView
          title="Ă„â€šÄąË‡drĂ„Ä…Ă„Äľba"
          description="Modul je doÄ‚â€žÄąÂ¤asnÄ‚â€žĂ˘â‚¬Ĺź v reĂ„Ä…Ă„Äľimu Ă„â€šÄąĹşdrĂ„Ä…Ă„Äľby."
          stateKey="maintenance"
          action={<Link className="k-button secondary" to="/maintenance">Zobrazit status</Link>}
        />
      );
    case '404':
      return (
        <StateView
          title="404"
          description="PoĂ„Ä…Ă„ÄľadovanĂ„â€šĂ‹ĹĄ obsah nebyl nalezen."
          stateKey="404"
          action={
            <Link className="k-nav-link" to={fallbackRoute}>
              ZpÄ‚â€žĂ˘â‚¬Ĺźt
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
    if (!response.ok) throw new Error('NepodaĂ„Ä…Ă˘â€žËilo se naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st uĂ„Ä…Ă„Äľivatele.');
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
  const stateUI = stateViewForRoute(state, 'PĂ„Ä…Ă˘â€žËehled', '/');
  const stateMarker = <StateMarker state={state} />;

  return (
    <main className="k-page" data-testid="dashboard-page">
      {stateMarker}
      <h1>PĂ„Ä…Ă˘â€žËehled</h1>
      <StateSwitcher />
      {stateUI ?? (
        <div className="k-grid cards-3">
          <Card title="SnĂ„â€šĂ‚Â­danÄ‚â€žĂ˘â‚¬Ĺź dnes">
            <strong>18</strong>
            <p>3 Ä‚â€žÄąÂ¤ekajĂ„â€šĂ‚Â­cĂ„â€šĂ‚Â­ objednĂ„â€šĂ‹â€ˇvky</p>
          </Card>
          <Card title="ZĂ„â€šĂ‹â€ˇvady">
            <strong>4</strong>
            <p>1 kritickĂ„â€šĂ‹â€ˇ zĂ„â€šĂ‹â€ˇvada</p>
          </Card>
          <Card title="Sklad">
            <strong>12</strong>
            <p>2 poloĂ„Ä…Ă„Äľky pod minimem</p>
          </Card>
        </div>
      )}
    </main>
  );
}

function BreakfastList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'SnĂ„â€šĂ‚Â­danÄ‚â€žĂ˘â‚¬Ĺź', '/snidane');
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
        setError('NepodaĂ„Ä…Ă˘â€žËilo se naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st seznam snĂ„â€šĂ‚Â­danĂ„â€šĂ‚Â­.');
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
      setImportInfo(`Import OK: ${result.items.length} pokojĂ„Ä…ÄąÂ» (${result.date}).`);
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
        NovĂ„â€šĂ‹â€ˇ objednĂ„â€šĂ‹â€ˇvka
      </Link>
    </div>
  );

  return (
    <main className="k-page" data-testid="breakfast-list-page">
      {stateMarker}
      <h1>SnĂ„â€šĂ‚Â­danÄ‚â€žĂ˘â‚¬Ĺź</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : filteredItems.length === 0 ? (
        <>
          {breakfastToolbar}
          {importInfo ? <p>{importInfo}</p> : null}
          <StateView title="PrĂ„â€šĂ‹â€ˇzdnĂ„â€šĂ‹ĹĄ stav" description="Nebyly nalezeny Ă„Ä…Ă„ÄľĂ„â€šĂ‹â€ˇdnĂ„â€šĂ‚Â© objednĂ„â€šĂ‹â€ˇvky." stateKey="empty" action={<Link className="k-button" to="/snidane/nova">NovĂ„â€šĂ‹â€ˇ objednĂ„â€šĂ‹â€ˇvka</Link>} />
        </>
      ) : (
        <>
          <div className="k-grid cards-3">
            <Card title="ObjednĂ„â€šĂ‹â€ˇvky dne">
              <strong>{summary?.total_orders ?? 0}</strong>
            </Card>
            <Card title="HostĂ„â€šĂ‚Â© dne">
              <strong>{summary?.total_guests ?? 0}</strong>
            </Card>
            <Card title="Ä‚â€žÄąĹˇekajĂ„â€šĂ‚Â­cĂ„â€šĂ‚Â­">
              <strong>{getSummaryCount(summary, 'pending')}</strong>
            </Card>
          </div>
          {breakfastToolbar}
          {importInfo ? <p>{importInfo}</p> : null}
          <DataTable
            headers={['Datum', 'Pokoj', 'Host', 'PoÄ‚â€žÄąÂ¤et', 'Stav', 'PoznĂ„â€šĂ‹â€ˇmka', 'Akce']}
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
  const stateUI = stateViewForRoute(state, 'SnĂ„â€šĂ‚Â­danÄ‚â€žĂ˘â‚¬Ĺź', '/snidane');
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
        setError('ObjednĂ„â€šĂ‹â€ˇvku se nepodaĂ„Ä…Ă˘â€žËilo naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st.');
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
      setError('ObjednĂ„â€šĂ‹â€ˇvku se nepodaĂ„Ä…Ă˘â€žËilo uloĂ„Ä…Ă„Äľit.');
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'breakfast-create-page' : 'breakfast-edit-page'}>
      {stateMarker}
      <h1>{mode === 'create' ? 'NovĂ„â€šĂ‹â€ˇ snĂ„â€šĂ‚Â­danÄ‚â€žĂ˘â‚¬Ĺź' : 'Upravit snĂ„â€šĂ‚Â­dani'}</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/snidane">
              ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam
            </Link>
            <button className="k-button" type="button" onClick={() => void save()}>
              UloĂ„Ä…Ă„Äľit
            </button>
          </div>
          <div className="k-form-grid">
            <FormField id="service_date" label="Datum sluĂ„Ä…Ă„Äľby">
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
            <FormField id="guest_count" label="PoÄ‚â€žÄąÂ¤et hostĂ„Ä…ÄąÂ»">
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
                <option value="pending">Ä‚â€žÄąĹˇekĂ„â€šĂ‹â€ˇ</option>
                <option value="preparing">PĂ„Ä…Ă˘â€žËipravuje se</option>
                <option value="served">VydĂ„â€šĂ‹â€ˇno</option>
                <option value="cancelled">ZruĂ„Ä…Ă‹â€ˇeno</option>
              </select>
            </FormField>
            <FormField id="note" label="PoznĂ„â€šĂ‹â€ˇmka">
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
  const stateUI = stateViewForRoute(state, 'SnĂ„â€šĂ‚Â­danÄ‚â€žĂ˘â‚¬Ĺź', '/snidane');
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
        setError('ObjednĂ„â€šĂ‹â€ˇvka nebyla nalezena.');
      });
  }, [id, state]);

  return (
    <main className="k-page" data-testid="breakfast-detail-page">
      {stateMarker}
      <h1>Detail snĂ„â€šĂ‚Â­danÄ‚â€žĂ˘â‚¬Ĺź</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : notFound ? (
        <StateView title="404" description={error ?? 'ObjednĂ„â€šĂ‹â€ˇvka neexistuje.'} stateKey="404" action={<Link className="k-button secondary" to="/snidane">ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam</Link>} />
      ) : item ? (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/snidane">
              ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam
            </Link>
            <Link className="k-button" to={`/snidane/${item.id}/edit`}>
              Upravit
            </Link>
          </div>
          <DataTable
            headers={['PoloĂ„Ä…Ă„Äľka', 'Hodnota']}
            rows={[
              ['Datum sluĂ„Ä…Ă„Äľby', item.service_date],
              ['Pokoj', item.room_number],
              ['Host', item.guest_name],
              ['PoÄ‚â€žÄąÂ¤et hostĂ„Ä…ÄąÂ»', item.guest_count],
              ['Stav', breakfastStatusLabel(item.status)],
              ['PoznĂ„â€šĂ‹â€ˇmka', item.note ?? '-'],
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
  const stateUI = stateViewForRoute(state, 'ZtrĂ„â€šĂ‹â€ˇty a nĂ„â€šĂ‹â€ˇlezy', '/ztraty-a-nalezy');
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
      .catch(() => setError('NepodaĂ„Ä…Ă˘â€žËilo se naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st poloĂ„Ä…Ă„Äľky ztrĂ„â€šĂ‹â€ˇt a nĂ„â€šĂ‹â€ˇlezĂ„Ä…ÄąÂ».'));
  }, [state, statusFilter, typeFilter]);

  return (
    <main className="k-page" data-testid="lost-found-list-page">
      {stateMarker}
      <h1>ZtrĂ„â€šĂ‹â€ˇty a nĂ„â€šĂ‹â€ˇlezy</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : items.length === 0 ? (
        <StateView title="PrĂ„â€šĂ‹â€ˇzdnĂ„â€šĂ‹ĹĄ stav" description="ZatĂ„â€šĂ‚Â­m nenĂ„â€šĂ‚Â­ evidovĂ„â€šĂ‹â€ˇna Ă„Ä…Ă„ÄľĂ„â€šĂ‹â€ˇdnĂ„â€šĂ‹â€ˇ poloĂ„Ä…Ă„Äľka." stateKey="empty" action={<Link className="k-button" to="/ztraty-a-nalezy/novy">PĂ„Ä…Ă˘â€žËidat zĂ„â€šĂ‹â€ˇznam</Link>} />
      ) : (
        <>
          <div className="k-grid cards-3">
            <Card title="Celkem poloĂ„Ä…Ă„Äľek">
              <strong>{items.length}</strong>
            </Card>
            <Card title="UloĂ„Ä…Ă„ÄľenĂ„â€šĂ‚Â©">
              <strong>{items.filter((item) => item.status === 'stored').length}</strong>
            </Card>
            <Card title="VrĂ„â€šĂ‹â€ˇcenĂ„â€šĂ‚Â©">
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
              <option value="all">VĂ„Ä…Ă‹â€ˇechny typy</option>
              <option value="lost">ZtracenĂ„â€šĂ‚Â©</option>
              <option value="found">NalezenĂ„â€šĂ‚Â©</option>
            </select>
            <select
              className="k-select"
              aria-label="Filtr stavu"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | LostFoundStatus)}
            >
              <option value="all">VĂ„Ä…Ă‹â€ˇechny stavy</option>
              <option value="stored">UloĂ„Ä…Ă„Äľeno</option>
              <option value="claimed">NĂ„â€šĂ‹â€ˇrokovĂ„â€šĂ‹â€ˇno</option>
              <option value="returned">VrĂ„â€šĂ‹â€ˇceno</option>
              <option value="disposed">ZlikvidovĂ„â€šĂ‹â€ˇno</option>
            </select>
            <Link className="k-button" to="/ztraty-a-nalezy/novy">
              NovĂ„â€šĂ‹â€ˇ poloĂ„Ä…Ă„Äľka
            </Link>
          </div>
          <DataTable
            headers={['Typ', 'Kategorie', 'MĂ„â€šĂ‚Â­sto', 'Ä‚â€žÄąĹˇas', 'Stav', 'Akce']}
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
  const stateUI = stateViewForRoute(state, 'ZtrĂ„â€šĂ‹â€ˇty a nĂ„â€šĂ‹â€ˇlezy', '/ztraty-a-nalezy');
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
      .catch(() => setError('PoloĂ„Ä…Ă„Äľku se nepodaĂ„Ä…Ă˘â€žËilo naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st.'));
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
      setError('PoloĂ„Ä…Ă„Äľku se nepodaĂ„Ä…Ă˘â€žËilo uloĂ„Ä…Ă„Äľit.');
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'lost-found-create-page' : 'lost-found-edit-page'}>
      {stateMarker}
      <h1>{mode === 'create' ? 'NovĂ„â€šĂ‹â€ˇ poloĂ„Ä…Ă„Äľka' : 'Upravit poloĂ„Ä…Ă„Äľku'}</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/ztraty-a-nalezy">
              ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam
            </Link>
            <button className="k-button" type="button" onClick={() => void save()}>
              UloĂ„Ä…Ă„Äľit
            </button>
          </div>
          <div className="k-form-grid">
            <FormField id="item_type" label="Typ zĂ„â€šĂ‹â€ˇznamu">
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
            <FormField id="location" label="MĂ„â€šĂ‚Â­sto nĂ„â€šĂ‹â€ˇlezu/ztrĂ„â€šĂ‹â€ˇty">
              <input
                id="location"
                className="k-input"
                value={payload.location}
                onChange={(event) => setPayload((prev) => ({ ...prev, location: event.target.value }))}
              />
            </FormField>
            <FormField id="event_at" label="Datum a Ä‚â€žÄąÂ¤as">
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
                <option value="stored">UloĂ„Ä…Ă„Äľeno</option>
                <option value="claimed">NĂ„â€šĂ‹â€ˇrokovĂ„â€šĂ‹â€ˇno</option>
                <option value="returned">VrĂ„â€šĂ‹â€ˇceno</option>
                <option value="disposed">ZlikvidovĂ„â€šĂ‹â€ˇno</option>
              </select>
            </FormField>
            <FormField id="description" label="Popis poloĂ„Ä…Ă„Äľky">
              <textarea
                id="description"
                className="k-textarea"
                rows={3}
                value={payload.description}
                onChange={(event) => setPayload((prev) => ({ ...prev, description: event.target.value }))}
              />
            </FormField>
            <FormField id="claimant_name" label="JmĂ„â€šĂ‚Â©no nĂ„â€šĂ‹â€ˇlezce/Ă„Ä…Ă„Äľadatele (volitelnĂ„â€šĂ‚Â©)">
              <input
                id="claimant_name"
                className="k-input"
                value={payload.claimant_name ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, claimant_name: event.target.value }))}
              />
            </FormField>
            <FormField id="claimant_contact" label="Kontakt (volitelnĂ„â€šĂ‚Â©)">
              <input
                id="claimant_contact"
                className="k-input"
                value={payload.claimant_contact ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, claimant_contact: event.target.value }))}
              />
            </FormField>
            <FormField id="handover_note" label="PĂ„Ä…Ă˘â€žËedĂ„â€šĂ‹â€ˇvacĂ„â€šĂ‚Â­ zĂ„â€šĂ‹â€ˇznam (volitelnĂ„â€šĂ‚Â©)">
              <textarea
                id="handover_note"
                className="k-textarea"
                rows={2}
                value={payload.handover_note ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, handover_note: event.target.value }))}
              />
            </FormField>
            <FormField id="lost_found_photos" label="Fotodokumentace (volitelnĂ„â€šĂ‚Â©)">
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
  const stateUI = stateViewForRoute(state, 'ZtrĂ„â€šĂ‹â€ˇty a nĂ„â€šĂ‹â€ˇlezy', '/ztraty-a-nalezy');
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
      .catch(() => setError('PoloĂ„Ä…Ă„Äľka nebyla nalezena.'));
  }, [id, state]);

  return (
    <main className="k-page" data-testid="lost-found-detail-page">
      {stateMarker}
      <h1>Detail poloĂ„Ä…Ă„Äľky</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="404" description={error} />
      ) : item ? (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/ztraty-a-nalezy">
              ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam
            </Link>
            <Link className="k-button" to={`/ztraty-a-nalezy/${item.id}/edit`}>
              Upravit
            </Link>
          </div>
          <DataTable
            headers={['PoloĂ„Ä…Ă„Äľka', 'Hodnota']}
            rows={[
              ['Typ', lostFoundTypeLabel(item.item_type)],
              ['Kategorie', item.category],
              ['MĂ„â€šĂ‚Â­sto', item.location],
              ['Datum a Ä‚â€žÄąÂ¤as', new Date(item.event_at).toLocaleString('cs-CZ')],
              ['Stav', lostFoundStatusLabel(item.status)],
              ['Popis', item.description],
              ['JmĂ„â€šĂ‚Â©no Ă„Ä…Ă„Äľadatele', item.claimant_name ?? '-'],
              ['Kontakt', item.claimant_contact ?? '-'],
              ['PĂ„Ä…Ă˘â€žËedĂ„â€šĂ‹â€ˇvacĂ„â€šĂ‚Â­ zĂ„â€šĂ‹â€ˇznam', item.handover_note ?? '-'],
            ]}
          />
          {photos.length > 0 ? (
            <div className="k-grid cards-3">
              {photos.map((photo) => (
                <img
                  key={photo.id}
                  src={`/api/v1/lost-found/${item.id}/photos/${photo.id}/thumb`}
                  alt={`Fotografie poloĂ„Ä…Ă„Äľky ${photo.id}`}
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
  const stateUI = stateViewForRoute(state, 'ZĂ„â€šĂ‹â€ˇvady', '/zavady');
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
      .catch(() => setError('NepodaĂ„Ä…Ă˘â€žËilo se naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st seznam zĂ„â€šĂ‹â€ˇvad.'));
  }, [locationFilter, priorityFilter, state, statusFilter]);

  return (
    <main className="k-page" data-testid="issues-list-page">
      {stateMarker}
      <h1>ZĂ„â€šĂ‹â€ˇvady</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? (
        <StateView title="PrĂ„â€šĂ‹â€ˇzdnĂ„â€šĂ‹ĹĄ stav" description="ZatĂ„â€šĂ‚Â­m nejsou evidovanĂ„â€šĂ‚Â© Ă„Ä…Ă„ÄľĂ„â€šĂ‹â€ˇdnĂ„â€šĂ‚Â© zĂ„â€šĂ‹â€ˇvady." stateKey="empty" action={<Link className="k-button" to="/zavady/nova">NahlĂ„â€šĂ‹â€ˇsit zĂ„â€šĂ‹â€ˇvadu</Link>} />
      ) : (
        <>
          <div className="k-toolbar">
            <select className="k-select" aria-label="Filtr priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as 'all' | IssuePriority)}>
              <option value="all">VĂ„Ä…Ă‹â€ˇechny priority</option><option value="low">NĂ„â€šĂ‚Â­zkĂ„â€šĂ‹â€ˇ</option><option value="medium">StĂ„Ä…Ă˘â€žËednĂ„â€šĂ‚Â­</option><option value="high">VysokĂ„â€šĂ‹â€ˇ</option><option value="critical">KritickĂ„â€šĂ‹â€ˇ</option>
            </select>
            <select className="k-select" aria-label="Filtr stavu" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | IssueStatus)}>
              <option value="all">VĂ„Ä…Ă‹â€ˇechny stavy</option><option value="new">NovĂ„â€šĂ‹â€ˇ</option><option value="in_progress">V Ă„Ä…Ă˘â€žËeĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­</option><option value="resolved">VyĂ„Ä…Ă˘â€žËeĂ„Ä…Ă‹â€ˇena</option><option value="closed">UzavĂ„Ä…Ă˘â€žËena</option>
            </select>
            <input className="k-input" aria-label="Filtr lokace" placeholder="Lokalita" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} />
            <Link className="k-button" to="/zavady/nova">NovĂ„â€šĂ‹â€ˇ zĂ„â€šĂ‹â€ˇvada</Link>
          </div>
          <DataTable headers={['NĂ„â€šĂ‹â€ˇzev', 'Lokace', 'Pokoj', 'Priorita', 'Stav', 'PĂ„Ä…Ă˘â€žËiĂ„Ä…Ă˘â€žËazeno', 'Akce']} rows={items.map((item) => [
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
  const stateUI = stateViewForRoute(state, 'ZĂ„â€šĂ‹â€ˇvady', '/zavady');
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
    })).catch(() => setError('ZĂ„â€šĂ‹â€ˇvadu se nepodaĂ„Ä…Ă˘â€žËilo naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st.'));
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
    } catch { setError('ZĂ„â€šĂ‹â€ˇvadu se nepodaĂ„Ä…Ă˘â€žËilo uloĂ„Ä…Ă„Äľit.'); }
  };

  return <main className="k-page" data-testid={mode === 'create' ? 'issues-create-page' : 'issues-edit-page'}>{stateMarker}<h1>{mode === 'create' ? 'NovĂ„â€šĂ‹â€ˇ zĂ„â€šĂ‹â€ˇvada' : 'Upravit zĂ„â€šĂ‹â€ˇvadu'}</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam</Link><button className="k-button" type="button" onClick={() => void save()}>UloĂ„Ä…Ă„Äľit</button></div><div className="k-form-grid">
<FormField id="issue_title" label="NĂ„â€šĂ‹â€ˇzev"><input id="issue_title" className="k-input" value={payload.title} onChange={(e) => setPayload((prev) => ({ ...prev, title: e.target.value }))} /></FormField>
<FormField id="issue_location" label="Lokalita"><input id="issue_location" className="k-input" value={payload.location} onChange={(e) => setPayload((prev) => ({ ...prev, location: e.target.value }))} /></FormField>
<FormField id="issue_room_number" label="Pokoj (volitelnĂ„â€šĂ‚Â©)"><input id="issue_room_number" className="k-input" value={payload.room_number ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, room_number: e.target.value }))} /></FormField>
<FormField id="issue_priority" label="Priorita"><select id="issue_priority" className="k-select" value={payload.priority} onChange={(e) => setPayload((prev) => ({ ...prev, priority: e.target.value as IssuePriority }))}><option value="low">NĂ„â€šĂ‚Â­zkĂ„â€šĂ‹â€ˇ</option><option value="medium">StĂ„Ä…Ă˘â€žËednĂ„â€šĂ‚Â­</option><option value="high">VysokĂ„â€šĂ‹â€ˇ</option><option value="critical">KritickĂ„â€šĂ‹â€ˇ</option></select></FormField>
<FormField id="issue_status" label="Stav"><select id="issue_status" className="k-select" value={payload.status} onChange={(e) => setPayload((prev) => ({ ...prev, status: e.target.value as IssueStatus }))}><option value="new">NovĂ„â€šĂ‹â€ˇ</option><option value="in_progress">V Ă„Ä…Ă˘â€žËeĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­</option><option value="resolved">VyĂ„Ä…Ă˘â€žËeĂ„Ä…Ă‹â€ˇena</option><option value="closed">UzavĂ„Ä…Ă˘â€žËena</option></select></FormField>
<FormField id="issue_assignee" label="PĂ„Ä…Ă˘â€žËiĂ„Ä…Ă˘â€žËazeno (volitelnĂ„â€šĂ‚Â©)"><input id="issue_assignee" className="k-input" value={payload.assignee ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, assignee: e.target.value }))} /></FormField>
<FormField id="issue_description" label="Popis"><textarea id="issue_description" className="k-textarea" rows={3} value={payload.description ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} /></FormField>
<FormField id="issue_photos" label="Fotodokumentace (volitelnĂ„â€šĂ‚Â©)"><input id="issue_photos" type="file" className="k-input" multiple accept="image/*" onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} /></FormField>
</div></div>}</main>;
}

function IssuesDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'ZĂ„â€šĂ‹â€ˇvady', '/zavady');
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
      .catch(() => setError('ZĂ„â€šĂ‹â€ˇvada nebyla nalezena.'));
  }, [id, state]);

  const timeline = item ? [
    { label: 'VytvoĂ„Ä…Ă˘â€žËeno', value: formatDateTime(item.created_at) },
    ...(item.in_progress_at ? [{ label: 'V Ă„Ä…Ă˘â€žËeĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­', value: new Date(item.in_progress_at).toLocaleString('cs-CZ') }] : []),
    ...(item.resolved_at ? [{ label: 'VyĂ„Ä…Ă˘â€žËeĂ„Ä…Ă‹â€ˇeno', value: new Date(item.resolved_at).toLocaleString('cs-CZ') }] : []),
    ...(item.closed_at ? [{ label: 'UzavĂ„Ä…Ă˘â€žËeno', value: new Date(item.closed_at).toLocaleString('cs-CZ') }] : []),
  ] : [];

  return (
    <main className="k-page" data-testid="issues-detail-page">
      {stateMarker}
      <h1>Detail zĂ„â€šĂ‹â€ˇvady</h1><StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/zavady">ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam</Link><Link className="k-button" to={`/zavady/${item.id}/edit`}>Upravit</Link></div><DataTable headers={['PoloĂ„Ä…Ă„Äľka', 'Hodnota']} rows={[[ 'NĂ„â€šĂ‹â€ˇzev', item.title],[ 'Lokace', item.location],[ 'Pokoj', item.room_number ?? '-'],[ 'Priorita', issuePriorityLabel(item.priority)],[ 'Stav', issueStatusLabel(item.status)],[ 'PĂ„Ä…Ă˘â€žËiĂ„Ä…Ă˘â€žËazeno', item.assignee ?? '-'],[ 'Popis', item.description ?? '-' ]]} /><h2>Timeline</h2><Timeline entries={timeline} />{photos.length > 0 ? <div className="k-grid cards-3">{photos.map((photo) => <img key={photo.id} src={`/api/v1/issues/${item.id}/photos/${photo.id}/thumb`} alt={`Fotografie zĂ„â€šĂ‹â€ˇvady ${photo.id}`} className="k-photo-thumb" />)}</div> : null}</div> : <SkeletonPage />}
    </main>
  );
}


function InventoryList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'SkladovĂ„â€šĂ‚Â© hospodĂ„â€šĂ‹â€ˇĂ„Ä…Ă˘â€žËstvĂ„â€šĂ‚Â­', '/sklad');
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
      .catch(() => setError('PoloĂ„Ä…Ă„Äľky skladu se nepodaĂ„Ä…Ă˘â€žËilo naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st.'));
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
      setSeedInfo(`DoplnÄ‚â€žĂ˘â‚¬Ĺźno ${seeded.length} vĂ„â€šĂ‹ĹĄchozĂ„â€šĂ‚Â­ch poloĂ„Ä…Ă„Äľek.`);
      loadItems();
    } catch {
      setSeedInfo('DoplnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‚Â­ vĂ„â€šĂ‹ĹĄchozĂ„â€šĂ‚Â­ch poloĂ„Ä…Ă„Äľek se nepodaĂ„Ä…Ă˘â€žËilo.');
    }
  };

  const printInventoryList = (): void => {
    window.print();
  };

  return (
    <main className="k-page" data-testid="inventory-list-page">
      {stateMarker}
      <h1>SkladovĂ„â€šĂ‚Â© hospodĂ„â€šĂ‹â€ˇĂ„Ä…Ă˘â€žËstvĂ„â€šĂ‚Â­</h1>
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
              Doplnit vĂ„â€šĂ‹ĹĄchozĂ„â€šĂ‚Â­ poloĂ„Ä…Ă„Äľky
            </button>
            <button className="k-button secondary" type="button" onClick={printInventoryList}>
              Tisk inventurnĂ„â€šĂ‚Â­ho seznamu
            </button>
            <Link className="k-button" to="/sklad/nova">NovĂ„â€šĂ‹â€ˇ poloĂ„Ä…Ă„Äľka</Link>
          </div>
          {seedInfo ? <p>{seedInfo}</p> : null}
          <StateView
            title="PrĂ„â€šĂ‹â€ˇzdnĂ„â€šĂ‹ĹĄ stav"
            description="Ve skladu zatĂ„â€šĂ‚Â­m nejsou poloĂ„Ä…Ă„Äľky."
            stateKey="empty"
            action={<Link className="k-button" to="/sklad/nova">NovĂ„â€šĂ‹â€ˇ poloĂ„Ä…Ă„Äľka</Link>}
          />
        </>
      ) : (
        <>
          <div className="k-toolbar">
            <button className="k-button secondary" type="button" onClick={() => void seedDefaults()}>
              Doplnit vĂ„â€šĂ‹ĹĄchozĂ„â€šĂ‚Â­ poloĂ„Ä…Ă„Äľky
            </button>
            <button className="k-button secondary" type="button" onClick={printInventoryList}>
              Tisk inventurnĂ„â€šĂ‚Â­ho seznamu
            </button>
            <Link className="k-button" to="/sklad/nova">NovĂ„â€šĂ‹â€ˇ poloĂ„Ä…Ă„Äľka</Link>
          </div>
          {seedInfo ? <p>{seedInfo}</p> : null}
          <DataTable
            headers={['Ikona', 'PoloĂ„Ä…Ă„Äľka', 'Skladem', 'Minimum', 'Jednotka', 'Dodavatel', 'Status', 'Akce']}
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
  const stateUI = stateViewForRoute(state, 'SkladovĂ„â€šĂ‚Â© hospodĂ„â€šĂ‹â€ˇĂ„Ä…Ă˘â€žËstvĂ„â€šĂ‚Â­', '/sklad');
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
    })).catch(() => setError('PoloĂ„Ä…Ă„Äľku se nepodaĂ„Ä…Ă˘â€žËilo naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st.'));
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
      setError('PoloĂ„Ä…Ă„Äľku se nepodaĂ„Ä…Ă˘â€žËilo uloĂ„Ä…Ă„Äľit.');
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'inventory-create-page' : 'inventory-edit-page'}>
      {stateMarker}
      <h1>{mode === 'create' ? 'NovĂ„â€šĂ‹â€ˇ skladovĂ„â€šĂ‹â€ˇ poloĂ„Ä…Ă„Äľka' : 'Upravit skladovou poloĂ„Ä…Ă„Äľku'}</h1>
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
            <Link className="k-nav-link" to="/sklad">ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam</Link>
            <button className="k-button" type="button" onClick={() => void save()}>UloĂ„Ä…Ă„Äľit</button>
          </div>
          <div className="k-form-grid">
            <FormField id="inventory_name" label="NĂ„â€šĂ‹â€ˇzev">
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
            <FormField id="inventory_amount_per_piece_base" label="MnoĂ„Ä…Ă„ÄľstvĂ„â€šĂ‚Â­ na kus (zĂ„â€šĂ‹â€ˇkladnĂ„â€šĂ‚Â­ jednotka)">
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
            <FormField id="inventory_min_stock" label="MinimĂ„â€šĂ‹â€ˇlnĂ„â€šĂ‚Â­ stav">
              <input
                id="inventory_min_stock"
                type="number"
                className="k-input"
                value={payload.min_stock}
                onChange={(event) => setPayload((prev) => ({ ...prev, min_stock: Number(event.target.value) }))}
              />
            </FormField>
            <FormField id="inventory_current_stock" label="AktuĂ„â€šĂ‹â€ˇlnĂ„â€šĂ‚Â­ stav">
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
            <FormField id="inventory_supplier" label="Dodavatel (volitelnĂ„â€šĂ‚Â©)">
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
  const stateUI = stateViewForRoute(state, 'SkladovĂ„â€šĂ‚Â© hospodĂ„â€šĂ‹â€ˇĂ„Ä…Ă˘â€žËstvĂ„â€šĂ‚Â­', '/sklad');
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
    }).catch(() => setError('PoloĂ„Ä…Ă„Äľka nebyla nalezena.'));
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
      setError('Pohyb se nepodaĂ„Ä…Ă˘â€žËilo uloĂ„Ä…Ă„Äľit.');
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
      setMediaInfo('Piktogram uloĂ„Ä…Ă„Äľen.');
      setPictogram(null);
      loadDetail();
    } catch {
      setMediaInfo('Piktogram se nepodaĂ„Ä…Ă˘â€žËilo uloĂ„Ä…Ă„Äľit.');
    }
  };

  return (
    <main className="k-page" data-testid="inventory-detail-page">
      {stateMarker}
      <h1>Detail skladovĂ„â€šĂ‚Â© poloĂ„Ä…Ă„Äľky</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView
          title="404"
          description={error}
          stateKey="404"
          action={<Link className="k-button secondary" to="/sklad">ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam</Link>}
        />
      ) : item ? (
        <>
          <div className="k-card">
            <div className="k-toolbar">
              <Link className="k-nav-link" to="/sklad">ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam</Link>
              <Link className="k-button" to={`/sklad/${item.id}/edit`}>Upravit</Link>
            </div>
            <DataTable
              headers={['PoloĂ„Ä…Ă„Äľka', 'Skladem', 'Minimum', 'Jednotka', 'Dodavatel', 'MnoĂ„Ä…Ă„ÄľstvĂ„â€šĂ‚Â­ na kus']}
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
                  UloĂ„Ä…Ă„Äľit piktogram
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
            <h2>NovĂ„â€šĂ‹ĹĄ pohyb</h2>
            <div className="k-form-grid">
              <FormField id="movement_type" label="Typ">
                <select
                  id="movement_type"
                  className="k-select"
                  value={movementType}
                  onChange={(event) => setMovementType(event.target.value as InventoryMovementType)}
                >
                  <option value="in">NaskladnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‚Â­</option>
                  <option value="out">VĂ„â€šĂ‹ĹĄdej</option>
                  <option value="adjust">Ă„â€šÄąË‡prava</option>
                </select>
              </FormField>
              <FormField id="movement_quantity" label="MnoĂ„Ä…Ă„ÄľstvĂ„â€šĂ‚Â­">
                <input
                  id="movement_quantity"
                  type="number"
                  className="k-input"
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                />
              </FormField>
              <FormField id="movement_note" label="PoznĂ„â€šĂ‹â€ˇmka (volitelnĂ„â€šĂ‚Â©)">
                <input
                  id="movement_note"
                  className="k-input"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </FormField>
            </div>
            <button className="k-button" type="button" onClick={() => void addMovement()}>
              PĂ„Ä…Ă˘â€žËidat pohyb
            </button>
          </div>
          <div className="k-card">
            <h2>Pohyby</h2>
            <DataTable
              headers={['Datum', 'Typ', 'MnoĂ„Ä…Ă„ÄľstvĂ„â€šĂ‚Â­', 'PoznĂ„â€šĂ‹â€ˇmka']}
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
      {stateUI ?? <StateView title={`${title} pĂ„Ä…Ă˘â€žËipraveno`} description="Modul je pĂ„Ä…Ă˘â€žËipraven na workflow." />}
    </main>
  );
}


function ReportsList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'HlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­', '/hlaseni');
  const stateMarker = <StateMarker state={state} />;
  const [items, setItems] = React.useState<Report[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default') {
      return;
    }
    fetchJson<Report[]>('/api/v1/reports')
      .then(setItems)
      .catch(() => setError('HlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­ se nepodaĂ„Ä…Ă˘â€žËilo naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st.'));
  }, [state]);

  return <main className="k-page" data-testid="reports-list-page">{stateMarker}<h1>HlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? <StateView title="PrĂ„â€šĂ‹â€ˇzdnĂ„â€šĂ‹ĹĄ stav" description="ZatĂ„â€šĂ‚Â­m nenĂ„â€šĂ‚Â­ evidovĂ„â€šĂ‹â€ˇno Ă„Ä…Ă„ÄľĂ„â€šĂ‹â€ˇdnĂ„â€šĂ‚Â© hlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­." stateKey="empty" action={<Link className="k-button" to="/hlaseni/nove">NovĂ„â€šĂ‚Â© hlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­</Link>} /> : <><div className="k-toolbar"><Link className="k-button" to="/hlaseni/nove">NovĂ„â€šĂ‚Â© hlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­</Link></div><DataTable headers={['NĂ„â€šĂ‹â€ˇzev', 'Stav', 'VytvoĂ„Ä…Ă˘â€žËeno', 'Akce']} rows={items.map((item) => [item.title, <Badge key={`status-${item.id}`} tone={item.status === 'closed' ? 'success' : item.status === 'in_progress' ? 'warning' : 'neutral'}>{reportStatusLabel(item.status)}</Badge>, formatDateTime(item.created_at), <Link className="k-nav-link" key={item.id} to={`/hlaseni/${item.id}`}>Detail</Link>])} /></>}</main>;
}

function ReportsForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'HlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­', '/hlaseni');
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
      .catch(() => setError('Detail hlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­ se nepodaĂ„Ä…Ă˘â€žËilo naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st.'));
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
      setError('HlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­ se nepodaĂ„Ä…Ă˘â€žËilo uloĂ„Ä…Ă„Äľit.');
    }
  }

  return <main className="k-page" data-testid={mode === 'create' ? 'reports-create-page' : 'reports-edit-page'}>{stateMarker}<h1>{mode === 'create' ? 'NovĂ„â€šĂ‚Â© hlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­' : 'Upravit hlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­'}</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/hlaseni">ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam</Link><button className="k-button" type="button" onClick={() => void save()}>UloĂ„Ä…Ă„Äľit</button></div><div className="k-form-grid"><FormField id="report_title" label="NĂ„â€šĂ‹â€ˇzev"><input id="report_title" className="k-input" value={payload.title} onChange={(e) => setPayload((prev) => ({ ...prev, title: e.target.value }))} /></FormField><FormField id="report_status" label="Stav"><select id="report_status" className="k-select" value={payload.status} onChange={(e) => setPayload((prev) => ({ ...prev, status: e.target.value as ReportStatus }))}><option value="open">OtevĂ„Ä…Ă˘â€žËenĂ„â€šĂ‚Â©</option><option value="in_progress">V Ă„Ä…Ă˘â€žËeĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­</option><option value="closed">UzavĂ„Ä…Ă˘â€žËenĂ„â€šĂ‚Â©</option></select></FormField><FormField id="report_description" label="Popis (volitelnĂ„â€šĂ‚Â©)"><textarea id="report_description" className="k-input" value={payload.description ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} /></FormField></div></div>}</main>;
}

function ReportsDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'HlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­', '/hlaseni');
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
      .catch(() => setError('HlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­ nebylo nalezeno.'));
  }, [id, state]);

  return <main className="k-page" data-testid="reports-detail-page">{stateMarker}<h1>Detail hlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/hlaseni">ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/hlaseni">ZpÄ‚â€žĂ˘â‚¬Ĺźt na seznam</Link><Link className="k-button" to={`/hlaseni/${item.id}/edit`}>Upravit</Link></div><DataTable headers={['PoloĂ„Ä…Ă„Äľka', 'Hodnota']} rows={[[ 'NĂ„â€šĂ‹â€ˇzev', item.title],[ 'Stav', reportStatusLabel(item.status)],[ 'Popis', item.description ?? '-' ],[ 'VytvoĂ„Ä…Ă˘â€žËeno', formatDateTime(item.created_at) ],[ 'AktualizovĂ„â€šĂ‹â€ˇno', formatDateTime(item.updated_at) ]]} /></div> : <SkeletonPage />}</main>;
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
      .catch(() => setError('NepodaĂ„Ä…Ă˘â€žËilo se naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st uĂ„Ä…Ă„Äľivatele.'));
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
      setMessage('UĂ„Ä…Ă„Äľivatel byl vytvoĂ„Ä…Ă˘â€žËen.');
    } catch {
      setError('UĂ„Ä…Ă„Äľivatele se nepodaĂ„Ä…Ă˘â€žËilo vytvoĂ„Ä…Ă˘â€žËit.');
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
      setMessage('UĂ„Ä…Ă„Äľivatel byl upraven.');
    } catch {
      setError('UĂ„Ä…Ă„Äľivatele se nepodaĂ„Ä…Ă˘â€žËilo upravit.');
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
      setError('NepodaĂ„Ä…Ă˘â€žËilo se zmÄ‚â€žĂ˘â‚¬Ĺźnit stav uĂ„Ä…Ă„Äľivatele.');
    }
  }

  async function sendPasswordResetLink(user: PortalUser): Promise<void> {
    try {
      await fetchJson<{ ok: boolean }>(`/api/v1/users/${user.id}/password/reset-link`, { method: 'POST' });
    } finally {
      setMessage('Pokud Ă„â€šÄąĹşÄ‚â€žÄąÂ¤et existuje a je dostupnĂ„â€šĂ‹ĹĄ e-mail, byl odeslĂ„â€šĂ‹â€ˇn odkaz na zmÄ‚â€žĂ˘â‚¬Ĺźnu hesla.');
    }
  }

  const roleToggle = (selectedRoles: PortalRole[], setter: (value: PortalRole[]) => void, role: PortalRole): void => {
    setter(selectedRoles.includes(role) ? selectedRoles.filter((item) => item !== role) : [...selectedRoles, role]);
  };

  // Auto-prefix Czech numbers without country code to +420 (admin UX convention).
  const normalizePhoneInput = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    if (trimmed.startsWith('+')) return trimmed;
    if (/^00\d+$/.test(trimmed)) return `+${trimmed.slice(2)}`;
    if (/^420\d+$/.test(trimmed)) return `+${trimmed}`;
    if (/^\d+$/.test(trimmed)) return `+420${trimmed}`;
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
    if (!window.confirm(`Opravdu smazat uĂ„Ä…Ă„Äľivatele ${user.email}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await fetchJson<void>(`/api/v1/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': getCsrfTokenFromCookie(),
        },
      });
      setMessage('UĂ„Ä…Ă„Äľivatel byl smazĂ„â€šĂ‹â€ˇn.');
      setSelected(null);
      load();
    } catch {
      setError('SmazĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­ uĂ„Ä…Ă„Äľivatele se nepodaĂ„Ä…Ă˘â€žËilo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="k-page" data-testid="users-admin-page">
      <h1>UĂ„Ä…Ă„ÄľivatelĂ„â€šĂ‚Â©</h1>
      {error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button secondary" type="button" onClick={load}>Zkusit znovu</button>} /> : null}
      {message ? <StateView title="Info" description={message} stateKey="empty" /> : null}
      {users === null ? <SkeletonPage /> : (
        <div className="k-grid cards-2">
          <Card title="Seznam uĂ„Ä…Ă„ÄľivatelĂ„Ä…ÄąÂ»">
            {users.length === 0 ? <StateView title="PrĂ„â€šĂ‹â€ˇzdnĂ„â€šĂ‹ĹĄ stav" description="ZatĂ„â€šĂ‚Â­m neexistujĂ„â€šĂ‚Â­ Ă„Ä…Ă„ÄľĂ„â€šĂ‹â€ˇdnĂ„â€šĂ‚Â­ uĂ„Ä…Ă„ÄľivatelĂ„â€šĂ‚Â© portĂ„â€šĂ‹â€ˇlu." stateKey="empty" /> : (
              <DataTable
                headers={['JmĂ„â€šĂ‚Â©no', 'PĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­jmenĂ„â€šĂ‚Â­', 'Email', 'Role', 'PoslednĂ„â€šĂ‚Â­ pĂ„Ä…Ă˘â€žËihlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­', 'Stav']}
                rows={users.map((u) => [
                  <button key={u.id} className="k-nav-link" type="button" onClick={() => { setSelected(u); syncEdit(u); }}>{u.first_name}</button>,
                  u.last_name,
                  u.email,
                  u.roles.join(', '),
                  formatDateTime(u.last_login_at),
                  u.is_active ? 'AktivnĂ„â€šĂ‚Â­' : 'NeaktivnĂ„â€šĂ‚Â­',
                ])}
              />
            )}
          </Card>

          <Card title="Detail / Ă„â€šÄąĹşprava">
            {!selected ? <p>Vyberte uĂ„Ä…Ă„Äľivatele.</p> : (
              <div className="k-form-grid">
                <FormField id="edit_first_name" label="JmĂ„â€šĂ‚Â©no">
                  <input id="edit_first_name" className="k-input" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
                </FormField>
                <FormField id="edit_last_name" label="PĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­jmenĂ„â€šĂ‚Â­">
                  <input id="edit_last_name" className="k-input" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
                </FormField>
                <FormField id="edit_email" label="Email">
                  <input id="edit_email" className="k-input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                </FormField>
                {!editEmailValid ? <small>NeplatnĂ„â€šĂ‹ĹĄ email.</small> : null}
                <FormField id="edit_phone" label="Telefon (E.164, volitelnĂ„â€šĂ‚Â©)">
                  <input id="edit_phone" className="k-input" value={editPhone} onChange={(e) => setEditPhone(normalizePhoneInput(e.target.value))} placeholder="+420123456789" />
                </FormField>
                {!editPhoneValid ? <small>Telefon musĂ„â€šĂ‚Â­ bĂ„â€šĂ‹ĹĄt ve formĂ„â€šĂ‹â€ˇtu E.164.</small> : null}
                <FormField id="edit_note" label="PoznĂ„â€šĂ‹â€ˇmka (volitelnĂ„â€šĂ‚Â©)">
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
                  <button className="k-button" type="button" onClick={() => void saveSelectedUser()} disabled={!editValid || saving}>UloĂ„Ä…Ă„Äľit zmÄ‚â€žĂ˘â‚¬Ĺźny</button>
                  <button className="k-button secondary" type="button" onClick={() => void toggleActive(selected)}>
                    {selected.is_active ? 'ZakĂ„â€šĂ‹â€ˇzat' : 'Povolit'}
                  </button>
                  <button className="k-button secondary" type="button" onClick={() => void sendPasswordResetLink(selected)}>
                    Poslat link na zmÄ‚â€žĂ˘â‚¬Ĺźnu hesla
                  </button>
                  <button className="k-button secondary" type="button" onClick={() => void deleteUser(selected)}>
                    Smazat
                  </button>
                </div>
              </div>
            )}
          </Card>

          <Card title="VytvoĂ„Ä…Ă˘â€žËit uĂ„Ä…Ă„Äľivatele">
            <div className="k-form-grid">
              <FormField id="create_first_name" label="JmĂ„â€šĂ‚Â©no">
                <input id="create_first_name" className="k-input" value={createFirstName} onChange={(e) => setCreateFirstName(e.target.value)} />
              </FormField>
              <FormField id="create_last_name" label="PĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­jmenĂ„â€šĂ‚Â­">
                <input id="create_last_name" className="k-input" value={createLastName} onChange={(e) => setCreateLastName(e.target.value)} />
              </FormField>
              <FormField id="create_email" label="Email">
                <input id="create_email" className="k-input" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
              </FormField>
              {!createEmailValid && createEmail.trim() ? <small>NeplatnĂ„â€šĂ‹ĹĄ email.</small> : null}
              <FormField id="create_password" label="DoÄ‚â€žÄąÂ¤asnĂ„â€šĂ‚Â© heslo">
                <input id="create_password" className="k-input" type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} />
              </FormField>
              <FormField id="create_phone" label="Telefon (E.164, volitelnĂ„â€šĂ‚Â©)">
                <input id="create_phone" className="k-input" value={createPhone} onChange={(e) => setCreatePhone(normalizePhoneInput(e.target.value))} placeholder="+420123456789" />
              </FormField>
              {!createPhoneValid ? <small>Telefon musĂ„â€šĂ‚Â­ bĂ„â€šĂ‹ĹĄt ve formĂ„â€šĂ‹â€ˇtu E.164.</small> : null}
              <FormField id="create_note" label="PoznĂ„â€šĂ‹â€ˇmka (volitelnĂ„â€šĂ‚Â©)">
                <textarea id="create_note" className="k-input" value={createNote} onChange={(e) => setCreateNote(e.target.value)} />
              </FormField>
              <fieldset className="k-card"><legend>Role</legend>
                {portalRoleOptions.map((role) => (
                  <label key={`create-role-${role}`} className="k-role-label">
                    <input type="checkbox" checked={createRoles.includes(role)} onChange={() => roleToggle(createRoles, setCreateRoles, role)} /> {role}
                  </label>
                ))}
              </fieldset>
              <button className="k-button" type="button" onClick={() => void createUser()} disabled={!createValid || saving}>VytvoĂ„Ä…Ă˘â€žËit uĂ„Ä…Ă„Äľivatele</button>
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
        setError('NepodaĂ„Ä…Ă˘â€žËilo se naÄ‚â€žÄąÂ¤Ă„â€šĂ‚Â­st SMTP nastavenĂ„â€šĂ‚Â­.');
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function save(): Promise<void> {
    if (!host.trim() || !username.trim() || !password.trim()) {
      setError('Host, uĂ„Ä…Ă„Äľivatel a heslo jsou povinnĂ„â€šĂ‚Â©.');
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
      setMessage('SMTP nastavenĂ„â€šĂ‚Â­ bylo uloĂ„Ä…Ă„Äľeno.');
      setPassword('');
    } catch {
      setError('SMTP nastavenĂ„â€šĂ‚Â­ se nepodaĂ„Ä…Ă˘â€žËilo uloĂ„Ä…Ă„Äľit.');
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail(): Promise<void> {
    const recipient = testRecipient.trim();
    if (!recipient) {
      setError('VyplĂ„Ä…Ă‚Âte pĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­jemce testovacĂ„â€šĂ‚Â­ho e-mailu.');
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
      setMessage('TestovacĂ„â€šĂ‚Â­ e-mail byl odeslĂ„â€šĂ‹â€ˇn.');
    } catch {
      setError('TestovacĂ„â€šĂ‚Â­ e-mail se nepodaĂ„Ä…Ă˘â€žËilo odeslat.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="k-page" data-testid="settings-admin-page">
      <h1>NastavenĂ„â€šĂ‚Â­ SMTP</h1>
      {error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button secondary" type="button" onClick={load}>Zkusit znovu</button>} /> : null}
      {message ? <StateView title="Info" description={message} stateKey="empty" /> : null}
      {loading ? <SkeletonPage /> : (
        <Card title="E-mailovĂ„â€šĂ‹â€ˇ konfigurace">
          <div className="k-form-grid">
            <FormField id="smtp_host" label="SMTP host">
              <input id="smtp_host" className="k-input" value={host} onChange={(e) => setHost(e.target.value)} />
            </FormField>
            <FormField id="smtp_port" label="SMTP port">
              <input id="smtp_port" className="k-input" type="number" value={port} onChange={(e) => setPort(Number(e.target.value) || 0)} />
            </FormField>
            <FormField id="smtp_username" label="SMTP uĂ„Ä…Ă„Äľivatel">
              <input id="smtp_username" className="k-input" value={username} onChange={(e) => setUsername(e.target.value)} />
            </FormField>
            <FormField id="smtp_password" label="SMTP heslo">
              <input id="smtp_password" className="k-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
            <label className="k-role-label">
              <input type="checkbox" checked={useTls} onChange={(e) => setUseTls(e.target.checked)} /> PouĂ„Ä…Ă„ÄľĂ„â€šĂ‚Â­t TLS
            </label>
            <label className="k-role-label">
              <input type="checkbox" checked={useSsl} onChange={(e) => setUseSsl(e.target.checked)} /> PouĂ„Ä…Ă„ÄľĂ„â€šĂ‚Â­t SSL
            </label>
            <FormField id="smtp_test_recipient" label="TestovacĂ„â€šĂ‚Â­ pĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­jemce">
              <input id="smtp_test_recipient" className="k-input" type="email" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} />
            </FormField>
            <div className="k-toolbar">
              <button className="k-button" type="button" onClick={() => void save()} disabled={saving}>UloĂ„Ä…Ă„Äľit SMTP</button>
              <button className="k-button secondary" type="button" onClick={() => void sendTestEmail()} disabled={saving}>Odeslat testovacĂ„â€šĂ‚Â­ e-mail</button>
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
        title="PĂ„Ä…Ă˘â€žËĂ„â€šĂ‚Â­stup odepĂ„Ä…Ă˘â€žËen"
        description={`Role ${role} (uĂ„Ä…Ă„Äľivatel ${userId}) nemĂ„â€šĂ‹â€ˇ oprĂ„â€šĂ‹â€ˇvnÄ‚â€žĂ˘â‚¬ĹźnĂ„â€šĂ‚Â­ pro modul ${moduleLabel}.`}
        stateKey="error"
        action={<Link className="k-button secondary" to="/">ZpÄ‚â€žĂ˘â‚¬Ĺźt na pĂ„Ä…Ă˘â€žËehled</Link>}
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
      setError('VyplĂ„Ä…Ă‚Âte email i heslo.');
      return;
    }
    try {
      await apiClient.adminLoginApiAuthAdminLoginPost({ email: principal, password });
      window.location.assign('/admin/');
    } catch {
      setError('NeplatnĂ„â€šĂ‚Â© pĂ„Ä…Ă˘â€žËihlaĂ„Ä…Ă‹â€ˇovacĂ„â€šĂ‚Â­ Ă„â€šÄąĹşdaje.');
    }
  }

  async function sendPasswordHint(): Promise<void> {
    setHintStatus(null);
    await fetchJson('/api/auth/admin/hint', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    setHintStatus('Pokud Ă„â€šÄąĹşÄ‚â€žÄąÂ¤et existuje, byl odeslĂ„â€šĂ‹â€ˇn odkaz pro odblokovĂ„â€šĂ‹â€ˇnĂ„â€šĂ‚Â­.');
  }

  return (
    <main className="k-page k-admin-login-page" data-testid="admin-login-page">
      <section className="k-admin-login-layout">
        <Card title="KĂ„â€šĂ‹â€ˇjovoHotel Admin login">
          <img className="k-admin-login-logo" src={brandWordmark} alt="KĂ„â€šĂ‹â€ˇjovoHotel" />
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
              <button className="k-button" type="submit">PĂ„Ä…Ă˘â€žËihlĂ„â€šĂ‹â€ˇsit</button>
              <button
                className="k-button secondary"
                type="button"
                onClick={() => void sendPasswordHint()}
                disabled={!email.trim()}
              >
                ZapomenutĂ„â€šĂ‚Â© heslo
              </button>
            </div>
          </form>
        </Card>
        <aside className="k-admin-login-figure" aria-label="KĂ„â€šĂ‹â€ˇja pro admin login" data-brand-element="true">
          <img src={adminLoginFigure} alt="KĂ„â€šĂ‹â€ˇja pro administraci" loading="lazy" />
        </aside>
      </section>
      <KajovoSign />
    </main>
  );
}

const ADMIN_ROLE_VIEW_LABELS: Record<string, string> = {
  admin: 'AdministrÄ‚Ë‡tor',
  recepce: 'Recepce',
  pokojskÄ‚Ë‡: 'PokojskÄ‚Ë‡',
  Ä‚ĹźdrÄąÄľba: 'Ä‚ĹˇdrÄąÄľba',
  snÄ‚Â­danĂ„â€ş: 'SnÄ‚Â­danĂ„â€ş',
  sklad: 'Sklad',
};

const ADMIN_ROLE_VIEW_MODULES: Record<string, string[]> = {
  recepce: ['lost_found', 'breakfast'],
  pokojskÄ‚Ë‡: ['lost_found', 'issues', 'breakfast', 'inventory'],
  Ä‚ĹźdrÄąÄľba: ['issues'],
  snÄ‚Â­danĂ„â€ş: ['breakfast', 'issues', 'inventory'],
  sklad: ['breakfast', 'issues', 'inventory'],
};

const ADMIN_ROLE_VIEW_OPTIONS = ['admin', 'recepce', 'pokojskÄ‚Ë‡', 'Ä‚ĹźdrÄąÄľba', 'snÄ‚Â­danĂ„â€ş', 'sklad'] as const;

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
      { key: 'users', label: 'UÄąÄľivatelÄ‚Â©', route: '/uzivatele', icon: 'users', active: true, section: 'records', permissions: ['read'] },
      { key: 'settings', label: 'NastavenÄ‚Â­', route: '/nastaveni', icon: 'settings', active: true, section: 'records', permissions: ['read'] },
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
    // View-state odkazy jsou internÄ‚Â­ QA trasa a v produkĂ„Ĺ¤nÄ‚Â­ navigaci nemajÄ‚Â­ bÄ‚Ëťt vidĂ„â€şt.
    if (module.route.includes('?state=')) {
      return false;
    }
    const required =
      Array.isArray(module.permissions) && module.permissions.length > 0 ? module.permissions : null;
    if (!required) {
      // TestovacÄ‚Â­ / injektovanÄ‚Â© moduly bez explicitnÄ‚Â­ch oprÄ‚Ë‡vnĂ„â€şnÄ‚Â­ ukazujeme vÄąÄľdy.
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
        <Route path="/" element={isAllowed('dashboard') ? <Dashboard /> : <AccessDeniedPage moduleLabel="PĂ„Ä…Ă˘â€žËehled" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane" element={isAllowed('breakfast') ? <BreakfastList /> : <AccessDeniedPage moduleLabel="SnĂ„â€šĂ‚Â­danÄ‚â€žĂ˘â‚¬Ĺź" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/nova" element={isAllowed('breakfast') ? <BreakfastForm mode="create" /> : <AccessDeniedPage moduleLabel="SnĂ„â€šĂ‚Â­danÄ‚â€žĂ˘â‚¬Ĺź" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/:id" element={isAllowed('breakfast') ? <BreakfastDetail /> : <AccessDeniedPage moduleLabel="SnĂ„â€šĂ‚Â­danÄ‚â€žĂ˘â‚¬Ĺź" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/:id/edit" element={isAllowed('breakfast') ? <BreakfastForm mode="edit" /> : <AccessDeniedPage moduleLabel="SnĂ„â€šĂ‚Â­danÄ‚â€žĂ˘â‚¬Ĺź" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy" element={isAllowed('lost_found') ? <LostFoundList /> : <AccessDeniedPage moduleLabel="ZtrĂ„â€šĂ‹â€ˇty a nĂ„â€šĂ‹â€ˇlezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/novy" element={isAllowed('lost_found') ? <LostFoundForm mode="create" /> : <AccessDeniedPage moduleLabel="ZtrĂ„â€šĂ‹â€ˇty a nĂ„â€šĂ‹â€ˇlezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id" element={isAllowed('lost_found') ? <LostFoundDetail /> : <AccessDeniedPage moduleLabel="ZtrĂ„â€šĂ‹â€ˇty a nĂ„â€šĂ‹â€ˇlezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id/edit" element={isAllowed('lost_found') ? <LostFoundForm mode="edit" /> : <AccessDeniedPage moduleLabel="ZtrĂ„â€šĂ‹â€ˇty a nĂ„â€šĂ‹â€ˇlezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady" element={isAllowed('issues') ? <IssuesList /> : <AccessDeniedPage moduleLabel="ZĂ„â€šĂ‹â€ˇvady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/nova" element={isAllowed('issues') ? <IssuesForm mode="create" /> : <AccessDeniedPage moduleLabel="ZĂ„â€šĂ‹â€ˇvady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/:id" element={isAllowed('issues') ? <IssuesDetail /> : <AccessDeniedPage moduleLabel="ZĂ„â€šĂ‹â€ˇvady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/:id/edit" element={isAllowed('issues') ? <IssuesForm mode="edit" /> : <AccessDeniedPage moduleLabel="ZĂ„â€šĂ‹â€ˇvady" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad" element={isAllowed('inventory') ? <InventoryList /> : <AccessDeniedPage moduleLabel="SkladovĂ„â€šĂ‚Â© hospodĂ„â€šĂ‹â€ˇĂ„Ä…Ă˘â€žËstvĂ„â€šĂ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/nova" element={isAllowed('inventory') ? <InventoryForm mode="create" /> : <AccessDeniedPage moduleLabel="SkladovĂ„â€šĂ‚Â© hospodĂ„â€šĂ‹â€ˇĂ„Ä…Ă˘â€žËstvĂ„â€šĂ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/:id" element={isAllowed('inventory') ? <InventoryDetail /> : <AccessDeniedPage moduleLabel="SkladovĂ„â€šĂ‚Â© hospodĂ„â€šĂ‹â€ˇĂ„Ä…Ă˘â€žËstvĂ„â€šĂ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/:id/edit" element={isAllowed('inventory') ? <InventoryForm mode="edit" /> : <AccessDeniedPage moduleLabel="SkladovĂ„â€šĂ‚Â© hospodĂ„â€šĂ‹â€ˇĂ„Ä…Ă˘â€žËstvĂ„â€šĂ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni" element={isAllowed('reports') ? <ReportsList /> : <AccessDeniedPage moduleLabel="HlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/nove" element={isAllowed('reports') ? <ReportsForm mode="create" /> : <AccessDeniedPage moduleLabel="HlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/:id" element={isAllowed('reports') ? <ReportsDetail /> : <AccessDeniedPage moduleLabel="HlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/:id/edit" element={isAllowed('reports') ? <ReportsForm mode="edit" /> : <AccessDeniedPage moduleLabel="HlĂ„â€šĂ‹â€ˇĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â­" role={auth.role} userId={auth.userId} />} />
        <Route path="/uzivatele" element={isAllowed('users') ? <UsersAdmin /> : <AccessDeniedPage moduleLabel="UĂ„Ä…Ă„ÄľivatelĂ„â€šĂ‚Â©" role={auth.role} userId={auth.userId} />} />
        <Route path="/nastaveni" element={isAllowed('settings') ? <SettingsAdmin /> : <AccessDeniedPage moduleLabel="NastavenĂ„â€šĂ‚Â­" role={auth.role} userId={auth.userId} />} />
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








