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
import { toLocalDateInputValue } from './dateDefaults';
import {
  ADMIN_SWITCHABLE_ROLES,
  ROLE_MODULES,
  canReadModule,
  normalizeRole,
  rolePermissions,
  resolveAuthProfile,
  type AuthProfile,
  type ResolvedAuthState,
  type Role,
} from './rbac';
import { currentDateForTimeZone, currentDateTimeInputValue, isoUtcToLocalDateTimeInput, localDateTimeInputToIsoUtc } from './lib/date';

const brandWordmark = '/brand/apps/kajovo-hotel/logo/exports/wordmark/svg/kajovo-hotel_wordmark.svg';

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
  item_name?: string | null;
  unit?: string | null;
  card_id?: number | null;
  card_item_id?: number | null;
  card_number?: string | null;
  document_number?: string | null;
  document_reference?: string | null;
  document_date?: string | null;
  quantity_pieces?: number;
};

type InventoryCardType = 'in' | 'out' | 'adjust';

type InventoryCardItemReadModel = {
  id: number;
  card_id: number;
  ingredient_id: number;
  ingredient_name?: string | null;
  unit?: string | null;
  quantity_base: number;
  quantity_pieces: number;
  note?: string | null;
  created_at?: string | null;
};

type InventoryCardReadModel = {
  id: number;
  card_type: InventoryCardType;
  number: string;
  card_date: string;
  supplier?: string | null;
  reference?: string | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type InventoryCardDetail = InventoryCardReadModel & {
  items: InventoryCardItemReadModel[];
};

type InventoryCardLinePayload = {
  ingredient_id: number;
  quantity_base: number;
  quantity_pieces: number;
  note?: string | null;
};

type InventoryCardPayload = {
  card_type: InventoryCardType;
  card_date: string;
  supplier?: string | null;
  reference?: string | null;
  note?: string | null;
  items: InventoryCardLinePayload[];
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
const HOUSEKEEPING_ROOMS = [
  '101', '102', '103', '104', '105', '106', '107', '108', '109',
  '201', '202', '203', '204', '205', '206', '207', '208', '209', '210',
  '221', '222', '223', '224',
  '301', '302', '303', '304', '305', '306', '307', '308', '309', '310',
  '321', '322', '323', '324',
];

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

type ManagedPortalRole = PortalRole | 'admin';

const managedPortalRoleOptions: ManagedPortalRole[] = ['admin', ...portalRoleOptions];
const managedPortalRoleLabels: Record<ManagedPortalRole, string> = {
  admin: 'Administrator',
  ...portalRoleLabels,
};

function toAdminNavRoute(route: string): string {
  if (!route.startsWith('/')) {
    return route;
  }
  if (route === '/admin') {
    return '/';
  }
  if (route.startsWith('/admin/')) {
    return route.slice('/admin'.length);
  }
  return route;
}

const ADMIN_PERSISTENT_MODULE_KEYS = new Set(['users', 'settings', 'profile']);
const ADMIN_PERSISTENT_PERMISSION_PREFIXES = ['users:', 'settings:'];
const todayBreakfasts: number | null = null;
const tomorrowBreakfasts: number | null = null;
const openIssuesCount: number | null = null;
const newLostFoundCount: number | null = null;
const inventoryStockTotal: number | null = null;
const inventoryItemCount: number | null = null;

function metricValue(value: number | null): string {
  return value === null ? '—' : String(value);
}

function roleViewPermissionSet(roleView: Role, adminPermissions: Set<string>): Set<string> {
  if (roleView === 'admin') {
    return new Set(adminPermissions);
  }
  return rolePermissions(roleView);
}

function mergeAdminViewPermissions(roleViewPermissions: Set<string>, adminPermissions: Set<string>): Set<string> {
  const merged = new Set(roleViewPermissions);
  for (const permission of adminPermissions) {
    if (ADMIN_PERSISTENT_PERMISSION_PREFIXES.some((prefix) => permission.startsWith(prefix))) {
      merged.add(permission);
    }
  }
  return merged;
}

type PortalUser = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  roles: ManagedPortalRole[];
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
  roles: ManagedPortalRole[];
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

type SmtpSettingsSnapshot = {
  host: string;
  port: number;
  username: string;
  useTls: boolean;
  useSsl: boolean;
};

type SmtpTestDialogState = {
  phase: 'saving' | 'sending' | 'success' | 'error';
  title: string;
  description: string;
};

type SmtpOperationalStatusReadModel = {
  configured: boolean;
  smtp_enabled: boolean;
  delivery_mode: string;
  can_send_real_email: boolean;
  last_tested_at: string | null;
  last_test_success: boolean | null;
  last_test_recipient: string | null;
  last_test_error: string | null;
};

type AdminProfileReadModel = {
  email: string;
  display_name: string;
  password_changed_at: string | null;
  updated_at: string | null;
};

type AuthProfileReadModel = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  note: string | null;
  roles: string[];
  actor_type: string;
};

type AdminOverview = {
  breakfastSummary: BreakfastSummary;
  issues: Issue[];
  lowStockItems: InventoryItem[];
  reports: Report[];
  lostFoundItems: LostFoundItem[];
};

type InventoryBootstrapStatusReadModel = {
  enabled: boolean;
  environment: string;
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
const defaultServiceDate = currentDateForTimeZone();
const qaRuntimeEnabled = (import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD !== true;


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

const inventoryCardTypeLabels: Record<InventoryCardType, string> = {
  in: 'Příjemka',
  out: 'Výdejka',
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

function inventoryCardTypeLabel(cardType: InventoryCardType | null | undefined): string {
  return cardType ? inventoryCardTypeLabels[cardType] : '-';
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

function countOpenIssues(items: Issue[]): number {
  return items.filter((item) => item.status !== 'resolved' && item.status !== 'closed').length;
}

function countCriticalIssues(items: Issue[]): number {
  return items.filter((item) => item.priority === 'critical' && item.status !== 'closed').length;
}

function countActiveReports(items: Report[]): number {
  return items.filter((item) => item.status !== 'closed').length;
}

function countStoredLostFound(items: LostFoundItem[]): number {
  return items.filter((item) => item.status === 'stored' || item.status === 'new').length;
}

async function loadAdminOverview(serviceDate: string): Promise<AdminOverview> {
  const [breakfastSummary, issues, lowStockItems, reports, lostFoundItems] = await Promise.all([
    fetchJson<BreakfastSummary>(`/api/v1/breakfast/daily-summary?service_date=${serviceDate}`),
    fetchJson<Issue[]>('/api/v1/issues'),
    fetchJson<InventoryItem[]>('/api/v1/inventory?low_stock=true'),
    fetchJson<Report[]>('/api/v1/reports'),
    fetchJson<LostFoundItem[]>('/api/v1/lost-found'),
  ]);
  return {
    breakfastSummary,
    issues,
    lowStockItems,
    reports,
    lostFoundItems,
  };
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
  if (!qaRuntimeEnabled) {
    return 'default';
  }
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
          title="Pr?zdn? stav"
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
  if (!qaRuntimeEnabled) {
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
      } else if (parsed && Array.isArray(parsed.detail)) {
        const messages = parsed.detail
          .map((item) => (typeof item === 'object' && item && 'msg' in item && typeof item.msg === 'string' ? item.msg : null))
          .filter((item): item is string => item !== null);
        if (messages.length > 0) {
          message = messages.join(' ');
        }
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

  if (path === '/api/v1/inventory' && method === 'GET') {
    return (await apiClient.listItemsApiV1InventoryGet({ low_stock: url.searchParams.get('low_stock') === 'true' })) as T;
  }
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
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }

  if (path === '/api/v1/admin/settings/smtp' && method === 'GET') {
    const response = await fetch(path, { credentials: 'include' });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }
  if (path === '/api/v1/admin/settings/smtp/status' && method === 'GET') {
    const response = await fetch(path, { credentials: 'include' });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }
  if (path === '/api/v1/admin/settings/smtp' && method === 'PUT') {
    const csrf = readCsrfToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (csrf) {
      headers['x-csrf-token'] = csrf;
    }
    const response = await fetch(path, {
      method: 'PUT',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }
  if (path === '/api/v1/admin/settings/smtp/test-email' && method === 'POST') {
    const csrf = readCsrfToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (csrf) {
      headers['x-csrf-token'] = csrf;
    }
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }

  if (path === '/api/v1/admin/profile' && method === 'GET') {
    const response = await fetch(path, { credentials: 'include' });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }
  if (path === '/api/v1/admin/profile' && method === 'PUT') {
    const csrf = readCsrfToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (csrf) {
      headers['x-csrf-token'] = csrf;
    }
    const response = await fetch(path, {
      method: 'PUT',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }
  if (path === '/api/v1/admin/profile/password' && method === 'POST') {
    const csrf = readCsrfToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (csrf) {
      headers['x-csrf-token'] = csrf;
    }
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }

  const fallbackHeaders = normalizeHeaders(init?.headers);
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = readCsrfToken();
    if (csrf) {
      fallbackHeaders['x-csrf-token'] = csrf;
    }
  }
  const fallbackResponse = await fetch(path + url.search, {
    ...init,
    credentials: 'include',
    headers: fallbackHeaders,
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

function formatShortDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function hoursOpenSince(value: string | null): string {
  if (!value) {
    return '-';
  }
  const diffMs = Date.now() - new Date(value).getTime();
  return `${Math.max(0, Math.floor(diffMs / 3_600_000))} h`;
}

function inventoryThumbSrc(item: { id: number; pictogram_thumb_path?: string | null }): string | null {
  return item.pictogram_thumb_path ? `/api/v1/inventory/${item.id}/pictogram/thumb` : null;
}

async function uploadInventoryPictogram(itemId: number, file: File): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  await fetchJson<InventoryItem>(`/api/v1/inventory/${itemId}/pictogram`, {
    method: 'POST',
    body: formData,
  });
}

function InventoryThumb({
  item,
  alt,
  size = 'list',
}: {
  item: { id: number; name: string; pictogram_thumb_path?: string | null };
  alt?: string;
  size?: 'list' | 'detail' | 'form';
}): JSX.Element {
  const src = inventoryThumbSrc(item);
  return (
    <div className={`k-inventory-thumb k-inventory-thumb--${size}`} aria-hidden={src ? undefined : 'true'}>
      {src ? (
        <img src={src} alt={alt ?? `Miniatura položky ${item.name}`} />
      ) : (
        <span className="k-inventory-thumb-fallback">{item.name.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
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
      <path d="M12 6v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 8c-2.6 0-3.6 1.3-3.6 2.8 0 1.4 1 2.5 3.6 2.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M12 10.5c2.6 0 3.6 1.1 3.6 2.5 0 1.5-1 2.8-3.6 2.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M12 13.1c-2 0-2.8 0.9-2.8 2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M12 15.1c2 0 2.8 0.9 2.8 2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </DietIconBase>
  );
}

function DietIconMilk(): JSX.Element {
  return (
    <DietIconBase>
      <path d="M8 13.5c0-2 1.6-3.5 3.5-3.5h3.6c1.8 0 3.2 1.4 3.2 3.2v1.1c0 1.5-1.2 2.7-2.7 2.7H11c-1.7 0-3-1.3-3-3V13.5z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 11.3 7.8 9.6M16.6 10.8l1.2-1.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="11.8" cy="13.7" r="0.55" fill="currentColor" />
      <circle cx="14.6" cy="13.7" r="0.55" fill="currentColor" />
      <path d="M12 16.2c.8.5 1.6.5 2.4 0" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M10.1 16.4v1.8M16.1 16.4v1.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </DietIconBase>
  );
}

function DietIconPork(): JSX.Element {
  return (
    <DietIconBase>
      <ellipse cx="12" cy="13" rx="4.6" ry="3.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="12" cy="13.3" rx="1.9" ry="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11.2" cy="13.3" r="0.3" fill="currentColor" />
      <circle cx="12.8" cy="13.3" r="0.3" fill="currentColor" />
      <circle cx="10.3" cy="11.7" r="0.45" fill="currentColor" />
      <circle cx="13.7" cy="11.7" r="0.45" fill="currentColor" />
      <path d="M9 9.6 7.7 8.2l.7-1.3 1.8 1" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M15 9.6 16.3 8.2l-.7-1.3-1.8 1" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </DietIconBase>
  );
}

function breakfastActorRole(auth: AuthProfile | null | undefined): string {
  return auth?.activeRole ?? auth?.role ?? 'admin';
}

function isBreakfastManager(auth: AuthProfile | null | undefined): boolean {
  const actorRole = breakfastActorRole(auth);
  const roles = auth?.roles ?? [];
  return actorRole === 'admin' || actorRole === 'recepce' || roles.includes('recepce');
}

function isBreakfastOperator(auth: AuthProfile | null | undefined): boolean {
  const actorRole = breakfastActorRole(auth);
  const roles = auth?.roles ?? [];
  return actorRole === 'admin' || actorRole === 'snídaně' || roles.includes('snídaně');
}

function issueActorRole(auth: AuthProfile | null | undefined): string {
  return auth?.activeRole ?? auth?.role ?? 'admin';
}

function isIssueAdmin(auth: AuthProfile | null | undefined): boolean {
  return issueActorRole(auth) === 'admin';
}

function isIssueMaintenance(auth: AuthProfile | null | undefined): boolean {
  return issueActorRole(auth) === 'údržba';
}

function Dashboard(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Přehled', '/');
  const stateMarker = <StateMarker state={state} />;
  const [overview, setOverview] = React.useState<AdminOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    if (state !== 'default') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void loadAdminOverview(defaultServiceDate)
      .then((data) => {
        setOverview(data);
        setError(null);
      })
      .catch(() => setError('Nepodařilo se načíst přehled.'))
      .finally(() => setLoading(false));
  }, [state]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="k-page" data-testid="dashboard-page">
      {stateMarker}
      <h1>Přehled</h1>
      <StateSwitcher />
      {stateUI ?? (
        <>
          <div className="k-grid cards-4 k-dashboard-cards">
            <Card title="Snídaně dnes a zítra">
              <strong>{metricValue(todayBreakfasts)}</strong>
              <p>Zítra: {metricValue(tomorrowBreakfasts)}</p>
            </Card>
            <Card title="Neopravené závady">
              <strong>{metricValue(openIssuesCount)}</strong>
              <p>Aktuálně otevřené závady</p>
            </Card>
            <Card title="Nezpracované nálezy">
              <strong>{metricValue(newLostFoundCount)}</strong>
              <p>Položky čekající na zpracování</p>
            </Card>
            <Card title="Stav skladu">
              <strong>{metricValue(inventoryStockTotal)}</strong>
              <p>Položek v evidenci: {metricValue(inventoryItemCount)}</p>
            </Card>
          </div>
          <div className="k-grid cards-4 k-dashboard-cards" hidden>
        
          <Card title="Snídaně dnes">
            <strong>{metricValue(todayBreakfasts)}</strong>
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
        </>
      )}
    </main>
  );
}

function DashboardLive(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'PĹ™ehled', '/');
  const stateMarker = <StateMarker state={state} />;
  const [todayCount, setTodayCount] = React.useState<number | null>(null);
  const [tomorrowCount, setTomorrowCount] = React.useState<number | null>(null);
  const [unresolvedIssuesCount, setUnresolvedIssuesCount] = React.useState<number | null>(null);
  const [unprocessedLostFoundCount, setUnprocessedLostFoundCount] = React.useState<number | null>(null);
  const [stockTotal, setStockTotal] = React.useState<number | null>(null);
  const [stockItemCount, setStockItemCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (state !== 'default') {
      return;
    }

    const today = currentDateForTimeZone();
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = currentDateForTimeZone(tomorrowDate);

    let active = true;
    Promise.all([
      fetchJson<BreakfastSummary>(`/api/v1/breakfast/daily-summary?service_date=${today}`),
      fetchJson<BreakfastSummary>(`/api/v1/breakfast/daily-summary?service_date=${tomorrow}`),
      fetchJson<Issue[]>('/api/v1/issues'),
      fetchJson<LostFoundItem[]>('/api/v1/lost-found?status=new'),
      fetchJson<InventoryItem[]>('/api/v1/inventory'),
    ])
      .then(([todaySummary, tomorrowSummary, issues, lostFoundItems, inventoryItems]) => {
        if (!active) {
          return;
        }
        setTodayCount(todaySummary.total_guests);
        setTomorrowCount(tomorrowSummary.total_guests);
        setUnresolvedIssuesCount(issues.filter((item) => item.status !== 'resolved').length);
        setUnprocessedLostFoundCount(lostFoundItems.length);
        setStockTotal(inventoryItems.reduce((total, item) => total + item.current_stock, 0));
        setStockItemCount(inventoryItems.length);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setTodayCount(null);
        setTomorrowCount(null);
        setUnresolvedIssuesCount(null);
        setUnprocessedLostFoundCount(null);
        setStockTotal(null);
        setStockItemCount(null);
      });

    return () => {
      active = false;
    };
  }, [state]);

  return (
    <main className="k-page" data-testid="dashboard-page">
      {stateMarker}
      <h1>PĹ™ehled</h1>
      <StateSwitcher />
      {stateUI ?? (
        <div className="k-grid cards-4 k-dashboard-cards">
          <Card title="Snídaně dnes a zítra">
            <strong>{metricValue(todayCount)}</strong>
            <p>Zítra: {metricValue(tomorrowCount)}</p>
          </Card>
          <Card title="Neopravené závady">
            <strong>{metricValue(unresolvedIssuesCount)}</strong>
            <p>Aktuálně otevřené závady</p>
          </Card>
          <Card title="Nezpracované nálezy">
            <strong>{metricValue(unprocessedLostFoundCount)}</strong>
            <p>Položky čekající na zpracování</p>
          </Card>
          <Card title="Stav skladu">
            <strong>{metricValue(stockTotal)}</strong>
            <p>Položek v evidenci: {metricValue(stockItemCount)}</p>
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
  const actorRole = normalizeRole(auth?.activeRole ?? auth?.role ?? 'admin');
  const roles = (auth?.roles ?? []).map((role) => normalizeRole(role));
  const breakfastRole = normalizeRole('snidane');
  const isAdmin = actorRole === 'admin';
  const isRecepce = isAdmin || actorRole === 'recepce' || roles.includes('recepce');
  const isBreakfast = isAdmin || actorRole === breakfastRole || roles.includes(breakfastRole);
  const isServingView = actorRole === breakfastRole && !isRecepce && !isAdmin;
  const canImport = isRecepce || isAdmin;
  const canReactivate = isRecepce || isAdmin;
  const canEditDiet = isRecepce || isAdmin;
  const canServe = isBreakfast;
  const canClearDay = isRecepce || isAdmin;

  const [serviceDate, setServiceDate] = React.useState(() => toLocalDateInputValue());
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

  const loadDay = React.useCallback((targetDate: string) => {
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
  }, [state]);

  React.useEffect(() => {
    const cleanup = loadDay(serviceDate);
    return () => {
      if (cleanup) cleanup();
    };
  }, [loadDay, serviceDate]);

  const filteredItems = items.filter((item) => {
    const term = search.trim().toLowerCase();
    if (!term || isServingView) {
      return true;
    }
    return item.room_number.toLowerCase().includes(term) || (item.guest_name ?? '').toLowerCase().includes(term);
  });

  const updateOrder = async (order: BreakfastOrder, updates: Partial<BreakfastPayload>): Promise<void> => {
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
      headers: { 'Content-Type': 'application/json' },
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
    if (!canReactivate) {
      return;
    }
    const csrf = readCsrfToken();
    await fetchJson<void>(`/api/v1/breakfast/reactivate-all?service_date=${serviceDate}`, {
      method: 'POST',
      headers: csrf ? { 'x-csrf-token': csrf } : undefined,
    });
    loadDay(serviceDate);
  };

  const clearDay = async (): Promise<void> => {
    if (!canClearDay) {
      return;
    }
    const csrf = readCsrfToken();
    await fetchJson<void>(`/api/v1/breakfast/day/delete?service_date=${serviceDate}`, {
      method: 'DELETE',
      headers: csrf ? { 'x-csrf-token': csrf } : undefined,
    });
    setItems([]);
    setSummary({
      service_date: serviceDate,
      total_orders: 0,
      total_guests: 0,
      status_counts: { pending: 0, preparing: 0, served: 0, cancelled: 0 },
    });
  };

  const renderDietToggles = (
    data: { diet_no_gluten?: boolean; diet_no_milk?: boolean; diet_no_pork?: boolean },
    onToggle: (key: DietKey) => void,
    disabled: boolean,
  ): JSX.Element => (
    <div className="k-diet-toggle-group">
      <DietToggleButton active={Boolean(data.diet_no_gluten)} label="Bez lepku" disabled={disabled} onToggle={() => onToggle('diet_no_gluten')}>
        <DietIconGluten />
      </DietToggleButton>
      <DietToggleButton active={Boolean(data.diet_no_milk)} label="Bez mléka" disabled={disabled} onToggle={() => onToggle('diet_no_milk')}>
        <DietIconMilk />
      </DietToggleButton>
      <DietToggleButton active={Boolean(data.diet_no_pork)} label="Bez vepřového" disabled={disabled} onToggle={() => onToggle('diet_no_pork')}>
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
      data.append('overrides', JSON.stringify(importPreview.map((item) => ({
        room: String(item.room),
        diet_no_gluten: Boolean(item.diet_no_gluten),
        diet_no_milk: Boolean(item.diet_no_milk),
        diet_no_pork: Boolean(item.diet_no_pork),
      }))));
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
          renderDietToggles(item, (key) => setImportPreview((prev) => {
            if (!prev) return prev;
            return prev.map((row, rowIndex) => {
              if (rowIndex !== index) return row;
              if (key === 'diet_no_gluten') return { ...row, diet_no_gluten: !row.diet_no_gluten };
              if (key === 'diet_no_milk') return { ...row, diet_no_milk: !row.diet_no_milk };
              return { ...row, diet_no_pork: !row.diet_no_pork };
            });
          }), false),
        ])}
      />
      <div className="k-toolbar">
        <button className="k-button" type="button" onClick={() => void saveImport()} disabled={importBusy}>Potvrdit import</button>
        <button className="k-button secondary" type="button" onClick={() => setImportPreview(null)}>Zavřít náhled</button>
      </div>
    </div>
  ) : null;

  const breakfastToolbar = isServingView ? (
    <div className="k-toolbar">
      <input className="k-input" type="date" value={serviceDate} aria-label="Datum" onChange={(event) => setServiceDate(event.target.value)} />
    </div>
  ) : (
    <div className="k-toolbar">
      <input className="k-input" type="date" value={serviceDate} aria-label="Datum" onChange={(event) => setServiceDate(event.target.value)} />
      <input className="k-input" placeholder="Hledat dle pokoje nebo hosta" aria-label="Hledat" value={search} onChange={(event) => setSearch(event.target.value)} />
      {canImport ? <input className="k-input" type="file" accept="application/pdf" aria-label="Import PDF" onChange={(event) => handleImportFile(event.target.files?.[0] ?? null)} /> : null}
      {canImport ? <button className="k-button secondary" type="button" onClick={downloadBreakfastPdf} disabled={!serviceDate}>Export snídaní (PDF)</button> : null}
      {canReactivate ? <button className="k-button secondary" type="button" onClick={() => void reactivateAll()}>Vrátit celý den</button> : null}
      {canClearDay ? <button className="k-button secondary" type="button" onClick={() => void clearDay()}>Smazat den</button> : null}
    </div>
  );

  const listItems = isServingView ? items : filteredItems;

  return (
    <main className="k-page" data-testid="breakfast-list-page">
      {stateMarker}
      <h1>Snídaně</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : (
        <>
          <div className="k-grid cards-3">
            <Card title="Objednávky dne"><strong>{summary?.total_orders ?? 0}</strong></Card>
            <Card title="Hosté dne"><strong>{summary?.total_guests ?? 0}</strong></Card>
            <Card title="Čekající"><strong>{getSummaryCount(summary, 'pending')}</strong></Card>
          </div>
          {breakfastToolbar}
          {canImport && (importError || importInfo) ? <p className={importError ? 'k-text-error' : 'k-text-success'}>{importError ?? importInfo}</p> : null}
          {importPreviewTable}
          {listItems.length === 0 ? (
            <StateView title="Prázdný stav" description={isServingView ? 'Na vybraný den nejsou naplánované žádné snídaně.' : 'Nebyly nalezeny žádné objednávky.'} stateKey="empty" />
          ) : (
            <DataTable
              headers={isServingView ? ['Pokoj', 'Osoby', 'Jméno', 'Diety', 'Akce'] : ['Datum', 'Pokoj', 'Host', 'Počet', 'Diety', 'Stav', 'Akce']}
              rows={listItems.map((item) => {
                const rowClass = item.status === 'served' ? 'k-row-muted' : '';
                const action = item.status === 'served'
                  ? canReactivate
                    ? <button className="k-button secondary" type="button" onClick={() => reactivate(item)}>Vrátit</button>
                    : <span className="k-text-muted">Vydáno</span>
                  : canServe
                    ? <button className="k-button" type="button" onClick={() => markServed(item)}>Vydáno</button>
                    : <span className="k-text-muted">-</span>;

                if (isServingView) {
                  return [
                    <span className={rowClass}>{item.room_number}</span>,
                    <span className={rowClass}>{item.guest_count}</span>,
                    <span className={rowClass}>{item.guest_name ?? `Pokoj ${item.room_number}`}</span>,
                    <span className={rowClass}>{renderDietToggles(item, (key) => toggleDiet(item, key), true)}</span>,
                    action,
                  ];
                }

                return [
                  <span className={rowClass}>{item.service_date}</span>,
                  <span className={rowClass}>{item.room_number}</span>,
                  <span className={rowClass}>{item.guest_name ?? '-'}</span>,
                  <span className={rowClass}>{item.guest_count}</span>,
                  <span className={rowClass}>{renderDietToggles(item, (key) => toggleDiet(item, key), !canEditDiet)}</span>,
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
  const stateUI = stateViewForRoute(state, 'Sn?dan?', '/snidane');
  const stateMarker = <StateMarker state={state} />;
  const auth = useAuth();
  const canManage = isBreakfastManager(auth);
  const navigate = useNavigate();
  const { id } = useParams();
  const [payload, setPayload] = React.useState<BreakfastPayload>({
    service_date: toLocalDateInputValue(),
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
      ) : !canManage ? (
        <StateView
          title="Přístup odepřen"
          description="Snídaně může vytvářet a upravovat jen recepce nebo admin."
          stateKey="error"
          action={<Link className="k-button secondary" to="/snidane">Zpět na seznam</Link>}
        />
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
                <option value="served">Vyd?no</option>
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
  const stateUI = stateViewForRoute(state, 'Sn?dan?', '/snidane');
  const stateMarker = <StateMarker state={state} />;
  const auth = useAuth();
  const canManage = isBreakfastManager(auth);
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
            {canManage ? (
              <Link className="k-button" to={`/snidane/${item.id}/edit`}>
                Upravit
              </Link>
            ) : null}
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
  const [mode, setMode] = React.useState<'issue' | 'lost_found'>('issue');
  const [selectedRoom, setSelectedRoom] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [photos, setPhotos] = React.useState<File[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const resetForm = React.useCallback(() => {
    setSelectedRoom('');
    setDescription('');
    setPhotos([]);
    setError(null);
    setSuccess(null);
  }, []);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 3) {
      setError('Lze připojit nejvýše 3 fotografie.');
      setPhotos(files.slice(0, 3));
      return;
    }
    setPhotos(files);
  };

  const submit = async (): Promise<void> => {
    if (state !== 'default') return;
    const shortDescription = description.trim();
    const roomValue = selectedRoom.trim();
    if (!roomValue) {
      setError('Vyberte pokoj.');
      return;
    }
    if (!shortDescription) {
      setError('Vyplňte krátký popis.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (mode === 'issue') {
        const created = await fetchJson<Issue>('/api/v1/issues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: shortDescription,
            description: shortDescription,
            location: `Pokoj ${roomValue}`,
            room_number: roomValue,
            status: 'new',
            priority: 'medium',
          }),
        });
        if (photos.length > 0) {
          const formData = new FormData();
          photos.forEach((file) => formData.append('photos', file));
          await fetchJson<MediaPhoto[]>(`/api/v1/issues/${created.id}/photos`, { method: 'POST', body: formData });
        }
      } else {
        const created = await fetchJson<LostFoundItem>('/api/v1/lost-found', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_type: 'found',
            category: 'Nález',
            description: shortDescription,
            location: `Pokoj ${roomValue}`,
            room_number: roomValue,
            event_at: new Date().toISOString(),
            status: 'new',
            tags: [],
          }),
        });
        if (photos.length > 0) {
          const formData = new FormData();
          photos.forEach((file) => formData.append('photos', file));
          await fetchJson<MediaPhoto[]>(`/api/v1/lost-found/${created.id}/photos`, { method: 'POST', body: formData });
        }
      }
      setSuccess(mode === 'issue' ? 'Závada byla odeslána.' : 'Nález byl odeslán.');
      resetForm();
    } catch {
      setError('Uložení záznamu selhalo.');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <main className="k-page" data-testid="housekeeping-admin-page">
        {stateMarker}
        <h1>Pokojská</h1>
        <StateSwitcher />
        {stateUI ?? <StateView title="Hotovo" description={success} stateKey="info" action={<button className="k-button" type="button" onClick={resetForm}>Nový záznam</button>} />}
      </main>
    );
  }

  return (
    <main className="k-page" data-testid="housekeeping-admin-page">
      {stateMarker}
      <h1>Pokojská</h1>
      <StateSwitcher />
      {stateUI ?? (
        <div className="k-card k-card--compact">
          <div className="k-toolbar" role="group" aria-label="Typ zápisu pokojské">
            <button className={mode === 'issue' ? 'k-button' : 'k-button secondary'} type="button" onClick={() => setMode('issue')} aria-pressed={mode === 'issue'}>Závada</button>
            <button className={mode === 'lost_found' ? 'k-button' : 'k-button secondary'} type="button" onClick={() => setMode('lost_found')} aria-pressed={mode === 'lost_found'}>Nález</button>
          </div>
          {error ? <p className="k-text-error">{error}</p> : null}
          <div className="k-form-grid">
            <FormField id="housekeeping_room" label="Pokoj">
              <select id="housekeeping_room" className="k-select" value={selectedRoom} onChange={(event) => setSelectedRoom(event.target.value)}>
                <option value="">Vyberte pokoj</option>
                {HOUSEKEEPING_ROOMS.map((room) => <option key={room} value={room}>{room}</option>)}
              </select>
            </FormField>
            <FormField id="housekeeping_description" label={mode === 'issue' ? 'Krátký popis závady' : 'Krátký popis nálezu'}>
              <input id="housekeeping_description" className="k-input" maxLength={160} value={description} onChange={(event) => setDescription(event.target.value)} />
            </FormField>
            <FormField id="housekeeping_photos" label="Fotografie (max. 3)">
              <input id="housekeeping_photos" type="file" className="k-input" multiple accept="image/*" capture="environment" onChange={onFileChange} />
            </FormField>
            {photos.length > 0 ? <p className="k-subtle">Vybráno fotografií: {photos.length}</p> : null}
          </div>
          <div className="k-toolbar">
            <button className="k-button" type="button" onClick={() => void submit()} disabled={saving}>Odeslat</button>
            <button className="k-button secondary" type="button" onClick={resetForm} disabled={saving}>Vyčistit</button>
          </div>
        </div>
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
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default') {
      return;
    }
    const params = new URLSearchParams();
    if (statusFilter !== 'all') {
      params.set('status', statusFilter);
    }
    const query = params.toString();
    const url = query ? `/api/v1/lost-found?${query}` : '/api/v1/lost-found';
    fetchJson<LostFoundItem[]>(url)
      .then((response) => {
        setItems(response);
        setError(null);
      })
      .catch(() => setError('Nepodařilo se načíst nálezy.'));
  }, [state, statusFilter]);

  return (
    <main className="k-page" data-testid="lost-found-list-page">
      {stateMarker}
      <h1>Ztráty a nálezy</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? <StateView title="Pr?zdn? stav" description="Žádný evidovaný nález." stateKey="empty" /> : (
        <>
          <div className="k-toolbar">
            <select className="k-select" aria-label="Filtr stavu" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | LostFoundStatus)}>
              <option value="all">Všechny stavy</option>
              <option value="new">Nezpracováno</option>
              <option value="claimed">Zpracováno</option>
            </select>
          </div>
          <DataTable headers={['Stav', 'Pokoj', 'Popis', 'Vznik', 'Akce']} rows={items.map((item) => [lostFoundStatusLabel(item.status), item.room_number ?? '-', item.description, formatShortDateTime(item.event_at), <Link className="k-nav-link" key={item.id} to={`/ztraty-a-nalezy/${item.id}`}>Detail</Link>])} />
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
    event_at: localDateTimeInputToIsoUtc(currentDateTimeInputValue()),
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
                value={isoUtcToLocalDateTimeInput(payload.event_at)}
                onChange={(event) =>
                  setPayload((prev) => ({ ...prev, event_at: localDateTimeInputToIsoUtc(event.target.value) }))
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

  const setWorkflowStatus = async (status: LostFoundStatus): Promise<void> => {
    if (!id) return;
    try {
      const updated = await fetchJson<LostFoundItem>(`/api/v1/lost-found/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setItem(updated);
    } catch {
      setError('Změna stavu nálezu selhala.');
    }
  };

  const deleteItem = async (): Promise<void> => {
    if (!id) return;
    try {
      await fetchJson(`/api/v1/lost-found/${id}`, { method: 'DELETE' });
      window.location.assign('/admin/ztraty-a-nalezy');
    } catch {
      setError('Smazání položky selhalo.');
    }
  };

  return (
    <main className="k-page" data-testid="lost-found-detail-page">
      {stateMarker}
      <h1>Detail nálezu</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="404" description={error} /> : item ? (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/ztraty-a-nalezy">Zpět na seznam</Link>
            {item.status !== 'claimed' ? <button className="k-button" type="button" onClick={() => void setWorkflowStatus('claimed')}>Označit jako zpracováno</button> : null}
            {item.status !== 'new' ? <button className="k-button" type="button" onClick={() => void setWorkflowStatus('new')}>Vrátit do nezpracovaných</button> : null}
            <button className="k-button secondary" type="button" onClick={() => void deleteItem()}>Smazat</button>
          </div>
          <DataTable headers={['Položka', 'Hodnota']} rows={[[ 'Pokoj', item.room_number ?? '-'],[ 'Místo', item.location],[ 'Popis', item.description],[ 'Vznik', formatDateTime(item.event_at)],[ 'Stav', lostFoundStatusLabel(item.status)] ]} />
          {photos.length > 0 ? <div className="k-grid cards-3">{photos.map((photo) => <img key={photo.id} src={`/api/v1/lost-found/${item.id}/photos/${photo.id}/thumb`} alt={`Fotografie nálezu ${photo.id}`} className="k-photo-thumb" />)}</div> : null}
        </div>
      ) : <SkeletonPage />}
    </main>
  );
}


function IssuesList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Závady', '/zavady');
  const stateMarker = <StateMarker state={state} />;
  const auth = useAuth();
  const isMaintenance = isIssueMaintenance(auth);
  const isAdmin = isIssueAdmin(auth);
  const canCreateIssue = isAdmin;
  const canMarkDone = isMaintenance || isAdmin;
  const [items, setItems] = React.useState<Issue[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<'all' | IssueStatus>('all');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default') return;
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    const query = params.toString();
    fetchJson<Issue[]>(query ? `/api/v1/issues?${query}` : '/api/v1/issues')
      .then((response) => { setItems(response); setError(null); })
      .catch(() => setError('Nepodařilo se načíst seznam závad.'));
  }, [state, statusFilter]);

  const markDone = async (issueId: number): Promise<void> => {
    try {
      const updated = await fetchJson<Issue>(`/api/v1/issues/${issueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      setItems((prev) => prev.map((item) => (item.id === issueId ? updated : item)));
      setError(null);
    } catch {
      setError('Označení závady jako hotové selhalo.');
    }
  };

  return (
    <main className="k-page" data-testid="issues-list-page">
      {stateMarker}
      <h1>Závady</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? <StateView title="Pr?zdn? stav" description="Žádná evidovaná závada." stateKey="empty" /> : (
        <>
          <div className="k-toolbar">
            <select className="k-select" aria-label="Filtr stavu" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | IssueStatus)}>
              <option value="all">Všechny stavy</option>
              <option value="new">Otevřené</option>
              <option value="resolved">Odstraněné</option>
            </select>
          </div>
          <DataTable headers={['Stav', 'Pokoj', 'Popis', 'Vznik', 'Otevřeno', 'Akce']} rows={items.map((item) => [issueStatusLabel(item.status), item.room_number ?? '-', item.description ?? item.title, formatShortDateTime(item.created_at), hoursOpenSince(item.created_at), <Link className="k-nav-link" key={item.id} to={`/zavady/${item.id}`}>Detail</Link>])} />
        </>
      )}
    </main>
  );
}

function IssuesForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Závady', '/zavady');
  const stateMarker = <StateMarker state={state} />;
  const auth = useAuth();
  const canManage = isIssueAdmin(auth);
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

  return <main className="k-page" data-testid={mode === 'create' ? 'issues-create-page' : 'issues-edit-page'}>{stateMarker}<h1>{mode === 'create' ? 'Nová závada' : 'Upravit závadu'}</h1><StateSwitcher />{stateUI ? stateUI : !canManage ? <StateView title="Přístup odepřen" description="Závadu může upravovat nebo znovu zakládat jen admin." stateKey="error" action={<Link className="k-button secondary" to="/zavady">Zpět na seznam</Link>} /> : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">Zpět na seznam</Link><button className="k-button" type="button" onClick={() => void save()}>Uložit</button></div><div className="k-form-grid">
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
  const auth = useAuth();
  const canDelete = isIssueAdmin(auth);
  const canEdit = isIssueAdmin(auth);
  const canReopen = isIssueAdmin(auth);
  const canMarkDone = isIssueAdmin(auth) || isIssueMaintenance(auth);

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

  const updateStatusLegacy = async (status: IssueStatus): Promise<void> => {
    if (!id) return;
    try {
      const updated = await fetchJson<Issue>(`/api/v1/issues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setItem(updated);
    } catch {
      setError('Změna stavu závady selhala.');
    }
  };

  const deleteIssue = async (): Promise<void> => {
    if (!id) return;
    try {
      await fetchJson(`/api/v1/issues/${id}`, { method: 'DELETE' });
      window.location.assign('/admin/zavady');
    } catch {
      setError('Smazání závady selhalo.');
    }
  };

  const updateStatus = async (nextStatus: IssueStatus): Promise<void> => {
    if (!id) return;
    try {
      const updated = await fetchJson<Issue>(`/api/v1/issues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      setItem(updated);
      setError(null);
    } catch {
      setError(nextStatus === 'new' ? 'Znovuotevření závady selhalo.' : 'Označení závady jako hotové selhalo.');
    }
  };

  return (
    <main className="k-page" data-testid="issues-detail-page">
      {stateMarker}
      <h1>Detail závady</h1><StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/zavady">Zpět na seznam</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">Zpět na seznam</Link>{item.status !== 'resolved' ? <button className="k-button" type="button" onClick={() => void updateStatus('resolved')}>Označit jako odstraněnou</button> : null}{item.status === 'resolved' ? <button className="k-button" type="button" onClick={() => void updateStatus('new')}>Znovu otevřít</button> : null}<button className="k-button secondary" type="button" onClick={() => void deleteIssue()}>Smazat</button></div><DataTable headers={['Položka', 'Hodnota']} rows={[[ 'Pokoj', item.room_number ?? '-'],[ 'Místo', item.location],[ 'Popis', item.description ?? item.title],[ 'Stav', issueStatusLabel(item.status)],[ 'Vznik', formatDateTime(item.created_at)],[ 'Otevřeno', hoursOpenSince(item.created_at)] ]} />{photos.length > 0 ? <div className="k-grid cards-3">{photos.map((photo) => <img key={photo.id} src={`/api/v1/issues/${item.id}/photos/${photo.id}/thumb`} alt={`Fotografie závady ${photo.id}`} className="k-photo-thumb" />)}</div> : null}</div> : <SkeletonPage />}
    </main>
  );
}


function InventoryList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Skladov? hospod??stv?', '/sklad');
  const stateMarker = <StateMarker state={state} />;
  const auth = useAuth();
  const actorRole = normalizeRole(auth?.activeRole ?? auth?.role ?? 'admin');
  const isAdmin = actorRole === 'admin';
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [movementItemId, setMovementItemId] = React.useState<string>('');
  const [movementType, setMovementType] = React.useState<InventoryMovementType>('out');
  const [movementQuantity, setMovementQuantity] = React.useState<number>(1);
  const [movementDate, setMovementDate] = React.useState<string>(currentDateForTimeZone());
  const [movementReference, setMovementReference] = React.useState<string>('');
  const [movementNote, setMovementNote] = React.useState<string>('');
  const [movementInfo, setMovementInfo] = React.useState<string | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = React.useState<InventoryBootstrapStatusReadModel | null>(null);

  const loadItems = React.useCallback(() => {
    fetchJson<InventoryItem[]>('/api/v1/inventory')
      .then((response) => {
        setItems(response);
        setError(null);
      })
      .catch(() => setError('Polo?ky skladu se nepoda?ilo na??st.'));
  }, []);

  const loadBootstrapStatus = React.useCallback(() => {
    void fetchJson<InventoryBootstrapStatusReadModel>('/api/v1/inventory/bootstrap-status')
      .then((response) => setBootstrapStatus(response))
      .catch(() => setBootstrapStatus({ enabled: false, environment: 'unknown' }));
  }, []);

  React.useEffect(() => {
    if (state !== 'default') return;
    loadItems();
    loadBootstrapStatus();
  }, [loadBootstrapStatus, loadItems, state]);

  React.useEffect(() => {
    if (!movementItemId && items.length > 0) {
      setMovementItemId(String(items[0].id));
    }
  }, [items, movementItemId]);

  const downloadStocktakePdf = (): void => {
    window.open('/api/v1/inventory/stocktake/pdf', '_blank', 'noopener');
  };

  const submitMovement = async (): Promise<void> => {
    if (!movementItemId) {
      setError('Vyberte polo?ku skladu.');
      return;
    }
    if (movementQuantity <= 0) {
      setError('Mno?stv? mus? b?t v?t?? ne? nula.');
      return;
    }
    try {
      const response = await fetchJson<InventoryDetail>(`/api/v1/inventory/${movementItemId}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movement_type: movementType,
          quantity: movementQuantity,
          document_date: movementDate,
          document_reference: movementReference || null,
          note: movementNote || null,
        }),
      });
      const latestMovement = [...response.movements].sort((left, right) => right.id - left.id)[0];
      setMovementInfo(latestMovement?.document_number
        ? `Pohyb ulo?en. Intern? ??slo ${latestMovement.document_number}.`
        : 'Pohyb ulo?en.');
      setMovementQuantity(1);
      setMovementReference('');
      setMovementNote('');
      loadItems();
      setError(null);
    } catch {
      setError('Pohyb skladu se nepoda?ilo ulo?it.');
    }
  };

  const movementCard = items.length > 0 ? (
    <div className="k-card">
      <h2>Nov? pohyb skladu</h2>
      <div className="k-form-grid">
        <FormField id="inventory_movement_type" label="Druh pohybu">
          <select id="inventory_movement_type" className="k-select" value={movementType} onChange={(event) => setMovementType(event.target.value as InventoryMovementType)}>
            <option value="in">P??jem</option>
            <option value="out">V?dej</option>
            <option value="adjust">Odpis</option>
          </select>
        </FormField>
        <FormField id="inventory_movement_item" label="Polo?ka">
          <select id="inventory_movement_item" className="k-select" value={movementItemId} onChange={(event) => setMovementItemId(event.target.value)}>
            {items.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </FormField>
        <FormField id="inventory_movement_quantity" label="Mno?stv?">
          <input id="inventory_movement_quantity" type="number" min={1} className="k-input" value={movementQuantity} onChange={(event) => setMovementQuantity(Number(event.target.value))} />
        </FormField>
        <FormField id="inventory_movement_date" label="Datum dokladu">
          <input id="inventory_movement_date" type="date" className="k-input" value={movementDate} onChange={(event) => setMovementDate(event.target.value)} />
        </FormField>
        <FormField id="inventory_movement_reference" label="??slo dokladu (voliteln?)">
          <input id="inventory_movement_reference" className="k-input" value={movementReference} onChange={(event) => setMovementReference(event.target.value)} />
        </FormField>
        <FormField id="inventory_movement_note" label="Pozn?mka (voliteln?)">
          <input id="inventory_movement_note" className="k-input" value={movementNote} onChange={(event) => setMovementNote(event.target.value)} />
        </FormField>
      </div>
      <div className="k-toolbar">
        <button className="k-button" type="button" onClick={() => void submitMovement()}>Potvrdit pohyb</button>
      </div>
      {movementInfo ? <p className="k-text-success">{movementInfo}</p> : null}
    </div>
  ) : null;

  return (
    <main className="k-page" data-testid="inventory-list-page">
      {stateMarker}
      <h1>Skladov? hospod??stv?</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : items.length === 0 ? (
        <StateView
          title="Pr?zdn? stav"
          description="Ve skladu zat?m nejsou polo?ky."
          stateKey="empty"
          action={isAdmin ? <Link className="k-button" to="/sklad/nova">Nov? polo?ka</Link> : undefined}
        />
      ) : (
        <>
          <div className="k-toolbar">
            {isAdmin ? <button className="k-button secondary" type="button" onClick={downloadStocktakePdf}>Inventurn? protokol (PDF)</button> : null}
            {isAdmin ? <Link className="k-button" to="/sklad/nova">Nov? polo?ka</Link> : null}
          </div>
          {movementCard}
          <DataTable
            headers={isAdmin ? ['Polo?ka', 'Skladem', 'Minimum', 'Jednotka', 'Status', 'Akce'] : ['Polo?ka', 'Jednotka', 'Akce']}
            rows={items.map((item) => {
              const itemLabel = (
                <div key={`inventory-cell-${item.id}`} className="k-inventory-item-cell">
                  <InventoryThumb item={item} />
                  <strong>{item.name}</strong>
                </div>
              );
              if (!isAdmin) {
                return [
                  itemLabel,
                  item.unit,
                  <span key={`inventory-action-${item.id}`} className="k-subtle">Pohyb vytvo??te naho?e.</span>,
                ];
              }
              return [
                itemLabel,
                item.current_stock,
                item.min_stock,
                item.unit,
                item.current_stock <= item.min_stock
                  ? <Badge key={`low-${item.id}`} tone="danger">Pod minimem</Badge>
                  : <Badge key={`ok-${item.id}`} tone="success">OK</Badge>,
                <Link className="k-nav-link" key={item.id} to={`/sklad/${item.id}`}>Detail</Link>,
              ];
            })}
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
    amount_per_piece_base: 1,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [pictogramFile, setPictogramFile] = React.useState<File | null>(null);
  const [pictogramPreview, setPictogramPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (mode !== 'edit' || state !== 'default' || !id) return;
    fetchJson<InventoryDetail>(`/api/v1/inventory/${id}`)
      .then((item) =>
        setPayload({
          name: item.name,
          unit: item.unit,
          min_stock: item.min_stock,
          current_stock: item.current_stock,
          amount_per_piece_base: item.amount_per_piece_base,
          pictogram_path: item.pictogram_path,
          pictogram_thumb_path: item.pictogram_thumb_path,
        })
      )
      .catch(() => setError('Položku se nepodařilo načíst.'));
  }, [id, mode, state]);

  React.useEffect(() => {
    if (!pictogramFile) {
      setPictogramPreview(null);
      return;
    }
    const nextPreview = URL.createObjectURL(pictogramFile);
    setPictogramPreview(nextPreview);
    return () => URL.revokeObjectURL(nextPreview);
  }, [pictogramFile]);

  const normalizedPayload: InventoryItemPayload = {
    ...payload,
    name: payload.name.trim(),
    unit: payload.unit.trim().toLowerCase(),
  };

  const validationError =
    normalizedPayload.name.length === 0
      ? 'Název položky je povinný.'
      : !Number.isInteger(normalizedPayload.amount_per_piece_base) || (normalizedPayload.amount_per_piece_base ?? 0) < 1
        ? 'Hodnota veličiny v 1 ks musí být alespoň 1.'
        : !Number.isInteger(normalizedPayload.min_stock) || normalizedPayload.min_stock < 0
          ? 'Minimální stav musí být nula nebo vyšší.'
          : !Number.isInteger(normalizedPayload.current_stock) || normalizedPayload.current_stock < 0
            ? 'Počáteční stav musí být nula nebo vyšší.'
            : null;

  const save = async (): Promise<void> => {
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      const saved = await fetchJson<InventoryItem>(mode === 'create' ? '/api/v1/inventory' : `/api/v1/inventory/${id}`, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedPayload),
      });
      if (pictogramFile) {
        await uploadInventoryPictogram(saved.id, pictogramFile);
      }
      navigate(`/sklad/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Položku se nepodařilo uložit.');
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'inventory-create-page' : 'inventory-edit-page'}>
      {stateMarker}
      <h1>{mode === 'create' ? 'Nová skladová položka' : 'Upravit skladovou položku'}</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/sklad">Zpět na seznam</Link>
            <button className="k-button" type="button" onClick={() => void save()}>Uložit</button>
          </div>
          <div className="k-inventory-form-media">
            {pictogramPreview ? (
              <img className="k-inventory-thumb-preview" src={pictogramPreview} alt={payload.name ? `Náhled položky ${payload.name}` : 'Náhled položky'} />
            ) : (
              <InventoryThumb item={{ id: Number(id ?? 0), name: payload.name || 'Položka', pictogram_thumb_path: payload.pictogram_thumb_path }} size="form" />
            )}
          </div>
          <div className="k-form-grid">
            <FormField id="inventory_name" label="Název">
              <input id="inventory_name" className="k-input" value={payload.name} onChange={(event) => setPayload((prev) => ({ ...prev, name: event.target.value }))} />
            </FormField>
            <FormField id="inventory_unit" label="Veličina v 1 ks">
              <select id="inventory_unit" className="k-select" value={payload.unit} onChange={(event) => setPayload((prev) => ({ ...prev, unit: event.target.value }))}>
                <option value="g">g</option>
                <option value="l">l</option>
                <option value="ks">ks</option>
              </select>
            </FormField>
            <FormField id="inventory_amount_per_piece_base" label="Hodnota veličiny v 1 ks">
              <input id="inventory_amount_per_piece_base" type="number" min={1} step={1} className="k-input" value={payload.amount_per_piece_base ?? 1} onChange={(event) => setPayload((prev) => ({ ...prev, amount_per_piece_base: Number(event.target.value) }))} />
            </FormField>
            <FormField id="inventory_min_stock" label="Minimální stav">
              <input id="inventory_min_stock" type="number" min={0} step={1} className="k-input" value={payload.min_stock} onChange={(event) => setPayload((prev) => ({ ...prev, min_stock: Number(event.target.value) }))} />
            </FormField>
            <FormField id="inventory_pictogram" label="Miniatura položky">
              <input id="inventory_pictogram" type="file" className="k-input" accept="image/*" onChange={(event) => setPictogramFile(event.target.files?.[0] ?? null)} />
            </FormField>
          </div>
        </div>
      )}
    </main>
  );
}

function InventoryDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Skladov? hospod??stv?', '/sklad');
  const stateMarker = <StateMarker state={state} />;
  const { id } = useParams();
  const [item, setItem] = React.useState<InventoryDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadDetail = React.useCallback(() => {
    if (!id) return;
    fetchJson<InventoryDetail>(`/api/v1/inventory/${id}`)
      .then((response) => {
        setItem(response);
        setError(null);
      })
      .catch(() => setError('Polo?ka nebyla nalezena.'));
  }, [id]);

  React.useEffect(() => {
    if (state !== 'default') return;
    loadDetail();
  }, [loadDetail, state]);

  const deleteMovement = async (movementId: number): Promise<void> => {
    if (!id) return;
    const csrf = readCsrfToken();
    try {
      await fetchJson<void>(`/api/v1/inventory/${id}/movements/${movementId}`, {
        method: 'DELETE',
        headers: csrf ? { 'x-csrf-token': csrf } : undefined,
      });
      loadDetail();
    } catch {
      setError('Pohyb se nepoda?ilo smazat.');
    }
  };

  return (
    <main className="k-page" data-testid="inventory-detail-page">
      {stateMarker}
      <h1>Detail skladov? polo?ky</h1>
      <StateSwitcher />
      {stateUI ? (
        stateUI
      ) : error ? (
        <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/sklad">Zp?t na seznam</Link>} />
      ) : item ? (
        <>
          <div className="k-card">
            <div className="k-toolbar">
              <Link className="k-nav-link" to="/sklad">Zp?t na seznam</Link>
              <Link className="k-button" to={`/sklad/${item.id}/edit`}>Upravit</Link>
            </div>
            <div className="k-inventory-detail-hero">
              <InventoryThumb item={item} size="detail" />
              <div>
                <h2>{item.name}</h2>
                <p className="k-subtle">Aktu?ln? mno?stv? a historie pohyb? z?st?vaj? dostupn? jen adminovi.</p>
              </div>
            </div>
            <DataTable
              headers={['Polo?ka', 'Skladem', 'Minimum', 'Veli?ina v 1 ks', 'Hodnota veli?iny v 1 ks']}
              rows={[[item.name, item.current_stock, item.min_stock, item.unit, item.amount_per_piece_base ?? 0]]}
            />
          </div>
          <div className="k-card">
            <h2>Pohyby</h2>
            <DataTable
              headers={['Intern? ??slo', 'Datum', 'Druh', 'Mno?stv?', '??slo dokladu', 'Pozn?mka', 'Akce']}
              rows={item.movements.map((movement) => [
                movement.document_number ?? '-',
                formatDateTime(movement.document_date ?? movement.created_at),
                inventoryMovementLabel(movement.movement_type),
                movement.quantity,
                movement.document_reference ?? '-',
                movement.note ?? '-',
                <button className="k-button secondary" type="button" key={`delete-movement-${movement.id}`} onClick={() => void deleteMovement(movement.id)}>Smazat</button>,
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

function InventoryWorkbench(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Skladové hospodářství', '/sklad');
  const stateMarker = <StateMarker state={state} />;
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [cards, setCards] = React.useState<InventoryCardReadModel[]>([]);
  const [movements, setMovements] = React.useState<InventoryMovement[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [seedInfo, setSeedInfo] = React.useState<string | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = React.useState<InventoryBootstrapStatusReadModel | null>(null);
  const [cardInfo, setCardInfo] = React.useState<string | null>(null);
  const [cardPayload, setCardPayload] = React.useState<InventoryCardPayload>({
    card_type: 'in',
    card_date: new Date().toISOString().slice(0, 10),
    supplier: '',
    reference: '',
    note: '',
    items: [{ ingredient_id: 0, quantity_base: 0, quantity_pieces: 0, note: '' }],
  });

  const loadItems = React.useCallback(() => {
    fetchJson<InventoryItem[]>('/api/v1/inventory')
      .then((response) => {
        setItems(response);
        setError(null);
      })
      .catch(() => setError('Položky skladu se nepodařilo načíst.'));
  }, []);

  const loadCards = React.useCallback(() => {
    fetchJson<InventoryCardReadModel[]>('/api/v1/inventory/cards')
      .then((response) => setCards(response))
      .catch(() => setError('Skladové karty se nepodařilo načíst.'));
  }, []);

  const loadMovements = React.useCallback(() => {
    fetchJson<InventoryMovement[]>('/api/v1/inventory/movements')
      .then((response) => setMovements(response))
      .catch(() => setError('Pohyby skladu se nepodařilo načíst.'));
  }, []);

  const loadBootstrapStatus = React.useCallback(() => {
    void fetchJson<InventoryBootstrapStatusReadModel>('/api/v1/inventory/bootstrap-status')
      .then((response) => setBootstrapStatus(response))
      .catch(() => setBootstrapStatus({ enabled: false, environment: 'unknown' }));
  }, []);

  React.useEffect(() => {
    if (state !== 'default') {
      return;
    }
    loadItems();
    loadCards();
    loadMovements();
    loadBootstrapStatus();
  }, [loadBootstrapStatus, loadCards, loadItems, loadMovements, state]);

  React.useEffect(() => {
    if (items.length === 0) {
      return;
    }
    setCardPayload((prev) => ({
      ...prev,
      items: prev.items.map((item, index) => (
        item.ingredient_id > 0
          ? item
          : { ...item, ingredient_id: items[Math.min(index, items.length - 1)]?.id ?? items[0].id }
      )),
    }));
  }, [items]);

  const reloadAll = React.useCallback(() => {
    loadItems();
    loadCards();
    loadMovements();
  }, [loadCards, loadItems, loadMovements]);

  const seedDefaults = async (): Promise<void> => {
    try {
      const seeded = await fetchJson<InventoryItem[]>('/api/v1/inventory/seed-defaults', {
        method: 'POST',
      });
      setSeedInfo(`Doplněno ${seeded.length} výchozích položek.`);
      reloadAll();
    } catch {
      setSeedInfo('Bootstrap výchozích položek je vypnutý nebo se nepodařilo dokončit.');
    }
  };

  const saveCard = async (): Promise<void> => {
    setCardInfo(null);
    try {
      await fetchJson<InventoryCardDetail>('/api/v1/inventory/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cardPayload,
          supplier: cardPayload.supplier || null,
          reference: cardPayload.reference || null,
          note: cardPayload.note || null,
          items: cardPayload.items.map((item) => ({
            ingredient_id: item.ingredient_id,
            quantity_base: item.quantity_base,
            quantity_pieces: item.quantity_pieces,
            note: item.note || null,
          })),
        }),
      });
      setCardInfo('Skladová karta byla uložena.');
      setCardPayload({
        card_type: 'in',
        card_date: new Date().toISOString().slice(0, 10),
        supplier: '',
        reference: '',
        note: '',
        items: [{ ingredient_id: items[0]?.id ?? 0, quantity_base: 0, quantity_pieces: 0, note: '' }],
      });
      reloadAll();
    } catch {
      setCardInfo('Skladovou kartu se nepodařilo uložit.');
    }
  };

  const updateCardLine = (index: number, patch: Partial<InventoryCardLinePayload>): void => {
    setCardPayload((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const addCardLine = (): void => {
    setCardPayload((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { ingredient_id: items[0]?.id ?? 0, quantity_base: 0, quantity_pieces: 0, note: '' },
      ],
    }));
  };

  const removeCardLine = (index: number): void => {
    setCardPayload((prev) => ({
      ...prev,
      items: prev.items.length === 1 ? prev.items : prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const downloadStocktakePdf = (): void => {
    window.open('/api/v1/inventory/stocktake/pdf', '_blank', 'noopener');
  };

  const bootstrapAction = bootstrapStatus?.enabled ? (
    <button className="k-button secondary" type="button" onClick={() => void seedDefaults()}>
      Doplnit výchozí položky
    </button>
  ) : null;

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
          action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>}
        />
      ) : items.length === 0 ? (
        <>
          <div className="k-toolbar">
            {bootstrapAction}
            <button className="k-button secondary" type="button" onClick={downloadStocktakePdf}>
              Inventurní protokol (PDF)
            </button>
            <Link className="k-button" to="/sklad/nova">Nová položka</Link>
          </div>
          {bootstrapStatus && !bootstrapStatus.enabled ? (
            <p>Bootstrap katalogu je vypnutý pro prostředí {bootstrapStatus.environment}.</p>
          ) : null}
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
            {bootstrapAction}
            <button className="k-button secondary" type="button" onClick={downloadStocktakePdf}>
              Inventurní protokol (PDF)
            </button>
            <Link className="k-button" to="/sklad/nova">Nová položka</Link>
          </div>
          {bootstrapStatus && !bootstrapStatus.enabled ? (
            <p>Bootstrap katalogu je vypnutý pro prostředí {bootstrapStatus.environment}.</p>
          ) : null}
          {seedInfo ? <p>{seedInfo}</p> : null}
          <div className="k-card">
            <h2>Ingredience</h2>
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
                '-',
                item.current_stock <= item.min_stock
                  ? <Badge key={`low-${item.id}`} tone="danger">Pod minimem</Badge>
                  : <Badge key={`ok-${item.id}`} tone="success">OK</Badge>,
                <Link className="k-nav-link" key={item.id} to={`/sklad/${item.id}`}>Detail</Link>,
              ])}
            />
          </div>
          <div className="k-card">
            <div className="k-toolbar">
              <h2>Nová skladová karta</h2>
              <button className="k-button" type="button" onClick={() => void saveCard()}>
                Uložit kartu
              </button>
            </div>
            <div className="k-form-grid">
              <FormField id="inventory_card_type" label="Typ dokladu">
                <select
                  id="inventory_card_type"
                  className="k-select"
                  value={cardPayload.card_type}
                  onChange={(event) => setCardPayload((prev) => ({ ...prev, card_type: event.target.value as InventoryCardType }))}
                >
                  <option value="in">Příjemka</option>
                  <option value="out">Výdejka</option>
                  <option value="adjust">Odpis</option>
                </select>
              </FormField>
              <FormField id="inventory_card_date" label="Datum dokladu">
                <input
                  id="inventory_card_date"
                  type="date"
                  className="k-input"
                  value={cardPayload.card_date}
                  onChange={(event) => setCardPayload((prev) => ({ ...prev, card_date: event.target.value }))}
                />
              </FormField>
              <FormField id="inventory_card_supplier" label="Dodavatel">
                <input
                  id="inventory_card_supplier"
                  className="k-input"
                  value={cardPayload.supplier ?? ''}
                  onChange={(event) => setCardPayload((prev) => ({ ...prev, supplier: event.target.value }))}
                />
              </FormField>
              <FormField id="inventory_card_reference" label="Reference">
                <input
                  id="inventory_card_reference"
                  className="k-input"
                  value={cardPayload.reference ?? ''}
                  onChange={(event) => setCardPayload((prev) => ({ ...prev, reference: event.target.value }))}
                />
              </FormField>
              <FormField id="inventory_card_note" label="Poznámka">
                <input
                  id="inventory_card_note"
                  className="k-input"
                  value={cardPayload.note ?? ''}
                  onChange={(event) => setCardPayload((prev) => ({ ...prev, note: event.target.value }))}
                />
              </FormField>
            </div>
            {cardPayload.items.map((line, index) => (
              <div className="k-form-grid" key={`card-line-${index}`}>
                <FormField id={`inventory_card_ingredient_${index}`} label={`Ingredience ${index + 1}`}>
                  <select
                    id={`inventory_card_ingredient_${index}`}
                    className="k-select"
                    value={line.ingredient_id}
                    onChange={(event) => updateCardLine(index, { ingredient_id: Number(event.target.value) })}
                  >
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </FormField>
                <FormField id={`inventory_card_quantity_base_${index}`} label="Množství ve skladové jednotce">
                  <input
                    id={`inventory_card_quantity_base_${index}`}
                    type="number"
                    className="k-input"
                    value={line.quantity_base}
                    onChange={(event) => updateCardLine(index, { quantity_base: Number(event.target.value) })}
                  />
                </FormField>
                <FormField id={`inventory_card_quantity_pieces_${index}`} label="Počet kusů">
                  <input
                    id={`inventory_card_quantity_pieces_${index}`}
                    type="number"
                    className="k-input"
                    value={line.quantity_pieces}
                    onChange={(event) => updateCardLine(index, { quantity_pieces: Number(event.target.value) })}
                  />
                </FormField>
                <FormField id={`inventory_card_note_${index}`} label="Poznámka řádku">
                  <input
                    id={`inventory_card_note_${index}`}
                    className="k-input"
                    value={line.note ?? ''}
                    onChange={(event) => updateCardLine(index, { note: event.target.value })}
                  />
                </FormField>
                <div className="k-align-end">
                  <button className="k-button secondary" type="button" onClick={() => removeCardLine(index)}>
                    Odebrat řádek
                  </button>
                </div>
              </div>
            ))}
            <div className="k-toolbar">
              <button className="k-button secondary" type="button" onClick={addCardLine}>
                Přidat řádek
              </button>
            </div>
            {cardInfo ? <p>{cardInfo}</p> : null}
          </div>
          <div className="k-card">
            <h2>Skladové karty</h2>
            <DataTable
              headers={['Doklad', 'Datum', 'Typ', 'Dodavatel', 'Reference', 'Poznámka']}
              rows={cards.map((card) => [
                card.number,
                formatDateTime(card.card_date),
                inventoryCardTypeLabel(card.card_type),
                card.supplier ?? '-',
                card.reference ?? '-',
                card.note ?? '-',
              ])}
            />
          </div>
          <div className="k-card">
            <h2>Pohyby</h2>
            <DataTable
              headers={['Doklad', 'Datum', 'Typ', 'Položka', 'Množství', 'Ks', 'Poznámka']}
              rows={movements.map((movement) => [
                movement.card_number ?? movement.document_number ?? '-',
                formatDateTime(movement.document_date ?? movement.created_at),
                inventoryMovementLabel(movement.movement_type),
                movement.item_name ?? '-',
                `${movement.quantity} ${movement.unit ?? ''}`.trim(),
                movement.quantity_pieces ?? 0,
                movement.note ?? '-',
              ])}
            />
          </div>
        </>
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

  return <main className="k-page" data-testid="reports-list-page">{stateMarker}<h1>Hlášení</h1><StateSwitcher />{stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? <StateView title="Pr?zdn? stav" description="Zatím není evidováno žádné hlášení." stateKey="empty" action={<Link className="k-button" to="/hlaseni/nove">Nové hlášení</Link>} /> : <><div className="k-toolbar"><Link className="k-button" to="/hlaseni/nove">Nové hlášení</Link></div><DataTable headers={['Název', 'Stav', 'Vytvořeno', 'Akce']} rows={items.map((item) => [item.title, <Badge key={`status-${item.id}`} tone={item.status === 'closed' ? 'success' : item.status === 'in_progress' ? 'warning' : 'neutral'}>{reportStatusLabel(item.status)}</Badge>, formatDateTime(item.created_at), <Link className="k-nav-link" key={item.id} to={`/hlaseni/${item.id}`}>Detail</Link>])} /></>}</main>;
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
  const [createRoles, setCreateRoles] = React.useState<ManagedPortalRole[]>([]);
  const [createPhone, setCreatePhone] = React.useState('');
  const [createNote, setCreateNote] = React.useState('');

  const [pendingDelete, setPendingDelete] = React.useState<PortalUser | null>(null);
  const deleteTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const confirmDeleteRef = React.useRef<HTMLButtonElement | null>(null);

  const [editFirstName, setEditFirstName] = React.useState('');
  const [editLastName, setEditLastName] = React.useState('');
  const [editEmail, setEditEmail] = React.useState('');
  const [editRoles, setEditRoles] = React.useState<ManagedPortalRole[]>([]);
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

  const roleToggle = (
    selectedRoles: ManagedPortalRole[],
    setter: (value: ManagedPortalRole[]) => void,
    role: ManagedPortalRole
  ): void => {
    setter(selectedRoles.includes(role) ? selectedRoles.filter((item) => item !== role) : [...selectedRoles, role]);
  };

  const roleLabel = (role: string): string => managedPortalRoleLabels[role as ManagedPortalRole] ?? role;

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
              <StateView title="Pr?zdn? stav" description="Zatím neexistují žádní uživatelé portálu." stateKey="empty" />
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
                    {managedPortalRoleOptions.map((role) => (
                      <label key={`edit-role-${role}`} className="k-role-label">
                        <input type="checkbox" checked={editRoles.includes(role)} onChange={() => roleToggle(editRoles, setEditRoles, role)} /> {managedPortalRoleLabels[role]}
                      </label>
                    ))}
                  </fieldset>
                  <small>Role administratora je spravovana stejne jako ostatni role uzivatele.</small>
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
                    {managedPortalRoleOptions.map((role) => (
                    <label key={`create-role-${role}`} className="k-role-label">
                      <input type="checkbox" checked={createRoles.includes(role)} onChange={() => roleToggle(createRoles, setCreateRoles, role)} /> {managedPortalRoleLabels[role]}
                    </label>
                  ))}
                </fieldset>
                <small>Role administratora je spravovana stejne jako ostatni role uzivatele.</small>
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
  const [loadedConfig, setLoadedConfig] = React.useState<SmtpSettingsSnapshot | null>(null);
  const [status, setStatus] = React.useState<SmtpOperationalStatusReadModel | null>(null);
  const [testDialog, setTestDialog] = React.useState<SmtpTestDialogState | null>(null);

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
        setLoadedConfig({
          host: data.host,
          port: data.port,
          username: data.username,
          useTls: data.use_tls,
          useSsl: data.use_ssl,
        });
      })
      .catch((err: Error) => {
        if (err.message.includes('SMTP settings not configured')) {
          setLoadedConfig(null);
          return;
        }
        setError('Nepodařilo se načíst SMTP nastavení.');
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const hasUnsavedSmtpChanges = React.useMemo(() => {
    if (password.trim()) {
      return true;
    }
    if (!loadedConfig) {
      return Boolean(host.trim() || username.trim() || port || useTls || useSsl);
    }
    return (
      host.trim() !== loadedConfig.host
      || Number(port) !== loadedConfig.port
      || username.trim() !== loadedConfig.username
      || useTls !== loadedConfig.useTls
      || useSsl !== loadedConfig.useSsl
    );
  }, [host, loadedConfig, password, port, useSsl, useTls, username]);

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
      setLoadedConfig({
        host: host.trim(),
        port: Number(port),
        username: username.trim(),
        useTls,
        useSsl,
      });
      setMessage('SMTP nastavení bylo uloženo.');
      setPassword('');
      load();
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
    if (hasUnsavedSmtpChanges && (!host.trim() || !username.trim() || !password.trim())) {
      setError('Před testem doplňte host, uživatele a heslo, aby bylo možné uložit aktuální SMTP konfiguraci.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    setTestDialog({
      phase: hasUnsavedSmtpChanges ? 'saving' : 'sending',
      title: hasUnsavedSmtpChanges ? 'Ukládám SMTP konfiguraci' : 'Odesílám testovací e-mail',
      description: hasUnsavedSmtpChanges
        ? 'Nejdřív uložíme aktuálně zadané SMTP údaje, aby test běžel nad správnou konfigurací.'
        : `Probíhá odeslání testovací zprávy na ${recipient}.`,
    });
    try {
      if (hasUnsavedSmtpChanges) {
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
        setLoadedConfig({
          host: host.trim(),
          port: Number(port),
          username: username.trim(),
          useTls,
          useSsl,
        });
        setPassword('');
      }
      setTestDialog({
        phase: 'sending',
        title: 'Odesílám testovací e-mail',
        description: `Probíhá odeslání testovací zprávy na ${recipient}.`,
      });
      await fetchJson<{ ok: boolean }>('/api/v1/admin/settings/smtp/test-email', {
        method: 'POST',
        body: JSON.stringify({ recipient }),
      });
      load();
      setMessage('Testovací e-mail byl odeslán.');
      setTestDialog({
        phase: 'success',
        title: 'Test SMTP proběhl úspěšně',
        description: `Testovací e-mail byl odeslán na ${recipient}.`,
      });
    } catch (err) {
      const description = err instanceof Error && err.message.trim()
        ? err.message.trim()
        : 'Testovací e-mail se nepodařilo odeslat.';
      setError('Testovací e-mail se nepodařilo odeslat.');
      setTestDialog({
        phase: 'error',
        title: 'Test SMTP selhal',
        description,
      });
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
        <>
        <Card title="Provozni stav">
          <DataTable
            headers={['Polozka', 'Stav']}
            rows={[
              ['Konfigurace ulozena', status?.configured ? 'Ano' : 'Ne'],
              ['ENV odesilani povoleno', status?.smtp_enabled ? 'Ano' : 'Ne'],
              ['Rezim doruceni', status?.delivery_mode === 'smtp' ? 'Realne SMTP' : status?.delivery_mode === 'mock' ? 'Mock / no-op' : 'Nenakonfigurovano'],
              ['Realne odeslani mozne', status?.can_send_real_email ? 'Ano' : 'Ne'],
              ['Posledni test', status?.last_tested_at ? formatDateTime(status.last_tested_at) : 'Jeste nebehl'],
              ['Posledni prijemce', status?.last_test_recipient ?? '-'],
              ['Posledni vysledek', status?.last_test_success == null ? 'Bez zaznamu' : status.last_test_success ? 'Uspech' : 'Selhani'],
              ['Posledni chyba', status?.last_test_error ?? '-'],
            ]}
          />
        </Card>
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
        </>
      )}
      {testDialog ? (
        <div className="k-modal-backdrop" role="presentation">
          <div
            className="k-modal-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="smtp-test-dialog-title"
            aria-describedby="smtp-test-dialog-description"
          >
            <h2 id="smtp-test-dialog-title">{testDialog.title}</h2>
            <p id="smtp-test-dialog-description">{testDialog.description}</p>
            {testDialog.phase === 'saving' || testDialog.phase === 'sending' ? (
              <div className="k-modal-progress" aria-live="polite">
                <span className="k-modal-spinner" aria-hidden="true" />
                <span>Probíhá testování…</span>
              </div>
            ) : (
              <div className="k-toolbar">
                <button className="k-button" type="button" onClick={() => setTestDialog(null)}>Zavřít</button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function AuthSelfServiceProfilePage(): JSX.Element {
  const [profile, setProfile] = React.useState<AdminProfileReadModel | null>(null);
  const [displayName, setDisplayName] = React.useState('');
  const [oldPassword, setOldPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    setMessage(null);
    void fetchJson<AdminProfileReadModel>('/api/v1/admin/profile')
      .then((data) => {
        setProfile(data);
        setDisplayName(data.display_name);
      })
      .catch(() => setError('Profil administrátora se nepodařilo načíst.'))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function saveProfile(): Promise<void> {
    if (!displayName.trim()) {
      setError('Jméno profilu je povinné.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await fetchJson<AdminProfileReadModel>('/api/v1/admin/profile', {
        method: 'PUT',
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      setProfile(updated);
      setMessage('Profil byl uložen.');
    } catch {
      setError('Profil se nepodařilo uložit.');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(): Promise<void> {
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('Vyplňte aktuální i nové heslo.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Nové heslo a potvrzení se musí shodovat.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Nové heslo musí mít alespoň 8 znaků.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await fetchJson<{ ok: boolean }>('/api/v1/admin/profile/password', {
        method: 'POST',
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      await fetchJson<{ ok: boolean }>('/api/auth/admin/logout', { method: 'POST' });
      window.location.assign('/admin/login');
    } catch {
      setError('Změna hesla se nepodařila. Zkontrolujte aktuální heslo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="k-page" data-testid="admin-profile-page">
      <h1>Profil administrátora</h1>
      {error ? (
        <StateView
          title="Chyba"
          description={error}
          stateKey="error"
          action={<button className="k-button secondary" type="button" onClick={load}>Zkusit znovu</button>}
        />
      ) : null}
      {message ? <StateView title="Info" description={message} stateKey="info" /> : null}
      {loading || !profile ? (
        <SkeletonPage />
      ) : (
        <div className="k-grid cards-2">
          <Card title="Identita">
            <div className="k-form-grid">
              <FormField id="admin_profile_email" label="Admin email">
                <input id="admin_profile_email" className="k-input" value={profile.email} disabled />
              </FormField>
              <FormField id="admin_profile_display_name" label="Jméno profilu">
                <input
                  id="admin_profile_display_name"
                  className="k-input"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </FormField>
              <div className="k-toolbar">
                <button className="k-button" type="button" onClick={() => void saveProfile()} disabled={saving}>
                  Uložit profil
                </button>
              </div>
            </div>
          </Card>
          <Card title="Změna hesla">
            <div className="k-form-grid">
              <FormField id="admin_profile_old_password" label="Aktuální heslo">
                <input
                  id="admin_profile_old_password"
                  className="k-input"
                  type="password"
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                />
              </FormField>
              <FormField id="admin_profile_new_password" label="Nové heslo">
                <input
                  id="admin_profile_new_password"
                  className="k-input"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </FormField>
              <FormField id="admin_profile_confirm_password" label="Potvrzení nového hesla">
                <input
                  id="admin_profile_confirm_password"
                  className="k-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </FormField>
              <div className="k-toolbar">
                <button className="k-button" type="button" onClick={() => void changePassword()} disabled={saving}>
                  Změnit heslo
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}

type AccessDeniedProps = {
  moduleLabel: string;
  role: string;
  userId: string;
};

type AuthLoadState = { status: 'loading' } | ResolvedAuthState;

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

function AuthStatusPage({
  description,
  loginPath,
  onRetry,
}: {
  description: string;
  loginPath: string;
  onRetry: () => void;
}): JSX.Element {
  return (
    <main className="k-page" data-testid="auth-status-page">
      <StateView
        title="Overeni prihlaseni selhalo"
        description={description}
        stateKey="error"
        action={(
          <div className="k-toolbar">
            <button className="k-button" type="button" onClick={onRetry}>Zkusit znovu</button>
            <Link className="k-button secondary" to={loginPath}>Prejit na prihlaseni</Link>
          </div>
        )}
      />
    </main>
  );
}

function AdminProfilePage(): JSX.Element {
  const [profile, setProfile] = React.useState<AuthProfileReadModel | null>(null);
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [note, setNote] = React.useState('');
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchJson<AuthProfileReadModel>('/api/auth/profile')
      .then((data) => {
        setProfile(data);
        setFirstName(data.first_name);
        setLastName(data.last_name);
        setPhone(data.phone ?? '');
        setNote(data.note ?? '');
      })
      .catch(() => setError('Profil se nepodarilo nacist.'))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function saveProfile(): Promise<void> {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await fetchJson<AuthProfileReadModel>('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          note: note.trim() || null,
        }),
      });
      setProfile(updated);
      setMessage('Profil byl ulozen.');
    } catch {
      setError('Profil se nepodarilo ulozit.');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(): Promise<void> {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await fetchJson('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_password: currentPassword,
          new_password: newPassword,
        }),
      });
      window.location.assign('/admin/login');
    } catch {
      setError('Zmena hesla se nepodarila.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="k-page" data-testid="admin-profile-page">
      <h1>Profil administratora</h1>
      {error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button secondary" type="button" onClick={load}>Zkusit znovu</button>} /> : null}
      {message ? <StateView title="Info" description={message} stateKey="info" /> : null}
      {loading || profile === null ? <SkeletonPage /> : (
        <div className="k-grid cards-2">
          <Card title="Profil">
            <div className="k-form-grid">
              <FormField id="admin_profile_email" label="Email">
                <input id="admin_profile_email" className="k-input" value={profile.email} readOnly />
              </FormField>
              <FormField id="admin_profile_first_name" label="Jmeno">
                <input id="admin_profile_first_name" className="k-input" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </FormField>
              <FormField id="admin_profile_last_name" label="Prijmeni">
                <input id="admin_profile_last_name" className="k-input" value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </FormField>
              <FormField id="admin_profile_phone" label="Telefon">
                <input id="admin_profile_phone" className="k-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+420123456789" />
              </FormField>
              <FormField id="admin_profile_note" label="Poznamka">
                <textarea id="admin_profile_note" className="k-input" value={note} onChange={(event) => setNote(event.target.value)} />
              </FormField>
              <button className="k-button" type="button" onClick={() => void saveProfile()} disabled={saving}>Ulozit profil</button>
            </div>
          </Card>
          <Card title="Zmena hesla">
            <div className="k-form-grid">
              <FormField id="admin_profile_current_password" label="Aktualni heslo">
                <input id="admin_profile_current_password" className="k-input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </FormField>
              <FormField id="admin_profile_new_password" label="Nove heslo">
                <input id="admin_profile_new_password" className="k-input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </FormField>
              <button className="k-button" type="button" onClick={() => void changePassword()} disabled={saving || currentPassword.length < 8 || newPassword.length < 8}>Zmenit heslo</button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}

type LoginErrorState = {
  title: string;
  description: string;
};

function AdminLoginPage({ authError = null }: { authError?: string | null }): JSX.Element {
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
        headers: {
          'Content-Type': 'application/json',
        },
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
          <img className="k-admin-login-logo" src={brandWordmark} alt="KájovoHotel" data-brand-element="true" />
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
      </section>

    </main>
  );
}

const ADMIN_ROLE_VIEW_OPTIONS: Role[] = ['admin', ...ADMIN_SWITCHABLE_ROLES];

type AdminRoleView = Role;

function AppRoutes(): JSX.Element {
  const location = useLocation();
  const [authState, setAuthState] = React.useState<AuthLoadState>({ status: 'loading' });
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
    const base = {} as Record<Role, string>;
    for (const role of ADMIN_ROLE_VIEW_OPTIONS) {
      base[role] = bundle.roleLabels[role] ?? role;
    }
    base.admin = bundle.roleLabels.admin ?? (adminLocale.startsWith('en') ? 'Administrator' : 'Administrátor');
    return base;
  }, [adminLocale]);

  const refreshAuth = React.useCallback(() => {
    void resolveAuthProfile().then(setAuthState);
  }, []);

  React.useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const auth = authState.status === 'authenticated' ? authState.profile : null;

  React.useEffect(() => {
    if (auth?.role === 'admin' && typeof window !== 'undefined') {
      window.sessionStorage.setItem('kajovo_admin_role_view', roleView);
    }
  }, [auth?.role, roleView]);

  if (authState.status === 'loading') {
    return <SkeletonPage />;
  }

  if (location.pathname === '/login') {
    if (auth?.actorType === 'admin') {
      return <Navigate to="/" replace />;
    }
    return <AdminLoginPage authError={authState.status === 'error' ? authState.message : null} />;
  }

  if (authState.status === 'error') {
    return <AuthStatusPage description={authState.message} loginPath="/login" onRetry={refreshAuth} />;
  }

  if (!auth || auth.actorType !== 'admin') {
    return <Navigate to="/login" replace />;
  }

  const testNav = qaRuntimeEnabled && typeof window !== 'undefined'
    ? (window as Window & { __KAJOVO_TEST_NAV__?: unknown }).__KAJOVO_TEST_NAV__
    : undefined;
  const injectedModules = Array.isArray((testNav as { modules?: unknown } | undefined)?.modules)
    ? ((testNav as { modules: typeof ia.modules }).modules ?? [])
    : [];
  const adminModules = auth.role === 'admin'
    ? [
      { key: 'users', label: 'Uživatelé', route: '/uzivatele', icon: 'users', active: true, section: 'records', permissions: ['read'] },
      { key: 'settings', label: 'Nastavení', route: '/nastaveni', icon: 'settings', active: true, section: 'records', permissions: ['read'] },
      { key: 'profile', label: 'Profil', route: '/profil', icon: 'users', active: true, section: 'records', permissions: [] },
    ]
    : [];
  const modules = [...ia.modules, ...adminModules, ...injectedModules];
  const effectiveRoleView = auth.role === 'admin' ? roleView : auth.activeRole ?? auth.role;
  const roleViewKeys: string[] = ROLE_MODULES[effectiveRoleView] ?? [];
  const moduleByKey = new Map(modules.map((module) => [module.key, module]));
  const roleScopedModules = roleViewKeys
    .map((key) => moduleByKey.get(key))
    .filter((module): module is typeof modules[number] => Boolean(module));
  const roleScopedPermissions = roleViewPermissionSet(effectiveRoleView, auth.permissions);
  const effectiveAuth: AuthProfile = {
    ...auth,
    activeRole: effectiveRoleView === 'admin' ? auth.activeRole : effectiveRoleView,
    permissions: mergeAdminViewPermissions(roleScopedPermissions, auth.permissions),
  };

  const isVisibleModule = (module: typeof modules[number]): boolean => {
    if (module.route.includes('?state=')) {
      return false;
    }
    const required = Array.isArray(module.permissions) && module.permissions.length > 0 ? module.permissions : null;
    if (!required) {
      return true;
    }
    const permissionSource = ADMIN_PERSISTENT_MODULE_KEYS.has(module.key) ? auth.permissions : roleScopedPermissions;
    return required.every((permission) => permissionSource.has(`${module.key}:${permission}`));
  };

  const allowedRoleModules = roleScopedModules.filter(isVisibleModule);
  const persistentAdminModules = adminModules.filter((module) => {
    if (module.key === 'profile') {
      return true;
    }
    return isVisibleModule(module);
  });
  const auxiliaryModules = modules.filter((module) => {
    if (ADMIN_PERSISTENT_MODULE_KEYS.has(module.key)) {
      return false;
    }
    if (roleViewKeys.includes(module.key)) {
      return false;
    }
    const hasPermissions = Array.isArray(module.permissions) && module.permissions.length > 0;
    return !hasPermissions;
  });
  const adminNavModules = [...allowedRoleModules, ...persistentAdminModules, ...auxiliaryModules].map((module) => ({
    ...module,
    route: toAdminNavRoute(module.route),
  }));
  const adminHeaderModuleOrder = ['breakfast', 'lost_found', 'issues', 'inventory', 'profile', 'users', 'settings'];
  const adminShellModules = auth.role === 'admin'
    ? adminHeaderModuleOrder
      .map((key) => adminNavModules.find((module) => module.key === key))
      .filter((module): module is typeof adminNavModules[number] => Boolean(module))
    : adminNavModules;
  const shellNavigationRules = auth.role === 'admin'
    ? {
      ...ia.navigation.rules,
      grouping: false,
      maxTopLevelItemsDesktop: adminHeaderModuleOrder.length,
      maxTopLevelItemsTablet: 4,
    }
    : ia.navigation.rules;
  const roleHomeRoute = effectiveRoleView === 'admin'
    ? '/'
    : toAdminNavRoute(allowedRoleModules[0]?.route ?? '/');
  const isAllowed = (moduleKey: string): boolean => {
    if (moduleKey === 'profile') {
      return true;
    }
    if (ADMIN_PERSISTENT_MODULE_KEYS.has(moduleKey)) {
      return canReadModule(auth.permissions, moduleKey);
    }
    return canReadModule(roleScopedPermissions, moduleKey);
  };
  const panelLayout = auth.role === 'admin' ? 'admin' : 'portal';
  const adminCurrentPath = toAdminNavRoute(location.pathname || '/');
  const roleViewLabel = roleSwitcherLabels[effectiveRoleView] ?? effectiveRoleView;
  const canManageBreakfast = effectiveRoleView === 'admin' || effectiveRoleView === 'recepce';
  const canManageInventory = effectiveRoleView === 'admin';
  const headerLeadingControls = auth.role === 'admin' ? (
    <div className="k-header-select-stack">
      <label htmlFor="admin-role-view-select" className="k-subtle">
        Role pohledu
      </label>
      <select
        id="admin-role-view-select"
        className="k-select k-admin-role-select"
        aria-label="Role pohledu"
        value={roleView}
        onChange={(event) => setRoleView(event.target.value as AdminRoleView)}
      >
        {ADMIN_ROLE_VIEW_OPTIONS.map((role) => (
          <option key={role} value={role}>
            {roleSwitcherLabels[role] ?? role}
          </option>
        ))}
      </select>
    </div>
  ) : null;

  return (
    <AuthContext.Provider value={effectiveAuth}>
      <AppShell
        modules={adminShellModules}
        navigationRules={shellNavigationRules}
        navigationSections={ia.navigation.sections}
        currentPath={adminCurrentPath}
        panelLayout={panelLayout}
        headerLeadingControls={headerLeadingControls}
      >
        <Routes>
        <Route path="/" element={effectiveRoleView !== 'admin' ? <Navigate to={roleHomeRoute} replace /> : isAllowed('dashboard') ? <DashboardLive /> : <AccessDeniedPage moduleLabel="Přehled" role={roleViewLabel} userId={auth.userId} />} />
<Route path="/pokojska" element={isAllowed('housekeeping') ? <HousekeepingAdmin /> : <AccessDeniedPage moduleLabel="Pokojská" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/snidane" element={isAllowed('breakfast') ? <BreakfastList /> : <AccessDeniedPage moduleLabel="Snídaně" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/snidane/nova" element={isAllowed('breakfast') && canManageBreakfast ? <BreakfastForm mode="create" /> : <AccessDeniedPage moduleLabel="Sn?dan?" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/snidane/:id" element={isAllowed('breakfast') && canManageBreakfast ? <BreakfastDetail /> : <AccessDeniedPage moduleLabel="Sn?dan?" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/snidane/:id/edit" element={isAllowed('breakfast') && canManageBreakfast ? <BreakfastForm mode="edit" /> : <AccessDeniedPage moduleLabel="Sn?dan?" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy" element={isAllowed('lost_found') ? <LostFoundList /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/novy" element={isAllowed('lost_found') ? <LostFoundForm mode="create" /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id" element={isAllowed('lost_found') ? <LostFoundDetail /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/ztraty-a-nalezy/:id/edit" element={isAllowed('lost_found') ? <LostFoundForm mode="edit" /> : <AccessDeniedPage moduleLabel="Ztráty a nálezy" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/zavady" element={isAllowed('issues') ? <IssuesList /> : <AccessDeniedPage moduleLabel="Závady" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/zavady/nova" element={isAllowed('issues') ? <IssuesForm mode="create" /> : <AccessDeniedPage moduleLabel="Závady" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/zavady/:id" element={isAllowed('issues') ? <IssuesDetail /> : <AccessDeniedPage moduleLabel="Závady" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/zavady/:id/edit" element={isAllowed('issues') ? <IssuesForm mode="edit" /> : <AccessDeniedPage moduleLabel="Závady" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/sklad" element={isAllowed('inventory') ? <InventoryList /> : <AccessDeniedPage moduleLabel="Skladové hospodářství" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/sklad/nova" element={isAllowed('inventory') && canManageInventory ? <InventoryForm mode="create" /> : <AccessDeniedPage moduleLabel="Skladové hospodářství" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/sklad/:id" element={isAllowed('inventory') && canManageInventory ? <InventoryDetail /> : <AccessDeniedPage moduleLabel="Skladové hospodářství" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/sklad/:id/edit" element={isAllowed('inventory') && canManageInventory ? <InventoryForm mode="edit" /> : <AccessDeniedPage moduleLabel="Skladové hospodářství" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/hlaseni" element={isAllowed('reports') ? <ReportsList /> : <AccessDeniedPage moduleLabel="Hlášení" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/hlaseni/nove" element={isAllowed('reports') ? <ReportsForm mode="create" /> : <AccessDeniedPage moduleLabel="Hlášení" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/hlaseni/:id" element={isAllowed('reports') ? <ReportsDetail /> : <AccessDeniedPage moduleLabel="Hlášení" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/hlaseni/:id/edit" element={isAllowed('reports') ? <ReportsForm mode="edit" /> : <AccessDeniedPage moduleLabel="Hlášení" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/uzivatele" element={isAllowed('users') ? <UsersAdmin /> : <AccessDeniedPage moduleLabel="Uživatelé" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/nastaveni" element={isAllowed('settings') ? <SettingsAdmin /> : <AccessDeniedPage moduleLabel="Nastavení" role={roleViewLabel} userId={auth.userId} />} />
        <Route path="/profil" element={<AdminProfilePage />} />
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
