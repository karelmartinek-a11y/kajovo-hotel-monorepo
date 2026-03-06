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
  getAuthBundle,
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
import {
  ADMIN_SWITCHABLE_ROLES,
  ROLE_MODULES,
  canReadModule,
  resolveAuthProfile,
  rolePermissions,
  type AuthProfile,
  type Role,
} from './rbac';

const brandWordmark = '/brand/apps/kajovo-hotel/logo/exports/wordmark/svg/kajovo-hotel_wordmark.svg';
const adminLoginFigure = '/brand/postavy/kaja-admin.png';

type ViewState = 'default' | 'loading' | 'empty' | 'error' | 'offline' | 'maintenance' | '404';
type LostFoundType = LostFoundItemType;

type BreakfastOrder = BreakfastOrderRead & {
  diet_no_gluten?: boolean;
  diet_no_milk?: boolean;
  diet_no_pork?: boolean;
};

type BreakfastPayload = BreakfastOrderCreate & {
  diet_no_gluten?: boolean;
  diet_no_milk?: boolean;
  diet_no_pork?: boolean;
};

type BreakfastSummary = BreakfastDailySummary;

type BreakfastImportItem = {
  room: number;
  count: number;
  guest_name?: string | null;
  diet_no_gluten?: boolean;
  diet_no_milk?: boolean;
  diet_no_pork?: boolean;
};

type BreakfastImportResponse = {
  date: string;
  status: 'FOUND' | 'MISSING';
  saved: boolean;
  items: BreakfastImportItem[];
};

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

type PortalRole = 'pokojská' | 'údržba' | 'recepce' | 'snídaně' | 'sklad';

const portalRoleOptions: PortalRole[] = ['pokojská', 'údržba', 'recepce', 'snídaně', 'sklad'];

const AuthContext = React.createContext<AuthProfile | null>(null);

function useAuth(): AuthProfile | null {
  return React.useContext(AuthContext);
}

function readCsrfToken(): string {
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith('kajovo_csrf='))
    ?.split('=')[1] ?? '';
}
const portalRoleLabels: Record<PortalRole, string> = {
  'pokojská': 'Pokojská',
  'údržba': 'Údržba',
  recepce: 'Recepce',
  'snídaně': 'Snídaně',
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
  low: 'Nízká',
  medium: 'Střední',
  high: 'Vysoká',
  critical: 'Kritická',
};

const issueStatusLabels: Record<IssueStatus, string> = {
  new: 'Nová',
  in_progress: 'V řešení',
  resolved: 'Odstraněno',
  closed: 'Uzavřena',
};

const reportStatusLabels: Record<ReportStatus, string> = {
  open: 'Otevřené',
  in_progress: 'V řešení',
  closed: 'Uzavřené',
};


const inventoryMovementLabels: Record<InventoryMovementType, string> = {
  in: 'Příjem',
  out: 'Výdej',
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

class HttpError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail: unknown = null) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function buildHttpError(response: Response): Promise<HttpError> {
  const status = response.status;
  const raw = await response.text();
  let detail: unknown = null;
  let message = raw || `HTTP ${status}`;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { detail?: unknown };
      detail = parsed;
      if (parsed && typeof parsed.detail === 'string') {
        message = parsed.detail;
      }
    } catch {
      detail = raw;
    }
  }
  return new HttpError(status, message, detail);
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    const entries: Record<string, string> = {};
    headers.forEach((value, key) => {
      entries[key] = value;
    });
    return entries;
  }
  if (Array.isArray(headers)) {
    return headers.reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }
  return { ...headers };
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
    if (!response.ok) throw await buildHttpError(response);
    return (await response.json()) as T;
  }
  if (path === '/api/v1/users' && method === 'POST') {
    const csrf = readCsrfToken();
    const headers = normalizeHeaders(init?.headers);
    headers['Content-Type'] = 'application/json';
    if (csrf) {
      headers['x-csrf-token'] = csrf;
    }
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await buildHttpError(response);
    return (await response.json()) as T;
  }
  const userId = path.match(/^\/api\/v1\/users\/(\d+)$/);
  if (userId && method === 'PATCH') {
    const csrf = readCsrfToken();
    const headers = normalizeHeaders(init?.headers);
    headers['Content-Type'] = 'application/json';
    if (csrf) {
      headers['x-csrf-token'] = csrf;
    }
    const response = await fetch(path, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await buildHttpError(response);
    return (await response.json()) as T;
  }
  if (userId && method === 'DELETE') {
    const csrf = readCsrfToken();
    const headers = normalizeHeaders(init?.headers);
    if (csrf) {
      headers['x-csrf-token'] = csrf;
    }
    const response = await fetch(path, {
      method,
      credentials: 'include',
      headers,
    });
    if (!response.ok) throw await buildHttpError(response);
    return undefined as T;
  }
  const userActiveId = path.match(/^\/api\/v1\/users\/(\d+)\/active$/);
  if (userActiveId && method === 'PATCH') {
    const csrf = readCsrfToken();
    const headers = normalizeHeaders(init?.headers);
    headers['Content-Type'] = 'application/json';
    if (csrf) {
      headers['x-csrf-token'] = csrf;
    }
    const response = await fetch(path, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await buildHttpError(response);
    return (await response.json()) as T;
  }
  const userPasswordId = path.match(/^\/api\/v1\/users\/(\d+)\/password(\/reset)?$/);
  if (userPasswordId && method === 'POST') {
    const csrf = readCsrfToken();
    const headers = normalizeHeaders(init?.headers);
    headers['Content-Type'] = 'application/json';
    if (csrf) {
      headers['x-csrf-token'] = csrf;
    }
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await buildHttpError(response);
    if (response.status === 204) {
      return undefined as T;
    }
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
    throw await buildHttpError(fallbackResponse);
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

type DietKey = 'diet_no_gluten' | 'diet_no_milk' | 'diet_no_pork';

type DietToggleProps = {
  active: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

function DietToggleButton({ active, label, disabled, onToggle, children }: DietToggleProps): JSX.Element {
  return (
    <button
      type="button"
      className={`k-diet-toggle${active ? ' k-diet-toggle--active' : ''}`}
      aria-pressed={active}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function DietIconBase({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {children}
      <line x1="7" y1="17" x2="17" y2="7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function DietIconGluten(): JSX.Element {
  return (
    <DietIconBase>
      <path d="M9 7v10M12 6v11M15 7v10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 10c1 0 1-2 2-2s1 2 2 2 1-2 2-2 1 2 2 2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </DietIconBase>
  );
}

function DietIconMilk(): JSX.Element {
  return (
    <DietIconBase>
      <path d="M10 6h4l-1 2v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V8l1-2z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9h4" stroke="currentColor" strokeWidth="1.2" />
    </DietIconBase>
  );
}

function DietIconPork(): JSX.Element {
  return (
    <DietIconBase>
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10.5" cy="11.5" r="0.6" fill="currentColor" />
      <circle cx="13.5" cy="11.5" r="0.6" fill="currentColor" />
      <path d="M10 14c1 1 3 1 4 0" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M9 8l-2-1M15 8l2-1" stroke="currentColor" strokeWidth="1.2" />
    </DietIconBase>
  );
}

function Dashboard(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Přehled', '/');
  const stateMarker = <StateMarker state={state} />;

  return (
    <main className="k-page" data-testid="dashboard-page">
      {stateMarker}
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
  const stateMarker = <StateMarker state={state} />;
  const auth = useAuth();
  const actorRole = auth?.activeRole ?? auth?.role ?? 'admin';
  const roles = auth?.roles ?? [];
  const isAdmin = actorRole === 'admin';
  const isRecepce = isAdmin || actorRole === 'recepce' || roles.includes('recepce');
  const canImport = isRecepce || isAdmin;
  const canReactivate = isRecepce || isAdmin;
  const canEditDiet = isRecepce || isAdmin;
  const canServe = isAdmin;

  const [serviceDate, setServiceDate] = React.useState(defaultServiceDate);
  const [items, setItems] = React.useState<BreakfastOrder[]>([]);
  const [summary, setSummary] = React.useState<BreakfastSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');

  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [importPreview, setImportPreview] = React.useState<BreakfastImportItem[] | null>(null);
  const [importDate, setImportDate] = React.useState<string | null>(null);
  const [importInfo, setImportInfo] = React.useState<string | null>(null);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [importBusy, setImportBusy] = React.useState(false);

  const loadDay = React.useCallback(
    (targetDate: string) => {
      if (state !== 'default') {
        return;
      }
      let active = true;
      Promise.all([
        fetchJson<BreakfastOrder[]>(`/api/v1/breakfast?service_date=${targetDate}`),
        fetchJson<BreakfastSummary>(`/api/v1/breakfast/daily-summary?service_date=${targetDate}`),
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
    },
    [state]
  );

  React.useEffect(() => {
    const cleanup = loadDay(serviceDate);
    return () => {
      if (cleanup) cleanup();
    };
  }, [loadDay, serviceDate]);

  const filteredItems = items.filter((item) => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return true;
    }
    return (
      item.room_number.toLowerCase().includes(term) ||
      (item.guest_name ?? '').toLowerCase().includes(term)
    );
  });

  const updateOrder = async (
    order: BreakfastOrder,
    updates: Partial<BreakfastPayload>
  ): Promise<void> => {
    const payload: BreakfastPayload = {
      service_date: order.service_date,
      room_number: order.room_number,
      guest_name: order.guest_name,
      guest_count: order.guest_count,
      status: updates.status ?? order.status,
      note: order.note ?? null,
      diet_no_gluten: updates.diet_no_gluten ?? order.diet_no_gluten ?? false,
      diet_no_milk: updates.diet_no_milk ?? order.diet_no_milk ?? false,
      diet_no_pork: updates.diet_no_pork ?? order.diet_no_pork ?? false,
    };

    const updated = await fetchJson<BreakfastOrder>(`/api/v1/breakfast/${order.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    setItems((prev) => prev.map((item) => (item.id === order.id ? updated : item)));
  };

  const toggleDiet = (order: BreakfastOrder, key: DietKey): void => {
    if (!canEditDiet) {
      return;
    }
    const updates: Partial<BreakfastPayload> = {};
    if (key === 'diet_no_gluten') updates.diet_no_gluten = !order.diet_no_gluten;
    if (key === 'diet_no_milk') updates.diet_no_milk = !order.diet_no_milk;
    if (key === 'diet_no_pork') updates.diet_no_pork = !order.diet_no_pork;
    void updateOrder(order, updates);
  };

  const markServed = (order: BreakfastOrder): void => {
    if (!canServe || order.status === 'served') {
      return;
    }
    void updateOrder(order, { status: 'served' });
  };

  const reactivate = (order: BreakfastOrder): void => {
    if (!canReactivate || order.status !== 'served') {
      return;
    }
    void updateOrder(order, { status: 'pending' });
  };

  const reactivateAll = async (): Promise<void> => {
    if (!isAdmin) {
      return;
    }
    const csrf = readCsrfToken();
    await fetchJson<void>(`/api/v1/breakfast/reactivate-all?service_date=${serviceDate}`, {
      method: 'POST',
      headers: csrf ? { 'x-csrf-token': csrf } : undefined,
    });
    loadDay(serviceDate);
  };

  const renderDietToggles = (
    data: { diet_no_gluten?: boolean; diet_no_milk?: boolean; diet_no_pork?: boolean },
    onToggle: (key: DietKey) => void,
    disabled: boolean
  ): JSX.Element => (
    <div className="k-diet-toggle-group">
      <DietToggleButton
        active={Boolean(data.diet_no_gluten)}
        label="Bez lepku"
        disabled={disabled}
        onToggle={() => onToggle('diet_no_gluten')}
      >
        <DietIconGluten />
      </DietToggleButton>
      <DietToggleButton
        active={Boolean(data.diet_no_milk)}
        label="Bez mléka"
        disabled={disabled}
        onToggle={() => onToggle('diet_no_milk')}
      >
        <DietIconMilk />
      </DietToggleButton>
      <DietToggleButton
        active={Boolean(data.diet_no_pork)}
        label="Bez vepřového"
        disabled={disabled}
        onToggle={() => onToggle('diet_no_pork')}
      >
        <DietIconPork />
      </DietToggleButton>
    </div>
  );

  const previewImport = async (file: File): Promise<void> => {
    setImportBusy(true);
    setImportError(null);
    setImportInfo(null);
    setImportPreview(null);
    try {
      const data = new FormData();
      data.append('file', file);
      const csrf = readCsrfToken();
      const result = await fetchJson<BreakfastImportResponse>('/api/v1/breakfast/import', {
        method: 'POST',
        headers: csrf ? { 'x-csrf-token': csrf } : undefined,
        body: data,
      });
      setImportPreview(result.items);
      setImportDate(result.date);
    } catch {
      setImportError('Validace PDF selhala.');
    } finally {
      setImportBusy(false);
    }
  };

  const handleImportFile = (file: File | null): void => {
    setImportFile(file);
    if (file) {
      void previewImport(file);
    } else {
      setImportPreview(null);
      setImportDate(null);
    }
  };

  const saveImport = async (): Promise<void> => {
    if (!importFile || !importPreview) {
      setImportError('Nejprve nahrajte PDF.');
      return;
    }
    setImportBusy(true);
    setImportError(null);
    try {
      const data = new FormData();
      data.append('save', 'true');
      data.append('file', importFile);
      data.append(
        'overrides',
        JSON.stringify(
          importPreview.map((item) => ({
            room: String(item.room),
            diet_no_gluten: Boolean(item.diet_no_gluten),
            diet_no_milk: Boolean(item.diet_no_milk),
            diet_no_pork: Boolean(item.diet_no_pork),
          }))
        )
      );
      const csrf = readCsrfToken();
      const result = await fetchJson<BreakfastImportResponse>('/api/v1/breakfast/import', {
        method: 'POST',
        headers: csrf ? { 'x-csrf-token': csrf } : undefined,
        body: data,
      });
      setImportInfo(`Import uložen: ${result.items.length} pokojů (${result.date}).`);
      setImportPreview(null);
      setImportDate(result.date);
      setServiceDate(result.date);
      loadDay(result.date);
    } catch {
      setImportError('Uložení importu selhalo.');
    } finally {
      setImportBusy(false);
    }
  };

  const downloadBreakfastPdf = (): void => {
    if (!serviceDate) {
      return;
    }
    const url = `/api/v1/breakfast/export/daily?service_date=${encodeURIComponent(serviceDate)}`;
    window.open(url, '_blank', 'noopener');
  };

  const importPreviewTable = importPreview ? (
    <div className="k-card">
      <div className="k-toolbar">
        <strong>Kontrola importu</strong>
        <span className="k-subtle">{importDate ?? '-'}</span>
      </div>
      <DataTable
        headers={['Pokoj', 'Host', 'Počet', 'Diety']}
        rows={importPreview.map((item, index) => [
          item.room,
          item.guest_name ?? `Pokoj ${item.room}`,
          item.count,
          renderDietToggles(
            item,
            (key) =>
              setImportPreview((prev) => {
                if (!prev) return prev;
                return prev.map((row, rowIndex) => {
                  if (rowIndex !== index) return row;
                  if (key === 'diet_no_gluten') return { ...row, diet_no_gluten: !row.diet_no_gluten };
                  if (key === 'diet_no_milk') return { ...row, diet_no_milk: !row.diet_no_milk };
                  return { ...row, diet_no_pork: !row.diet_no_pork };
                });
              }),
            false
          ),
        ])}
      />
      <div className="k-toolbar">
        <button className="k-button" type="button" onClick={() => void saveImport()} disabled={importBusy}>
          Potvrdit import
        </button>
        <button className="k-button secondary" type="button" onClick={() => setImportPreview(null)}>
          Zavřít náhled
        </button>
      </div>
    </div>
  ) : null;

  const breakfastToolbar = (
    <div className="k-toolbar">
      <input
        className="k-input"
        type="date"
        value={serviceDate}
        aria-label="Datum"
        onChange={(event) => setServiceDate(event.target.value)}
      />
      <input
        className="k-input"
        placeholder="Hledat dle pokoje nebo hosta"
        aria-label="Hledat"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {canImport ? (
        <>
          <input
            className="k-input"
            type="file"
            accept="application/pdf"
            aria-label="Import PDF"
            onChange={(event) => handleImportFile(event.target.files?.[0] ?? null)}
          />
          <button
            className="k-button secondary"
            type="button"
            onClick={downloadBreakfastPdf}
            disabled={!serviceDate}
          >
            Export snídaní (PDF)
          </button>
        </>
      ) : null}
      {isAdmin ? (
        <button className="k-button secondary" type="button" onClick={() => void reactivateAll()}>
          Reaktivovat všechny snídaně
        </button>
      ) : null}
    </div>
  );

  return (
    <main className="k-page" data-testid="breakfast-list-page">
      {stateMarker}
      <h1>Snídaně</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
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
          {breakfastToolbar}
          {canImport && (importError || importInfo) ? (
            <p className={importError ? 'k-text-error' : 'k-text-success'}>
              {importError ?? importInfo}
            </p>
          ) : null}
          {importPreviewTable}
          {filteredItems.length === 0 ? (
            <StateView
              title="Prázdný stav"
              description="Nebyly nalezeny žádné objednávky."
              stateKey="empty"
            />
          ) : (
            <DataTable
              headers={['Datum', 'Pokoj', 'Host', 'Počet', 'Diety', 'Stav', 'Akce']}
              rows={filteredItems.map((item) => {
                const rowClass = item.status === 'served' ? 'k-row-muted' : '';
                const action = item.status === 'served'
                  ? canReactivate
                    ? (
                      <button className="k-button secondary" type="button" onClick={() => reactivate(item)}>
                        Reaktivovat
                      </button>
                    )
                    : (
                      <span className="k-text-muted">Zkonzumováno</span>
                    )
                  : canServe
                    ? (
                      <button className="k-button" type="button" onClick={() => markServed(item)}>
                        Zkonzumováno
                      </button>
                    )
                    : (
                      <span className="k-text-muted">-</span>
                    );

                return [
                  <span className={rowClass}>{item.service_date}</span>,
                  <span className={rowClass}>{item.room_number}</span>,
                  <span className={rowClass}>{item.guest_name ?? '-'}</span>,
                  <span className={rowClass}>{item.guest_count}</span>,
                  <span className={rowClass}>
                    {renderDietToggles(item, (key) => toggleDiet(item, key), !canEditDiet)}
                  </span>,
                  <span className={rowClass}>{breakfastStatusLabel(item.status)}</span>,
                  action,
                ];
              })}
            />
          )}
        </>
      )}
    </main>
  );
}

function BreakfastForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Snídaně', '/snidane');
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
      {stateMarker}
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
        setError('Objednávka nebyla nalezena.');
      });
  }, [id, state]);

  return (
    <main className="k-page" data-testid="breakfast-detail-page">
      {stateMarker}
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
  const stateUI = stateViewForRoute(state, 'Ztráty a nálezy', '/ztraty-a-nalezy');
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
      .catch(() => setError('Nepodařilo se načíst položky ztrát a nálezů.'));
  }, [state, statusFilter, typeFilter]);

  return (
    <main className="k-page" data-testid="lost-found-list-page">
      {stateMarker}
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
            <Card title="Nová">
              <strong>{items.filter((item) => item.status === 'new').length}</strong>
            </Card>
            <Card title="Uskladněno">
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
              <option value="new">Nová</option>
              <option value="stored">Uskladněno</option>
              <option value="disposed">Zlikvidovat</option>
            </select>
            <Link className="k-button" to="/ztraty-a-nalezy/novy">
              Nová položka
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
                  alt="Miniatura nálezu"
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
  const stateUI = stateViewForRoute(state, 'Ztráty a nálezy', '/ztraty-a-nalezy');
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
      .catch(() => setError('Položku se nepodařilo načíst.'));
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
      setError('Položku se nepodařilo uložit.');
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'lost-found-create-page' : 'lost-found-edit-page'}>
      {stateMarker}
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
            <FormField id="room_number" label="Číslo pokoje (volitelné)">
              <input
                id="room_number"
                className="k-input"
                value={payload.room_number ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, room_number: event.target.value }))}
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
            <FormField id="lost_found_photos" label="Fotodokumentace (volitelné)">
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
  const stateUI = stateViewForRoute(state, 'Ztráty a nálezy', '/ztraty-a-nalezy');
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
      .catch(() => setError('Položka nebyla nalezena.'));
  }, [id, state]);

  return (
    <main className="k-page" data-testid="lost-found-detail-page">
      {stateMarker}
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
            headers={['Položka', 'Hodnota']}
            rows={[
              ['Typ', lostFoundTypeLabel(item.item_type)],
              ['Kategorie', item.category],
              ['Místo', item.location],
              ['Pokoj', item.room_number ?? '-'],
              ['Datum a čas', new Date(item.event_at).toLocaleString('cs-CZ')],
              ['Stav', lostFoundStatusLabel(item.status)],
              ['Popis', item.description],
              ['Tagy', (item.tags ?? []).map((tag) => lostFoundTagLabel(tag)).join(', ') || '-'],
              ['Jméno žadatele', item.claimant_name ?? '-'],
              ['Kontakt', item.claimant_contact ?? '-'],
              ['Předávací záznam', item.handover_note ?? '-'],
            ]}
          />
          {photos.length > 0 ? (
            <div className="k-grid cards-3">
              {photos.map((photo) => (
                <img
                  key={photo.id}
                  src={`/api/v1/lost-found/${item.id}/photos/${photo.id}/thumb`}
                  alt={`Fotografie položky ${photo.id}`}
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
  const stateUI = stateViewForRoute(state, 'Závady', '/zavady');
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
      .catch(() => setError('Nepodařilo se načíst seznam závad.'));
  }, [locationFilter, priorityFilter, state, statusFilter]);

  return (
    <main className="k-page" data-testid="issues-list-page">
      {stateMarker}
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
              <option value="all">Všechny stavy</option><option value="new">Nová</option><option value="in_progress">V řešení</option><option value="resolved">Odstraněno</option><option value="closed">Uzavřena</option>
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
    })).catch(() => setError('Závadu se nepodařilo načíst.'));
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
    } catch { setError('Závadu se nepodařilo uložit.'); }
  };

  return <main className="k-page" data-testid={mode === 'create' ? 'issues-create-page' : 'issues-edit-page'}>{stateMarker}<h1>{mode === 'create' ? 'Nová závada' : 'Upravit závadu'}</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">Zpět na seznam</Link><button className="k-button" type="button" onClick={() => void save()}>Uložit</button></div><div className="k-form-grid">
<FormField id="issue_title" label="Název"><input id="issue_title" className="k-input" value={payload.title} onChange={(e) => setPayload((prev) => ({ ...prev, title: e.target.value }))} /></FormField>
<FormField id="issue_location" label="Lokalita"><input id="issue_location" className="k-input" value={payload.location} onChange={(e) => setPayload((prev) => ({ ...prev, location: e.target.value }))} /></FormField>
<FormField id="issue_room_number" label="Pokoj (volitelné)"><input id="issue_room_number" className="k-input" value={payload.room_number ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, room_number: e.target.value }))} /></FormField>
<FormField id="issue_priority" label="Priorita"><select id="issue_priority" className="k-select" value={payload.priority} onChange={(e) => setPayload((prev) => ({ ...prev, priority: e.target.value as IssuePriority }))}><option value="low">Nízká</option><option value="medium">Střední</option><option value="high">Vysoká</option><option value="critical">Kritická</option></select></FormField>
<FormField id="issue_status" label="Stav"><select id="issue_status" className="k-select" value={payload.status} onChange={(e) => setPayload((prev) => ({ ...prev, status: e.target.value as IssueStatus }))}><option value="new">Nová</option><option value="in_progress">V řešení</option><option value="resolved">Vyřešena</option><option value="closed">Uzavřena</option></select></FormField>
<FormField id="issue_assignee" label="Přiřazeno (volitelné)"><input id="issue_assignee" className="k-input" value={payload.assignee ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, assignee: e.target.value }))} /></FormField>
<FormField id="issue_description" label="Popis"><textarea id="issue_description" className="k-textarea" rows={3} value={payload.description ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} /></FormField>
<FormField id="issue_photos" label="Fotodokumentace (volitelné)"><input id="issue_photos" type="file" className="k-input" multiple accept="image/*" onChange={(e) => { const files = Array.from(e.target.files ?? []); setPhotos(files.slice(0, 3)); }} /></FormField>
</div></div>}</main>;
}

function IssuesDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Závady', '/zavady');
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
      .catch(() => setError('Závada nebyla nalezena.'));
  }, [id, state]);

  const timeline = item ? [
    { label: 'Vytvořeno', value: formatDateTime(item.created_at) },
    ...(item.in_progress_at ? [{ label: 'V řešení', value: new Date(item.in_progress_at).toLocaleString('cs-CZ') }] : []),
    ...(item.resolved_at ? [{ label: 'Odstraněno', value: new Date(item.resolved_at).toLocaleString('cs-CZ') }] : []),
    ...(item.closed_at ? [{ label: 'Uzavřeno', value: new Date(item.closed_at).toLocaleString('cs-CZ') }] : []),
  ] : [];

  return (
    <main className="k-page" data-testid="issues-detail-page">
      {stateMarker}
      <h1>Detail závady</h1><StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/zavady">Zpět na seznam</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">Zpět na seznam</Link><Link className="k-button" to={`/zavady/${item.id}/edit`}>Upravit</Link><button className="k-button secondary" type="button" onClick={() => void fetchJson(`/api/v1/issues/${item.id}`, { method: 'DELETE' }).then(() => window.location.assign('/admin/zavady')).catch(() => setError('Smazání závady selhalo.'))}>Smazat</button></div><DataTable headers={['Položka', 'Hodnota']} rows={[[ 'Název', item.title],[ 'Lokace', item.location],[ 'Pokoj', item.room_number ?? '-'],[ 'Priorita', issuePriorityLabel(item.priority)],[ 'Stav', issueStatusLabel(item.status)],[ 'Přiřazeno', item.assignee ?? '-'],[ 'Popis', item.description ?? '-' ]]} /><h2>Timeline</h2><Timeline entries={timeline} />{photos.length > 0 ? <div className="k-grid cards-3">{photos.map((photo) => <img key={photo.id} src={`/api/v1/issues/${item.id}/photos/${photo.id}/thumb`} alt={`Fotografie závady ${photo.id}`} className="k-photo-thumb" />)}</div> : null}</div> : <SkeletonPage />}
    </main>
  );
}


function InventoryList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Skladové hospodářství', '/sklad');
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
      .catch(() => setError('Položky skladu se nepodařilo načíst.'));
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
      setSeedInfo(`Doplněno ${seeded.length} výchozích položek.`);
      loadItems();
    } catch {
      setSeedInfo('Doplnění výchozích položek se nepodařilo.');
    }
  };

  const downloadStocktakePdf = (): void => {
    window.open('/api/v1/inventory/stocktake/pdf', '_blank', 'noopener');
  };

  return (
    <main className="k-page" data-testid="inventory-list-page">
      {stateMarker}
      <h1>Skladové hospodářství</h1>
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
              Doplnit výchozí položky
            </button>
            <button className="k-button secondary" type="button" onClick={downloadStocktakePdf}>
              Inventurní protokol (PDF)
            </button>
            <Link className="k-button" to="/sklad/nova">Nová položka</Link>
          </div>
          {seedInfo ? <p>{seedInfo}</p> : null}
          <StateView
            title="Prázdný stav"
            description="Ve skladu zatím nejsou položky."
            stateKey="empty"
            action={<Link className="k-button" to="/sklad/nova">Nová položka</Link>}
          />
        </>
      ) : (
        <>
          <div className="k-toolbar">
            <button className="k-button secondary" type="button" onClick={() => void seedDefaults()}>
              Doplnit výchozí položky
            </button>
            <button className="k-button secondary" type="button" onClick={downloadStocktakePdf}>
              Inventurní protokol (PDF)
            </button>
            <Link className="k-button" to="/sklad/nova">Nová položka</Link>
          </div>
          {seedInfo ? <p>{seedInfo}</p> : null}
          <DataTable
            headers={['Ikona', 'Položka', 'Skladem', 'Minimum', 'Jednotka', 'Dodavatel', 'Status', 'Akce']}
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
  const stateUI = stateViewForRoute(state, 'Skladové hospodářství', '/sklad');
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

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'inventory-create-page' : 'inventory-edit-page'}>
      {stateMarker}
      <h1>{mode === 'create' ? 'Nová skladová položka' : 'Upravit skladovou položku'}</h1>
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
            <Link className="k-nav-link" to="/sklad">Zpět na seznam</Link>
            <button className="k-button" type="button" onClick={() => void save()}>Uložit</button>
          </div>
          <div className="k-form-grid">
            <FormField id="inventory_name" label="Název">
              <input
                id="inventory_name"
                className="k-input"
                value={payload.name}
                onChange={(event) => setPayload((prev) => ({ ...prev, name: event.target.value }))}
              />
            </FormField>
            <FormField id="inventory_unit" label="Veličina v 1 ks">
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
            <FormField id="inventory_amount_per_piece_base" label="Hodnota veličiny v 1 ks">
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
            <FormField id="inventory_min_stock" label="Minimální stav">
              <input
                id="inventory_min_stock"
                type="number"
                className="k-input"
                value={payload.min_stock}
                onChange={(event) => setPayload((prev) => ({ ...prev, min_stock: Number(event.target.value) }))}
              />
            </FormField>
            <FormField id="inventory_supplier" label="Dodavatel (volitelné)">
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
  const stateUI = stateViewForRoute(state, 'Skladové hospodářství', '/sklad');
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
    }).catch(() => setError('Položka nebyla nalezena.'));
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
      setError('Příjem se nepodařilo uložit.');
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
      setError('Výdej se nepodařilo uložit.');
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
      setMediaInfo('Piktogram uložen.');
      setPictogram(null);
      loadDetail();
    } catch {
      setMediaInfo('Piktogram se nepodařilo uložit.');
    }
  };

  return (
    <main className="k-page" data-testid="inventory-detail-page">
      {stateMarker}
      <h1>Detail skladové položky</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView
          title="404"
          description={error}
          stateKey="404"
          action={<Link className="k-button secondary" to="/sklad">Zpět na seznam</Link>}
        />
      ) : item ? (
        <>
          <div className="k-card">
            <div className="k-toolbar">
              <Link className="k-nav-link" to="/sklad">Zpět na seznam</Link>
              <Link className="k-button" to={`/sklad/${item.id}/edit`}>Upravit</Link>
            </div>
            <DataTable
              headers={['Položka', 'Skladem', 'Minimum', 'Veličina v 1 ks', 'Dodavatel', 'Hodnota veličiny v 1 ks']}
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
                  Uložit piktogram
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
            <h2>Příjem</h2>
            <div className="k-form-grid">
              <FormField id="receipt_quantity" label="Počet kusů">
                <input
                  id="receipt_quantity"
                  type="number"
                  className="k-input"
                  value={receiptQuantity}
                  onChange={(event) => setReceiptQuantity(Number(event.target.value))}
                />
              </FormField>
              <FormField id="receipt_date" label="Datum příjmu">
                <input
                  id="receipt_date"
                  type="date"
                  className="k-input"
                  value={receiptDate}
                  onChange={(event) => setReceiptDate(event.target.value)}
                />
              </FormField>
              <FormField id="receipt_reference" label="Číslo dodacího listu / faktury">
                <input
                  id="receipt_reference"
                  className="k-input"
                  value={receiptReference}
                  onChange={(event) => setReceiptReference(event.target.value)}
                />
              </FormField>
              <FormField id="receipt_note" label="Poznámka (volitelné)">
                <input
                  id="receipt_note"
                  className="k-input"
                  value={receiptNote}
                  onChange={(event) => setReceiptNote(event.target.value)}
                />
              </FormField>
            </div>
            <button className="k-button" type="button" onClick={() => void addReceipt()}>
              Uložit příjem
            </button>
          </div>
          <div className="k-card">
            <h2>{issueType === 'adjust' ? 'Odpis' : 'Výdej'}</h2>
            <div className="k-form-grid">
              <FormField id="issue_kind" label="Druh výdejky">
                <select
                  id="issue_kind"
                  className="k-select"
                  value={issueType}
                  onChange={(event) => setIssueType(event.target.value as InventoryMovementType)}
                >
                  <option value="out">Výdej</option>
                  <option value="adjust">Odpis</option>
                </select>
              </FormField>
              <FormField id="issue_quantity" label="Počet kusů">
                <input
                  id="issue_quantity"
                  type="number"
                  className="k-input"
                  value={issueQuantity}
                  onChange={(event) => setIssueQuantity(Number(event.target.value))}
                />
              </FormField>
              <FormField id="issue_date" label="Datum výdejky">
                <input
                  id="issue_date"
                  type="date"
                  className="k-input"
                  value={issueDate}
                  onChange={(event) => setIssueDate(event.target.value)}
                />
              </FormField>
              <FormField id="issue_note" label="Poznámka (volitelné)">
                <input
                  id="issue_note"
                  className="k-input"
                  value={issueNote}
                  onChange={(event) => setIssueNote(event.target.value)}
                />
              </FormField>
            </div>
            <button className="k-button" type="button" onClick={() => void addIssue()}>
              Uložit výdej
            </button>
          </div>
          <div className="k-card">
            <h2>Pohyby</h2>
            <DataTable
              headers={['Doklad', 'Datum', 'Druh', 'Počet kusů', 'Reference', 'Poznámka']}
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
      {stateUI ?? <StateView title={`${title} připraveno`} description="Modul je připraven na workflow." />}
    </main>
  );
}


function ReportsList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Hlášení', '/hlaseni');
  const stateMarker = <StateMarker state={state} />;
  const [items, setItems] = React.useState<Report[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default') {
      return;
    }
    fetchJson<Report[]>('/api/v1/reports')
      .then(setItems)
      .catch(() => setError('Hlášení se nepodařilo načíst.'));
  }, [state]);

  return <main className="k-page" data-testid="reports-list-page">{stateMarker}<h1>Hlášení</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? <StateView title="Prázdný stav" description="Zatím není evidováno žádné hlášení." stateKey="empty" action={<Link className="k-button" to="/hlaseni/nove">Nové hlášení</Link>} /> : <><div className="k-toolbar"><Link className="k-button" to="/hlaseni/nove">Nové hlášení</Link></div><DataTable headers={['Název', 'Stav', 'Vytvořeno', 'Akce']} rows={items.map((item) => [item.title, <Badge key={`status-${item.id}`} tone={item.status === 'closed' ? 'success' : item.status === 'in_progress' ? 'warning' : 'neutral'}>{reportStatusLabel(item.status)}</Badge>, formatDateTime(item.created_at), <Link className="k-nav-link" key={item.id} to={`/hlaseni/${item.id}`}>Detail</Link>])} /></>}</main>;
}

function ReportsForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Hlášení', '/hlaseni');
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
      .catch(() => setError('Detail hlášení se nepodařilo načíst.'));
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
      setError('Hlášení se nepodařilo uložit.');
    }
  }

  return <main className="k-page" data-testid={mode === 'create' ? 'reports-create-page' : 'reports-edit-page'}>{stateMarker}<h1>{mode === 'create' ? 'Nové hlášení' : 'Upravit hlášení'}</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/hlaseni">Zpět na seznam</Link><button className="k-button" type="button" onClick={() => void save()}>Uložit</button></div><div className="k-form-grid"><FormField id="report_title" label="Název"><input id="report_title" className="k-input" value={payload.title} onChange={(e) => setPayload((prev) => ({ ...prev, title: e.target.value }))} /></FormField><FormField id="report_status" label="Stav"><select id="report_status" className="k-select" value={payload.status} onChange={(e) => setPayload((prev) => ({ ...prev, status: e.target.value as ReportStatus }))}><option value="open">Otevřené</option><option value="in_progress">V řešení</option><option value="closed">Uzavřené</option></select></FormField><FormField id="report_description" label="Popis (volitelné)"><textarea id="report_description" className="k-input" value={payload.description ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} /></FormField></div></div>}</main>;
}

function ReportsDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Hlášení', '/hlaseni');
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
      .catch(() => setError('Hlášení nebylo nalezeno.'));
  }, [id, state]);

  return <main className="k-page" data-testid="reports-detail-page">{stateMarker}<h1>Detail hlášení</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/hlaseni">Zpět na seznam</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/hlaseni">Zpět na seznam</Link><Link className="k-button" to={`/hlaseni/${item.id}/edit`}>Upravit</Link></div><DataTable headers={['Položka', 'Hodnota']} rows={[[ 'Název', item.title],[ 'Stav', reportStatusLabel(item.status)],[ 'Popis', item.description ?? '-' ],[ 'Vytvořeno', formatDateTime(item.created_at) ],[ 'Aktualizováno', formatDateTime(item.updated_at) ]]} /></div> : <SkeletonPage />}</main>;
}

function UsersAdmin(): JSX.Element {
  const [users, setUsers] = React.useState<PortalUser[] | null>(null);
  const [selected, setSelected] = React.useState<PortalUser | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [filterQuery, setFilterQuery] = React.useState('');
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

  const [pendingDelete, setPendingDelete] = React.useState<PortalUser | null>(null);
  const deleteTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const confirmDeleteRef = React.useRef<HTMLButtonElement | null>(null);

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
      .catch(() => setError('Nepodařilo se načíst uživatele.'));
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
      setMessage('Uživatel byl vytvořen.');
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 409) {
          setError('Uživatel s tímto e‑mailem už existuje.');
        } else if (err.status === 403) {
          setError('Nemáte oprávnění vytvářet uživatele.');
        } else if (err.status === 422) {
          setError('Zadaná data nejsou platná. Zkontrolujte prosím formulář.');
        } else {
          setError('Uživatele se nepodařilo vytvořit.');
        }
      } else {
        setError('Uživatele se nepodařilo vytvořit.');
      }
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
      setMessage('Uživatel byl upraven.');
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 409) {
          setError('E‑mail už používá jiný uživatel.');
        } else if (err.status === 404) {
          setError('Uživatel nebyl nalezen – může být mezitím smazán.');
        } else if (err.status === 403) {
          setError('Nemáte oprávnění upravovat uživatele.');
        } else if (err.status === 422) {
          setError('Zadaná data nejsou platná. Zkontrolujte prosím formulář.');
        } else {
          setError('Uživatele se nepodařilo upravit.');
        }
      } else {
        setError('Uživatele se nepodařilo upravit.');
      }
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
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 403) {
          setError('Nemáte oprávnění měnit stav uživatele.');
        } else if (err.status === 404) {
          setError('Uživatel nebyl nalezen.');
        } else {
          setError('Nepodařilo se změnit stav uživatele.');
        }
      } else {
        setError('Nepodařilo se změnit stav uživatele.');
      }
    }
  }

  async function sendPasswordResetLink(user: PortalUser): Promise<void> {
    try {
      const csrf = readCsrfToken();
      await fetchJson<{ ok: boolean }>(`/api/v1/users/${user.id}/password/reset-link`, {
        method: 'POST',
        headers: csrf ? { 'x-csrf-token': csrf } : undefined,
      });
      setMessage('Pokud účet existuje a je dostupný e-mail, byl odeslán token pro reset hesla.');
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 403) {
          setError('Nemáte oprávnění odeslat resetovací token.');
        } else if (err.status === 404) {
          setError('Uživatel nebyl nalezen.');
        } else {
          setError('Odeslání resetovacího tokenu se nezdařilo.');
        }
      } else {
        setError('Odeslání resetovacího tokenu se nezdařilo.');
      }
    }
  }

  const roleToggle = (selectedRoles: PortalRole[], setter: (value: PortalRole[]) => void, role: PortalRole): void => {
    setter(selectedRoles.includes(role) ? selectedRoles.filter((item) => item !== role) : [...selectedRoles, role]);
  };

  const roleLabel = (role: string): string => portalRoleLabels[role as PortalRole] ?? role;

  const normalizeSearchValue = (value: string): string =>
    value
      .toLocaleLowerCase('cs-CZ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const normalizedFilter = normalizeSearchValue(filterQuery);

  const filteredUsers = React.useMemo(() => {
    if (!users) {
      return [];
    }
    if (!normalizedFilter) {
      return users;
    }
    return users.filter((user) => {
      const haystack = normalizeSearchValue(
        [
          user.first_name,
          user.last_name,
          `${user.first_name} ${user.last_name}`,
          user.email,
          user.roles.map((role) => roleLabel(role)).join(' '),
        ].join(' ')
      );
      return haystack.includes(normalizedFilter);
    });
  }, [normalizedFilter, users]);

  const hasFilter = Boolean(normalizedFilter);

  const normalizePhoneInput = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    if (trimmed.startsWith('+')) return trimmed;
    if (trimmed.startsWith('00')) return `+${trimmed.slice(2)}`;
    if (/^\d+$/.test(trimmed)) {
      // Pokud uživatel píše lokální číslo bez předvolby, doplníme +420.
      if (trimmed.startsWith('420')) return `+${trimmed}`;
      return `+420${trimmed}`;
    }
    return trimmed;
  };

  function requestDelete(event: React.MouseEvent<HTMLButtonElement>, user: PortalUser): void {
    deleteTriggerRef.current = event.currentTarget;
    setPendingDelete(user);
  }

  function cancelDelete(): void {
    setPendingDelete(null);
  }

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const targetId = pendingDelete.id;
      await fetchJson<void>(`/api/v1/users/${targetId}`, {
        method: 'DELETE',
      });
      setMessage('Uživatel byl smazán.');
      setPendingDelete(null);
      setSelected((prev) => (prev && prev.id === targetId ? null : prev));
      syncEdit(null);
      load();
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 403) {
          setError('Nemáte oprávnění smazat tohoto uživatele.');
        } else if (err.status === 404) {
          setError('Uživatel nebyl nalezen – mohl být mezitím odstraněn.');
        } else if (err.status === 409) {
          setError('Primární administrátorský účet nelze smazat.');
        } else {
          setError('Smazání uživatele se nepodařilo.');
        }
      } else {
        setError('Smazání uživatele se nepodařilo.');
      }
    } finally {
      setSaving(false);
    }
  }

  React.useEffect(() => {
    if (pendingDelete) {
      const frame = window.requestAnimationFrame(() => {
        confirmDeleteRef.current?.focus();
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }
    if (deleteTriggerRef.current) {
      deleteTriggerRef.current.focus();
    }
    return undefined;
  }, [pendingDelete]);

  const handleDeleteDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelDelete();
    }
  };

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
      <h1>Uživatelé</h1>
      {error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button secondary" type="button" onClick={load}>Zkusit znovu</button>} /> : null}
      {message ? <StateView title="Info" description={message} stateKey="info" /> : null}
      {users === null ? <SkeletonPage /> : (
        <div className="k-grid cards-2">
          <Card title="Seznam uživatelů">
            <div className="k-toolbar">
              <button className="k-button" type="button" onClick={() => scrollToSection('users-create')}>Nový</button>
              <input
                className="k-input"
                type="search"
                value={filterQuery}
                onChange={(event) => setFilterQuery(event.target.value)}
                placeholder="Hledat jméno, email nebo roli"
                aria-label="Filtrovat uživatele"
              />
              {hasFilter ? (
                <button className="k-button secondary" type="button" onClick={() => setFilterQuery('')}>
                  Zrušit filtr
                </button>
              ) : null}
            </div>
            {users.length === 0 ? (
              <StateView title="Prázdný stav" description="Zatím neexistují žádní uživatelé portálu." stateKey="empty" />
            ) : filteredUsers.length === 0 ? (
              <StateView title="Nenalezeno" description="Filtru neodpovídá žádný uživatel." stateKey="empty" />
            ) : (
              <DataTable
                headers={['Jméno', 'Příjmení', 'Email', 'Role', 'Poslední přihlášení', 'Stav', 'Akce']}
                rows={filteredUsers.map((u) => [
                  <button key={u.id} className="k-nav-link" type="button" onClick={() => selectUser(u)}>{u.first_name}</button>,
                  u.last_name,
                  u.email,
                  u.roles.map(roleLabel).join(', '),
                  formatDateTime(u.last_login_at),
                  u.is_active ? 'Aktivní' : 'Neaktivní',
                  <button key={`edit-${u.id}`} className="k-button secondary" type="button" onClick={() => selectUser(u)}>Upravit</button>,
                ])}
              />
            )}
          </Card>

          <div id="users-detail">
            <Card title="Detail / Úprava">
              {!selected ? <p>Vyberte uživatele.</p> : (
                <div className="k-form-grid">
                  <FormField id="edit_first_name" label="Jméno">
                    <input id="edit_first_name" className="k-input" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
                  </FormField>
                  <FormField id="edit_last_name" label="Příjmení">
                    <input id="edit_last_name" className="k-input" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
                  </FormField>
                  <FormField id="edit_email" label="Email">
                    <input id="edit_email" className="k-input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                  </FormField>
                {!editEmailValid ? <small>Neplatný email.</small> : null}
                  <FormField id="edit_phone" label="Telefon (E.164, volitelné)">
                    <input id="edit_phone" className="k-input" value={editPhone} onChange={(e) => setEditPhone(normalizePhoneInput(e.target.value))} placeholder="+420123456789" />
                  </FormField>
                  <small>Např. +420123456789. Při zadání bez předvolby doplníme +420.</small>
                  {!editPhoneValid ? <small>Telefon musí být ve formátu E.164.</small> : null}
                  <FormField id="edit_last_login" label="Poslední přihlášení">
                    <input id="edit_last_login" className="k-input" value={formatDateTime(selected.last_login_at)} readOnly />
                  </FormField>
                  <FormField id="edit_note" label="Poznámka (volitelné)">
                    <textarea id="edit_note" className="k-input" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                  </FormField>
                  <fieldset className="k-card"><legend>Role</legend>
                    {portalRoleOptions.map((role) => (
                      <label key={`edit-role-${role}`} className="k-role-label">
                        <input type="checkbox" checked={editRoles.includes(role)} onChange={() => roleToggle(editRoles, setEditRoles, role)} /> {portalRoleLabels[role]}
                      </label>
                    ))}
                  </fieldset>
                  <small>Admin přístup se nastavuje mimo role portálu.</small>
                  <div className="k-toolbar">
                    <button className="k-button" type="button" onClick={() => void saveSelectedUser()} disabled={!editValid || saving}>Upravit</button>
                    <button className="k-button secondary" type="button" onClick={() => void toggleActive(selected)}>
                      {selected.is_active ? 'Zakázat' : 'Povolit'}
                    </button>
                    <button className="k-button secondary" type="button" onClick={() => void sendPasswordResetLink(selected)}>
                      Odeslat token pro reset hesla
                    </button>
                    {canDelete ? (
                      <button className="k-button secondary" type="button" onClick={(event) => requestDelete(event, selected)}>
                        Smazat
                      </button>
                    ) : (
                      <small>Smazání je dostupné pouze pro admina.</small>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div id="users-create">
            <Card title="Vytvořit uživatele">
              <div className="k-form-grid">
                <FormField id="create_first_name" label="Jméno">
                  <input id="create_first_name" className="k-input" value={createFirstName} onChange={(e) => setCreateFirstName(e.target.value)} />
                </FormField>
                <FormField id="create_last_name" label="Příjmení">
                  <input id="create_last_name" className="k-input" value={createLastName} onChange={(e) => setCreateLastName(e.target.value)} />
                </FormField>
                <FormField id="create_email" label="Email">
                  <input id="create_email" className="k-input" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
                </FormField>
                {!createEmailValid && createEmail.trim() ? <small>Neplatný email.</small> : null}
                <FormField id="create_password" label="Dočasné heslo">
                  <input id="create_password" className="k-input" type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} />
                </FormField>
                <FormField id="create_phone" label="Telefon (E.164, volitelné)">
                  <input id="create_phone" className="k-input" value={createPhone} onChange={(e) => setCreatePhone(normalizePhoneInput(e.target.value))} placeholder="+420123456789" />
                </FormField>
                <small>Např. +420123456789. Při zadání bez předvolby doplníme +420.</small>
                {!createPhoneValid ? <small>Telefon musí být ve formátu E.164.</small> : null}
                <FormField id="create_note" label="Poznámka (volitelné)">
                  <textarea id="create_note" className="k-input" value={createNote} onChange={(e) => setCreateNote(e.target.value)} />
                </FormField>
                <fieldset className="k-card"><legend>Role</legend>
                  {portalRoleOptions.map((role) => (
                    <label key={`create-role-${role}`} className="k-role-label">
                      <input type="checkbox" checked={createRoles.includes(role)} onChange={() => roleToggle(createRoles, setCreateRoles, role)} /> {portalRoleLabels[role]}
                    </label>
                  ))}
                </fieldset>
                <small>Admin přístup se nastavuje mimo role portálu.</small>
                <button className="k-button" type="button" onClick={() => void createUser()} disabled={!createValid || saving}>Vytvořit uživatele</button>
              </div>
            </Card>
          </div>
        </div>
      )}
      {pendingDelete ? (
        <div
          className="k-card"
          data-testid="confirm-delete-card"
          aria-labelledby="confirm-delete-title"
          aria-describedby="confirm-delete-description"
          role="alertdialog"
          aria-modal="true"
          onKeyDown={handleDeleteDialogKeyDown}
        >
          <h2 id="confirm-delete-title">Potvrdit smazání</h2>
          <p id="confirm-delete-description">
            Opravdu chcete smazat uživatele <strong>{pendingDelete.email}</strong>? Operaci nelze vrátit, ale účet je možné vytvořit znovu.
          </p>
          <div className="k-toolbar">
            <button
              ref={confirmDeleteRef}
              className="k-button"
              type="button"
              onClick={() => { void confirmDelete(); }}
              disabled={saving}
            >
              Smazat
            </button>
            <button className="k-button secondary" type="button" onClick={cancelDelete} disabled={saving}>
              Zrušit
            </button>
          </div>
        </div>
      ) : null}
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
        setError('Nepodařilo se načíst SMTP nastavení.');
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function save(): Promise<void> {
    if (!host.trim() || !username.trim() || !password.trim()) {
      setError('Host, uživatel a heslo jsou povinné.');
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
      setMessage('SMTP nastavení bylo uloženo.');
      setPassword('');
    } catch {
      setError('SMTP nastavení se nepodařilo uložit.');
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail(): Promise<void> {
    const recipient = testRecipient.trim();
    if (!recipient) {
      setError('Vyplňte příjemce testovacího e-mailu.');
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
      setMessage('Testovací e-mail byl odeslán.');
    } catch {
      setError('Testovací e-mail se nepodařilo odeslat.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="k-page" data-testid="settings-admin-page">
      <h1>Nastavení SMTP</h1>
      {error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button secondary" type="button" onClick={load}>Zkusit znovu</button>} /> : null}
      {message ? <StateView title="Info" description={message} stateKey="info" /> : null}
      {loading ? <SkeletonPage /> : (
        <Card title="E-mailová konfigurace">
          <div className="k-form-grid">
            <FormField id="smtp_host" label="SMTP host">
              <input id="smtp_host" className="k-input" value={host} onChange={(e) => setHost(e.target.value)} />
            </FormField>
            <FormField id="smtp_port" label="SMTP port">
              <input id="smtp_port" className="k-input" type="number" value={port} onChange={(e) => setPort(Number(e.target.value) || 0)} />
            </FormField>
            <FormField id="smtp_username" label="SMTP uživatel">
              <input id="smtp_username" className="k-input" value={username} onChange={(e) => setUsername(e.target.value)} />
            </FormField>
            <FormField id="smtp_password" label="SMTP heslo">
              <input id="smtp_password" className="k-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
            <label className="k-role-label">
              <input type="checkbox" checked={useTls} onChange={(e) => setUseTls(e.target.checked)} /> Použít TLS
            </label>
            <label className="k-role-label">
              <input type="checkbox" checked={useSsl} onChange={(e) => setUseSsl(e.target.checked)} /> Použít SSL
            </label>
            <FormField id="smtp_test_recipient" label="Testovací příjemce">
              <input id="smtp_test_recipient" className="k-input" type="email" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} />
            </FormField>
            <div className="k-toolbar">
              <button className="k-button" type="button" onClick={() => void save()} disabled={saving}>Uložit SMTP</button>
              <button className="k-button secondary" type="button" onClick={() => void sendTestEmail()} disabled={saving}>Odeslat testovací e-mail</button>
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
        title="Přístup odepřen"
        description={`Role ${role} (uživatel ${userId}) nemá oprávnění pro modul ${moduleLabel}.`}
        stateKey="error"
        action={<Link className="k-button secondary" to="/">Zpět na přehled</Link>}
      />
    </main>
  );
}

type LoginErrorState = {
  title: string;
  description: string;
};

function AdminLoginPage(): JSX.Element {
  const bundle = React.useMemo(() => {
    const lang = typeof document !== 'undefined' ? document.documentElement.lang : undefined;
    return getAuthBundle('admin', lang);
  }, []);
  const { copy } = bundle;
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loginError, setLoginError] = React.useState<LoginErrorState | null>(null);
  const [hintStatus, setHintStatus] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoginError(null);
    setHintStatus(null);
    const principal = email.trim();
    if (!principal || !password.trim()) {
      setLoginError({
        title: copy.loginErrorTitle ?? 'Přihlášení se nezdařilo',
        description: copy.credentialsRequired ?? 'Vyplňte email i heslo.',
      });
      return;
    }
    try {
      await fetchJson('/api/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email: principal, password }),
      });
      window.location.assign('/admin/');
    } catch (error) {
      if (error instanceof HttpError && error.status === 423) {
        setLoginError({
          title: copy.loginErrorTitle ?? 'Přihlášení se nezdařilo',
          description: copy.accountLockedError ?? 'Účet je dočasně uzamčen. Použijte odkaz pro odblokování účtu.',
        });
        return;
      }
      setLoginError({
        title: copy.loginErrorTitle ?? 'Přihlášení se nezdařilo',
        description: copy.loginErrorHelp ?? copy.loginError ?? 'Zkontrolujte email a heslo, případně použijte odblokování účtu.',
      });
    }
  }

  async function sendPasswordHint(): Promise<void> {
    setHintStatus(null);
    await fetchJson('/api/auth/admin/hint', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    setHintStatus(copy.hintInfo ?? 'Pokud účet existuje, byl odeslán odkaz pro odblokování.');
  }

  return (
    <main className="k-page k-admin-login-page" data-testid="admin-login-page">
      <section className="k-admin-login-layout">
        <Card title="KájovoHotel Admin login">
          <img className="k-admin-login-logo" src={brandWordmark} alt="KájovoHotel" />
          <form className="k-form-grid" onSubmit={(event) => void submit(event)}>
            <FormField id="admin_login_email" label="Admin email">
              <input id="admin_login_email" className="k-input" value={email} onChange={(event) => setEmail(event.target.value)} />
            </FormField>
            <FormField id="admin_login_password" label="Admin heslo">
              <input id="admin_login_password" className="k-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </FormField>
            {loginError ? (
              <section
                className="k-admin-login-feedback"
                role="alertdialog"
                aria-live="assertive"
                aria-labelledby="admin-login-error-title"
                aria-describedby="admin-login-error-description"
              >
                <h2 id="admin-login-error-title" className="k-admin-login-feedback-title">{loginError.title}</h2>
                <p id="admin-login-error-description" className="k-admin-login-feedback-description">{loginError.description}</p>
              </section>
            ) : null}
            {hintStatus ? <p className="k-admin-login-hint" role="status">{hintStatus}</p> : null}
            <div className="k-toolbar">
              <button className="k-button" type="submit">Přihlásit</button>
              <button
                className="k-button secondary"
                type="button"
                onClick={() => void sendPasswordHint()}
                disabled={!email.trim()}
              >
                Zapomenuté heslo
              </button>
            </div>
          </form>
        </Card>
        <aside className="k-admin-login-figure" aria-label="Kája pro admin login" data-brand-element="true">
          <img src={adminLoginFigure} alt="Kája pro administraci" loading="lazy" />
        </aside>
      </section>
      <KajovoSign />
    </main>
  );
}

const ADMIN_ROLE_VIEW_OPTIONS: Role[] = ['admin', ...ADMIN_SWITCHABLE_ROLES];

type AdminRoleView = Role;

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
  const adminLocale = typeof document !== 'undefined' ? document.documentElement.lang : 'cs';
  const roleSwitcherLabels = React.useMemo(() => {
    const bundle = getAuthBundle('admin', adminLocale);
    const base: Record<Role, string> = {
      admin: bundle.roleLabels.admin ?? (adminLocale.startsWith('en') ? 'Administrator' : 'Administrátor'),
      recepce: bundle.roleLabels.recepce ?? 'Recepce',
      pokojská: bundle.roleLabels['pokojská'] ?? 'Pokojská',
      údržba: bundle.roleLabels['údržba'] ?? 'Údržba',
      snídaně: bundle.roleLabels['snídaně'] ?? 'Snídaně',
      sklad: bundle.roleLabels.sklad ?? 'Sklad',
    };
    return base;
  }, [adminLocale]);

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
      { key: 'users', label: 'Uživatelé', route: '/uzivatele', icon: 'users', active: true, section: 'records', permissions: ['read'] },
      { key: 'settings', label: 'Nastavení', route: '/nastaveni', icon: 'settings', active: true, section: 'records', permissions: ['read'] },
    ]
    : [];
  const modules = [...ia.modules, ...adminModules, ...injectedModules];

  const roleViewKeys: string[] | null = auth.role === 'admin' && roleView !== 'admin'
    ? (ROLE_MODULES[roleView] ?? [])
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
    <AuthContext.Provider value={auth}>
      <AppShell
        modules={adminNavModules}
        navigationRules={ia.navigation.rules}
        navigationSections={ia.navigation.sections}
        currentPath={adminCurrentPath}
        panelLayout={panelLayout}
      >
        {auth.role === 'admin' ? (
          <div className="k-toolbar" data-testid="admin-module-switcher">
            <span>Role pohledu:</span>
            {ADMIN_ROLE_VIEW_OPTIONS.map((role) => (
              <button
                key={role}
                className={roleView === role ? 'k-button' : 'k-button secondary'}
                type="button"
                onClick={() => setRoleView(role)}
              >
                {roleSwitcherLabels[role] ?? role}
              </button>
            ))}
          </div>
        ) : null}
        <Routes>
        <Route path="/" element={isAllowed('dashboard') ? <Dashboard /> : <AccessDeniedPage moduleLabel="Přehled" role={auth.role} userId={auth.userId} />} />
<Route path="/pokojska" element={isAllowed('housekeeping') ? <HousekeepingAdmin /> : <AccessDeniedPage moduleLabel="Pokojská" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane" element={isAllowed('breakfast') ? <BreakfastList /> : <AccessDeniedPage moduleLabel="Snídaně" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/nova" element={isAllowed('breakfast') ? <BreakfastForm mode="create" /> : <AccessDeniedPage moduleLabel="Snídaně" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/:id" element={isAllowed('breakfast') ? <BreakfastDetail /> : <AccessDeniedPage moduleLabel="Snídaně" role={auth.role} userId={auth.userId} />} />
        <Route path="/snidane/:id/edit" element={isAllowed('breakfast') ? <BreakfastForm mode="edit" /> : <AccessDeniedPage moduleLabel="Snídaně" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy" element={isAllowed('lost_found') ? <LostFoundList /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/novy" element={isAllowed('lost_found') ? <LostFoundForm mode="create" /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id" element={isAllowed('lost_found') ? <LostFoundDetail /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id/edit" element={isAllowed('lost_found') ? <LostFoundForm mode="edit" /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady" element={isAllowed('issues') ? <IssuesList /> : <AccessDeniedPage moduleLabel="Závady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/nova" element={isAllowed('issues') ? <IssuesForm mode="create" /> : <AccessDeniedPage moduleLabel="Závady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/:id" element={isAllowed('issues') ? <IssuesDetail /> : <AccessDeniedPage moduleLabel="Závady" role={auth.role} userId={auth.userId} />} />
        <Route path="/zavady/:id/edit" element={isAllowed('issues') ? <IssuesForm mode="edit" /> : <AccessDeniedPage moduleLabel="Závady" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad" element={isAllowed('inventory') ? <InventoryList /> : <AccessDeniedPage moduleLabel="Skladové hospodářství" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/nova" element={isAllowed('inventory') ? <InventoryForm mode="create" /> : <AccessDeniedPage moduleLabel="Skladové hospodářství" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/:id" element={isAllowed('inventory') ? <InventoryDetail /> : <AccessDeniedPage moduleLabel="Skladové hospodářství" role={auth.role} userId={auth.userId} />} />
        <Route path="/sklad/:id/edit" element={isAllowed('inventory') ? <InventoryForm mode="edit" /> : <AccessDeniedPage moduleLabel="Skladové hospodářství" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni" element={isAllowed('reports') ? <ReportsList /> : <AccessDeniedPage moduleLabel="Hlášení" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/nove" element={isAllowed('reports') ? <ReportsForm mode="create" /> : <AccessDeniedPage moduleLabel="Hlášení" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/:id" element={isAllowed('reports') ? <ReportsDetail /> : <AccessDeniedPage moduleLabel="Hlášení" role={auth.role} userId={auth.userId} />} />
        <Route path="/hlaseni/:id/edit" element={isAllowed('reports') ? <ReportsForm mode="edit" /> : <AccessDeniedPage moduleLabel="Hlášení" role={auth.role} userId={auth.userId} />} />
        <Route path="/uzivatele" element={isAllowed('users') ? <UsersAdmin /> : <AccessDeniedPage moduleLabel="Uživatelé" role={auth.role} userId={auth.userId} />} />
        <Route path="/nastaveni" element={isAllowed('settings') ? <SettingsAdmin /> : <AccessDeniedPage moduleLabel="Nastavení" role={auth.role} userId={auth.userId} />} />
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
    </AuthContext.Provider>
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













