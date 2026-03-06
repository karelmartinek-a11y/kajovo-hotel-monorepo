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
import { Badge, Card, DataTable, FormField, SkeletonPage, StateView, Timeline } from '@kajovo/ui';
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
import { resolveAuthProfile, rolePermissions, type AuthProfile } from './rbac';
import { AdminLoginPage } from './admin/AdminLoginPage';
import { AdminRoutes } from './admin/AdminRoutes';
import { PortalLoginPage } from './portal/PortalLoginPage';
import { PortalRoutes } from './portal/PortalRoutes';

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


const HOUSEKEEPING_ROOMS = [
  '101',
  '102',
  '103',
  '104',
  '105',
  '106',
  '107',
  '108',
  '109',
  '201',
  '202',
  '203',
  '204',
  '205',
  '206',
  '207',
  '208',
  '209',
  '210',
  '301',
  '302',
  '303',
  '304',
  '305',
  '306',
  '307',
  '308',
  '309',
  '310',
];

const AuthContext = React.createContext<AuthProfile | null>(null);

function useAuth(): AuthProfile | null {
  return React.useContext(AuthContext);
}

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
  new: 'NovĂ˝',
  stored: 'UskladnÄ›no',
  disposed: 'Zlikvidovat',
  claimed: 'NĂˇrokovĂˇno',
  returned: 'VrĂˇceno',
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
  resolved: 'OdstranÄ›no',
  closed: 'UzavĹ™ena',
};

const reportStatusLabels: Record<ReportStatus, string> = {
  open: 'OtevĹ™enĂ©',
  in_progress: 'V Ĺ™eĹˇenĂ­',
  closed: 'UzavĹ™enĂ©',
};


const inventoryMovementLabels: Record<InventoryMovementType, string> = {
  in: 'PĹ™Ă­jem',
  out: 'VĂ˝dej',
  adjust: 'Odpis',
};



function breakfastStatusLabel(status: BreakfastStatus | null | undefined): string {
  return status ? statusLabels[status] : '-';
}

function lostFoundStatusLabel(status: LostFoundStatus | null | undefined): string {
  return status ? lostFoundStatusLabels[status] : '-';
}

const lostFoundTagLabels: Record<string, string> = {
  kontaktova: 'KontaktovĂˇ',
  nezastizen: 'NezastiĹľen',
  vyzvedne: 'Vyzvedne',
  odesleme: 'OdeĹˇleme',
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

function readCsrfToken(): string {
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith('kajovo_csrf='))
    ?.split('=')[1] ?? '';
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
  const auth = useAuth();
  const actorRole = auth?.activeRole ?? auth?.role ?? 'recepce';
  const roles = auth?.roles ?? [];
  const isAdmin = actorRole === 'admin';
  const isRecepce = isAdmin || actorRole === 'recepce' || roles.includes('recepce');
  const isBreakfast = isAdmin || actorRole === 'snídaně' || roles.includes('snídaně');
  const canImport = isRecepce || isAdmin;
  const canReactivate = isRecepce || isAdmin;
  const canServe = isBreakfast;
  const canEditDiet = isRecepce || isAdmin;

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
          setError('NepodaĹ™ilo se naÄŤĂ­st seznam snĂ­danĂ­.');
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
        </>
      ) : null}
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
          {canImport && (importError || importInfo) ? (
            <p className={importError ? 'k-text-error' : 'k-text-success'}>
              {importError ?? importInfo}
            </p>
          ) : null}
          {importPreviewTable}
          {filteredItems.length === 0 ? (
            <StateView
              title="PrĂˇzdnĂ˝ stav"
              description="Nebyly nalezeny ĹľĂˇdnĂ© objednĂˇvky."
              stateKey="empty"
              action={canImport ? undefined : undefined}
            />
          ) : (
            <DataTable
              headers={['Datum', 'Pokoj', 'Host', 'PoÄŤet', 'Diety', 'Stav', 'Akce']}
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

function HousekeepingForm(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Pokojská', '/pokojska');
  const stateMarker = <StateMarker state={state} />;
  const [mode, setMode] = React.useState<'issue' | 'lost_found'>('issue');
  const [selectedRoom, setSelectedRoom] = React.useState<string | null>(null);
  const [location, setLocation] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [photos, setPhotos] = React.useState<File[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const resetForm = React.useCallback(() => {
    setSelectedRoom(null);
    setLocation('');
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
    if (!shortDescription) {
      setError('Vyplňte krátký popis.');
      return;
    }
    const roomValue = selectedRoom?.trim() || '';
    const locationValue = roomValue ? `Pokoj ${roomValue}` : location.trim();
    if (!locationValue) {
      setError('Bez pokoje je nutné vyplnit umístění.');
      return;
    }
    const normalizedDescription = roomValue
      ? shortDescription
      : `${locationValue} - ${shortDescription}`;
    setSaving(true);
    setError(null);
    try {
      if (mode === 'issue') {
        const created = await fetchJson<Issue>('/api/v1/issues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: shortDescription,
            description: normalizedDescription,
            location: locationValue,
            room_number: roomValue || null,
            status: 'new',
            priority: 'medium',
          }),
        });
        if (photos.length > 0) {
          const formData = new FormData();
          photos.forEach((file) => formData.append('photos', file));
          const csrfToken = readCsrfToken();
          const response = await fetch(`/api/v1/issues/${created.id}/photos`, {
            method: 'POST',
            credentials: 'include',
            headers: csrfToken ? { 'x-csrf-token': decodeURIComponent(csrfToken) } : undefined,
            body: formData,
          });
          if (!response.ok) {
            throw new Error('Fotografie závady se nepodařilo nahrát.');
          }
        }
      } else {
        const created = await fetchJson<LostFoundItem>('/api/v1/lost-found', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_type: 'found',
            category: 'Nález',
            description: normalizedDescription,
            location: locationValue,
            room_number: roomValue || null,
            event_at: new Date().toISOString(),
            status: 'new',
            tags: [],
          }),
        });
        if (photos.length > 0) {
          const formData = new FormData();
          photos.forEach((file) => formData.append('photos', file));
          const csrfToken = readCsrfToken();
          const response = await fetch(`/api/v1/lost-found/${created.id}/photos`, {
            method: 'POST',
            credentials: 'include',
            headers: csrfToken ? { 'x-csrf-token': decodeURIComponent(csrfToken) } : undefined,
            body: formData,
          });
          if (!response.ok) {
            throw new Error('Fotografie nálezu se nepodařilo nahrát.');
          }
        }
      }
      setSuccess('Záznam byl uložen.');
      setSelectedRoom(null);
      setLocation('');
      setDescription('');
      setPhotos([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Uložení záznamu selhalo.');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <main className="k-page" data-testid="housekeeping-form-page">
        {stateMarker}
        <h1>Pokojská</h1>
        {stateUI ? stateUI : (
          <StateView
            title="Hotovo"
            description={success}
            stateKey="empty"
            action={<button className="k-button" type="button" onClick={resetForm}>Nový záznam</button>}
          />
        )}
      </main>
    );
  }

  return (
    <main className="k-page" data-testid="housekeeping-form-page">
      {stateMarker}
      <h1>Pokojská</h1>
      <StateSwitcher />
      {stateUI ? stateUI : (
        <div className="k-card">
          <div className="k-toolbar">
            <button
              className={mode === 'issue' ? 'k-button' : 'k-button secondary'}
              type="button"
              onClick={() => setMode('issue')}
            >
              Závada
            </button>
            <button
              className={mode === 'lost_found' ? 'k-button' : 'k-button secondary'}
              type="button"
              onClick={() => setMode('lost_found')}
            >
              Nález
            </button>
          </div>
          <div className="k-form-grid">
            <FormField id="housekeeping_room" label="Pokoj (volitelně)">
              <div className="k-toolbar k-room-grid">
                <button
                  className={!selectedRoom ? 'k-button' : 'k-button secondary'}
                  type="button"
                  onClick={() => setSelectedRoom(null)}
                >
                  Bez pokoje
                </button>
                {HOUSEKEEPING_ROOMS.map((room) => (
                  <button
                    key={room}
                    className={selectedRoom === room ? 'k-button' : 'k-button secondary'}
                    type="button"
                    onClick={() => setSelectedRoom(room)}
                  >
                    {room}
                  </button>
                ))}
              </div>
            </FormField>
            {!selectedRoom ? (
              <FormField id="housekeeping_location" label="Umístění (povinné bez pokoje)">
                <input
                  id="housekeeping_location"
                  className="k-input"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                />
              </FormField>
            ) : null}
            <FormField id="housekeeping_description" label="Krátký popis">
              <input
                id="housekeeping_description"
                className="k-input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </FormField>
            <FormField id="housekeeping_photos" label="Fotografie (volitelné)">
              <input
                id="housekeeping_photos"
                className="k-input"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={onFileChange}
              />
            </FormField>
            {photos.length > 0 ? (
              <p>Vybráno fotografií: {photos.length} / 3</p>
            ) : null}
          </div>
          {error ? <StateView title="Chyba" description={error} stateKey="error" /> : null}
          <div className="k-toolbar">
            <button className="k-button" type="button" onClick={() => void submit()} disabled={saving}>
              Odeslat
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function LostFoundList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'ZtrĂˇty a nĂˇlezy', '/ztraty-a-nalezy');
  const stateMarker = <StateMarker state={state} />;
  const auth = useAuth();
  const activeRole = auth?.activeRole ?? auth?.role ?? 'recepce';
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
            <Card title="NovĂ©">
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
              <option value="new">NovĂ˝</option>
              <option value="stored">UskladnÄ›no</option>
              <option value="disposed">Zlikvidovat</option>
            </select>
            <Link className="k-button" to="/ztraty-a-nalezy/novy">
              NovĂˇ poloĹľka
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
                    <Badge key={`${item.id}-${tag}`} tone={activeRole === 'recepce' ? 'warning' : 'neutral'}>
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
  const stateUI = stateViewForRoute(state, 'ZtrĂˇty a nĂˇlezy', '/ztraty-a-nalezy');
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
      .catch(() => setError('PoloĹľku se nepodaĹ™ilo naÄŤĂ­st.'));
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
            <FormField id="room_number" label="ÄŚĂ­slo pokoje (volitelnĂ©)">
              <input
                id="room_number"
                className="k-input"
                value={payload.room_number ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, room_number: event.target.value }))}
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
                <option value="new">NovĂ˝</option>
                <option value="stored">UskladnÄ›no</option>
                <option value="disposed">Zlikvidovat</option>
                <option value="claimed">NĂˇrokovĂˇno</option>
                <option value="returned">VrĂˇceno</option>
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
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<LostFoundStatus>('new');
  const [tags, setTags] = React.useState<string[]>([]);
  const auth = useAuth();
  const activeRole = auth?.activeRole ?? auth?.role ?? 'recepce';
  const canEdit = activeRole === 'recepce' || activeRole === 'admin';
  const canDelete = activeRole === 'admin';

  React.useEffect(() => {
    if (state !== 'default' || !id) {
      return;
    }
    fetchJson<LostFoundItem>(`/api/v1/lost-found/${id}`)
      .then((response) => {
        setItem(response);
        setStatus(response.status ?? 'new');
        setTags(response.tags ?? []);
        setError(null);
      })
      .catch(() => setError('PoloĹľka nebyla nalezena.'));
  }, [id, state]);

  const toggleTag = (tag: string, enabled: boolean): void => {
    setTags((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.add(tag);
      } else {
        next.delete(tag);
      }
      return Array.from(next);
    });
  };

  const saveMeta = async (): Promise<void> => {
    if (!id) return;
    try {
      const updated = await fetchJson<LostFoundItem>(`/api/v1/lost-found/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, tags }),
      });
      setItem(updated);
      setStatus(updated.status ?? status);
      setTags(updated.tags ?? tags);
      setError(null);
    } catch {
      setError('Aktualizace stavu nebo tagů selhala.');
    }
  };

  const deleteItem = async (): Promise<void> => {
    if (!id) return;
    try {
      await fetchJson(`/api/v1/lost-found/${id}`, { method: 'DELETE' });
      window.location.assign('/ztraty-a-nalezy');
    } catch {
      setError('Smazání položky selhalo.');
    }
  };

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
        <>
          <div className="k-card">
            <div className="k-toolbar">
              <Link className="k-nav-link" to="/ztraty-a-nalezy">
                ZpÄ›t na seznam
              </Link>
              <Link className="k-button" to={`/ztraty-a-nalezy/${item.id}/edit`}>
                Upravit
              </Link>
              {canDelete ? (
                <button className="k-button secondary" type="button" onClick={() => void deleteItem()}>
                  Smazat
                </button>
              ) : null}
            </div>
            <DataTable
              headers={['PoloĹľka', 'Hodnota']}
              rows={[
                ['Typ', lostFoundTypeLabel(item.item_type)],
                ['Kategorie', item.category],
                ['MĂ­sto', item.location],
                ['Pokoj', item.room_number ?? '-'],
                ['Datum a ÄŤas', new Date(item.event_at).toLocaleString('cs-CZ')],
                ['Stav', lostFoundStatusLabel(item.status)],
                ['Popis', item.description],
                ['Tagy', (item.tags ?? []).map((tag) => lostFoundTagLabel(tag)).join(', ') || '-'],
                ['JmĂ©no Ĺľadatele', item.claimant_name ?? '-'],
                ['Kontakt', item.claimant_contact ?? '-'],
                ['PĹ™edĂˇvacĂ­ zĂˇznam', item.handover_note ?? '-'],
              ]}
            />
          </div>
          {canEdit ? (
            <div className="k-card">
              <h2>Tagy a stav</h2>
              <div className="k-form-grid">
                <FormField id="lost_found_status" label="Stav">
                  <select
                    id="lost_found_status"
                    className="k-select"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as LostFoundStatus)}
                  >
                    <option value="new">NovĂ˝</option>
                    <option value="stored">UskladnÄ›no</option>
                    <option value="disposed">Zlikvidovat</option>
                  </select>
                </FormField>
                <FormField id="lost_found_tags" label="Tagy">
                  <div className="k-toolbar">
                    {Object.keys(lostFoundTagLabels).map((tag) => (
                      <label className="k-role-label" key={`lf-tag-${tag}`}>
                        <input
                          type="checkbox"
                          checked={tags.includes(tag)}
                          onChange={(event) => toggleTag(tag, event.target.checked)}
                        />
                        {lostFoundTagLabel(tag)}
                      </label>
                    ))}
                  </div>
                </FormField>
              </div>
              <button className="k-button" type="button" onClick={() => void saveMeta()}>
                UloĹľit zmÄ›ny
              </button>
            </div>
          ) : null}
          {item.photos && item.photos.length > 0 ? (
            <div className="k-card">
              <h2>Fotodokumentace</h2>
              <div className="k-grid cards-3">
                {item.photos.map((photo) => (
                  <img
                    key={photo.id}
                    src={`/api/v1/lost-found/${item.id}/photos/${photo.id}/thumb`}
                    alt={`Fotografie nĂˇlezu ${photo.id}`}
                    className="k-photo-thumb"
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
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
  const auth = useAuth();
  const activeRole = auth?.activeRole ?? auth?.role ?? 'recepce';
  const isMaintenance = activeRole === 'údržba';
  const [items, setItems] = React.useState<Issue[]>([]);
  const [priorityFilter, setPriorityFilter] = React.useState<'all' | IssuePriority>('all');
  const [statusFilter, setStatusFilter] = React.useState<'all' | IssueStatus>('all');
  const [locationFilter, setLocationFilter] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state !== 'default') return;
    const params = new URLSearchParams();
    if (!isMaintenance) {
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (locationFilter.trim()) params.set('location', locationFilter.trim());
    }
    const query = params.toString();
    fetchJson<Issue[]>(query ? `/api/v1/issues?${query}` : '/api/v1/issues')
      .then((response) => { setItems(response); setError(null); })
      .catch(() => setError('NepodaĹ™ilo se naÄŤĂ­st seznam zĂˇvad.'));
  }, [isMaintenance, locationFilter, priorityFilter, state, statusFilter]);

  const markResolved = async (issueId: number): Promise<void> => {
    try {
      await fetchJson<Issue>(`/api/v1/issues/${issueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      setItems((prev) => prev.filter((item) => item.id !== issueId));
    } catch {
      setError('OznaÄŤenĂ­ zĂˇvady jako odstranÄ›nĂ© selhalo.');
    }
  };

  return (
    <main className="k-page" data-testid="issues-list-page">
      {stateMarker}
      <h1>ZĂˇvady</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : items.length === 0 ? (
        <StateView title="PrĂˇzdnĂ˝ stav" description={isMaintenance ? 'ZatĂ­m nejsou otevĹ™enĂ© zĂˇvady.' : 'ZatĂ­m nejsou evidovanĂ© ĹľĂˇdnĂ© zĂˇvady.'} stateKey="empty" action={isMaintenance ? undefined : <Link className="k-button" to="/zavady/nova">NahlĂˇsit zĂˇvadu</Link>} />
      ) : isMaintenance ? (
        <DataTable
          headers={['Miniatura', 'Popis', 'ZadĂˇno', 'Akce']}
          rows={items.map((item) => [
            item.photos && item.photos.length > 0 ? (
              <img
                key={`issue-thumb-${item.id}`}
                src={`/api/v1/issues/${item.id}/photos/${item.photos[0].id}/thumb`}
                alt="Miniatura zĂˇvady"
                className="k-photo-thumb"
              />
            ) : (
              '-'
            ),
            `${item.title}${item.room_number ? ` (Pokoj ${item.room_number})` : ''}`,
            formatDateTime(item.created_at),
            <button className="k-button" type="button" key={`resolve-${item.id}`} onClick={() => void markResolved(item.id)}>
              OdstranÄ›no
            </button>,
          ])}
        />
      ) : (
        <>
          <div className="k-toolbar">
            <select className="k-select" aria-label="Filtr priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as 'all' | IssuePriority)}>
              <option value="all">VĹˇechny priority</option><option value="low">NĂ­zkĂˇ</option><option value="medium">StĹ™ednĂ­</option><option value="high">VysokĂˇ</option><option value="critical">KritickĂˇ</option>
            </select>
            <select className="k-select" aria-label="Filtr stavu" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | IssueStatus)}>
              <option value="all">VĹˇechny stavy</option><option value="new">NovĂˇ</option><option value="in_progress">V Ĺ™eĹˇenĂ­</option><option value="resolved">OdstranÄ›no</option><option value="closed">UzavĹ™ena</option>
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
</div></div>}</main>;
}

function IssuesDetail(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'ZĂˇvady', '/zavady');
  const stateMarker = <StateMarker state={state} />;
  const { id } = useParams();
  const [item, setItem] = React.useState<Issue | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const auth = useAuth();
  const activeRole = auth?.activeRole ?? auth?.role ?? 'recepce';
  const canDelete = activeRole === 'admin';

  React.useEffect(() => {
    if (state !== 'default' || !id) return;
    fetchJson<Issue>(`/api/v1/issues/${id}`).then((response) => { setItem(response); setError(null); }).catch(() => setError('ZĂˇvada nebyla nalezena.'));
  }, [id, state]);

  const timeline = item ? [
    { label: 'VytvoĹ™eno', value: formatDateTime(item.created_at) },
    ...(item.in_progress_at ? [{ label: 'V Ĺ™eĹˇenĂ­', value: new Date(item.in_progress_at).toLocaleString('cs-CZ') }] : []),
    ...(item.resolved_at ? [{ label: 'OdstranÄ›no', value: new Date(item.resolved_at).toLocaleString('cs-CZ') }] : []),
    ...(item.closed_at ? [{ label: 'UzavĹ™eno', value: new Date(item.closed_at).toLocaleString('cs-CZ') }] : []),
  ] : [];

  const deleteIssue = async (): Promise<void> => {
    if (!id) return;
    try {
      await fetchJson(`/api/v1/issues/${id}`, { method: 'DELETE' });
      window.location.assign('/zavady');
    } catch {
      setError('SmazĂˇnĂ­ zĂˇvady selhalo.');
    }
  };

  return (
    <main className="k-page" data-testid="issues-detail-page">
      {stateMarker}
      <h1>Detail zĂˇvady</h1><StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/zavady">ZpÄ›t na seznam</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">ZpÄ›t na seznam</Link><Link className="k-button" to={`/zavady/${item.id}/edit`}>Upravit</Link>{canDelete ? <button className="k-button secondary" type="button" onClick={() => void deleteIssue()}>Smazat</button> : null}</div><DataTable headers={['PoloĹľka', 'Hodnota']} rows={[[ 'NĂˇzev', item.title],[ 'Lokace', item.location],[ 'Pokoj', item.room_number ?? '-'],[ 'Priorita', issuePriorityLabel(item.priority)],[ 'Stav', issueStatusLabel(item.status)],[ 'PĹ™iĹ™azeno', item.assignee ?? '-'],[ 'Popis', item.description ?? '-' ]]} /><h2>Timeline</h2><Timeline entries={timeline} /></div> : <SkeletonPage />}
    </main>
  );
}


function InventoryList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Skladové hospodářství', '/sklad');
  const stateMarker = <StateMarker state={state} />;
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
          action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>}
        />
      ) : items.length === 0 ? (
        <StateView
          title="Prázdný stav"
          description="Ve skladu zatím nejsou položky."
          stateKey="empty"
          action={<Link className="k-button" to="/sklad/nova">Nová položka</Link>}
        />
      ) : (
        <>
          <div className="k-toolbar">
            <button className="k-button secondary" type="button" onClick={downloadStocktakePdf}>
              Inventurní protokol (PDF)
            </button>
            <Link className="k-button" to="/sklad/nova">Nová položka</Link>
          </div>
          <DataTable
            headers={['Položka', 'Skladem', 'Minimum', 'Jednotka', 'Dodavatel', 'Status', 'Akce']}
            rows={items.map((item) => [
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
          action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>}
        />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/sklad">Zpět na seznam</Link>
            <button className="k-button" type="button" onClick={() => void save()}>Uložit</button>
          </div>
          <div className="k-form-grid">
            <FormField id="inventory_name" label="Název">
              <input id="inventory_name" className="k-input" value={payload.name} onChange={(e) => setPayload((prev) => ({ ...prev, name: e.target.value }))} />
            </FormField>
            <FormField id="inventory_unit" label="Veličina v 1 ks">
              <select id="inventory_unit" className="k-select" value={payload.unit} onChange={(e) => setPayload((prev) => ({ ...prev, unit: e.target.value }))}>
                <option value="g">g</option>
                <option value="l">l</option>
                <option value="ks">ks</option>
              </select>
            </FormField>
            <FormField id="inventory_amount_per_piece_base" label="Hodnota veličiny v 1 ks">
              <input id="inventory_amount_per_piece_base" type="number" className="k-input" value={payload.amount_per_piece_base ?? 0} onChange={(e) => setPayload((prev) => ({ ...prev, amount_per_piece_base: Number(e.target.value) }))} />
            </FormField>
            <FormField id="inventory_min_stock" label="Minimální stav">
              <input id="inventory_min_stock" type="number" className="k-input" value={payload.min_stock} onChange={(e) => setPayload((prev) => ({ ...prev, min_stock: Number(e.target.value) }))} />
            </FormField>
            <FormField id="inventory_supplier" label="Dodavatel (volitelné)">
              <input id="inventory_supplier" className="k-input" value={payload.supplier ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, supplier: e.target.value }))} />
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

  return (
    <main className="k-page" data-testid="inventory-detail-page">
      {stateMarker}
      <h1>Detail skladové položky</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? (
        <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/sklad">Zpět na seznam</Link>} />
      ) : item ? (
        <>
          <div className="k-card">
            <div className="k-toolbar">
              <Link className="k-nav-link" to="/sklad">Zpět na seznam</Link>
              <Link className="k-button" to={`/sklad/${item.id}/edit`}>Upravit</Link>
            </div>
            <DataTable
              headers={['Položka', 'Skladem', 'Minimum', 'Veličina v 1 ks', 'Dodavatel', 'Hodnota veličiny v 1 ks']}
              rows={[[item.name, item.current_stock, item.min_stock, item.unit, item.supplier ?? '-', item.amount_per_piece_base ?? 0]]}
            />
          </div>
          <div className="k-card">
            <h2>Příjem</h2>
            <div className="k-form-grid">
              <FormField id="receipt_quantity" label="Počet kusů">
                <input id="receipt_quantity" type="number" className="k-input" value={receiptQuantity} onChange={(e) => setReceiptQuantity(Number(e.target.value))} />
              </FormField>
              <FormField id="receipt_date" label="Datum příjmu">
                <input id="receipt_date" type="date" className="k-input" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
              </FormField>
              <FormField id="receipt_reference" label="Číslo dodacího listu / faktury">
                <input id="receipt_reference" className="k-input" value={receiptReference} onChange={(e) => setReceiptReference(e.target.value)} />
              </FormField>
              <FormField id="receipt_note" label="Poznámka (volitelné)">
                <input id="receipt_note" className="k-input" value={receiptNote} onChange={(e) => setReceiptNote(e.target.value)} />
              </FormField>
            </div>
            <button className="k-button" type="button" onClick={() => void addReceipt()}>Uložit příjem</button>
          </div>
          <div className="k-card">
            <h2>{issueType === 'adjust' ? 'Odpis' : 'Výdej'}</h2>
            <div className="k-form-grid">
              <FormField id="issue_kind" label="Druh výdejky">
                <select id="issue_kind" className="k-select" value={issueType} onChange={(e) => setIssueType(e.target.value as InventoryMovementType)}>
                  <option value="out">Výdej</option>
                  <option value="adjust">Odpis</option>
                </select>
              </FormField>
              <FormField id="issue_quantity" label="Počet kusů">
                <input id="issue_quantity" type="number" className="k-input" value={issueQuantity} onChange={(e) => setIssueQuantity(Number(e.target.value))} />
              </FormField>
              <FormField id="issue_date" label="Datum výdejky">
                <input id="issue_date" type="date" className="k-input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </FormField>
              <FormField id="issue_note" label="Poznámka (volitelné)">
                <input id="issue_note" className="k-input" value={issueNote} onChange={(e) => setIssueNote(e.target.value)} />
              </FormField>
            </div>
            <button className="k-button" type="button" onClick={() => void addIssue()}>Uložit výdej</button>
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
  const testNav = typeof window !== 'undefined' ? (window as Window & { __KAJOVO_TEST_NAV__?: unknown }).__KAJOVO_TEST_NAV__ : undefined;
  const injectedModules = Array.isArray((testNav as { modules?: unknown } | undefined)?.modules)
    ? ((testNav as { modules: typeof ia.modules }).modules ?? [])
    : [];
  const modules = [...ia.modules, ...injectedModules];

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/*" element={<AdminRoutes currentPath={location.pathname} />} />
        <Route path="/login" element={<PortalLoginPage />} />
        <Route
          path="*"
          element={
            <PortalRoutes
              currentPath={location.pathname}
              auth={auth}
              modules={modules}
              deps={{
                Dashboard,
                HousekeepingForm,
                BreakfastList,
                BreakfastForm,
                BreakfastDetail,
                LostFoundList,
                LostFoundForm,
                LostFoundDetail,
                IssuesList,
                IssuesForm,
                IssuesDetail,
                InventoryList,
                InventoryForm,
                InventoryDetail,
                ReportsList,
                ReportsForm,
                ReportsDetail,
                IntroRoute,
                OfflineRoute,
                MaintenanceRoute,
                NotFoundRoute,
              }}
            />
          }
        />
      </Routes>
    </AuthContext.Provider>
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


