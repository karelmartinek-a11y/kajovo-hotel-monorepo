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
import { normalizeRole, resolveAuthProfile, rolePermissions, type AuthProfile } from './rbac';
import { currentDateForTimeZone, currentDateTimeInputValue, isoUtcToLocalDateTimeInput, localDateTimeInputToIsoUtc } from './lib/date';
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

type InventoryCardLinePayload = {
  ingredient_id: number;
  quantity_base: number;
  quantity_pieces: number;
  note?: string | null;
};

type InventoryCardDetail = InventoryCardReadModel & {
  items: Array<{
    id: number;
    card_id: number;
    ingredient_id: number;
    ingredient_name?: string | null;
    unit?: string | null;
    quantity_base: number;
    quantity_pieces: number;
    note?: string | null;
    created_at?: string | null;
  }>;
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

type InventoryDraftMovement = {
  itemId: number;
  quantity: number;
};

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
  '221',
  '222',
  '223',
  '224',
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
  '321',
  '322',
  '323',
  '324',
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

const inventoryMovementPanelLabels: Record<InventoryMovementType, string> = {
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

function readCsrfToken(): string {
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith('kajovo_csrf='))
    ?.split('=')[1] ?? '';
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

  const headers = normalizeHeaders(init?.headers);
  if (!['GET', 'HEAD'].includes(method.toUpperCase())) {
    const csrf = readCsrfToken();
    if (csrf && !headers['x-csrf-token']) {
      headers['x-csrf-token'] = csrf;
    }
  }

  const fallbackResponse = await fetch(path + url.search, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!fallbackResponse.ok) {
    const raw = await fallbackResponse.text();
    try {
      const parsed = JSON.parse(raw) as { detail?: unknown };
      if (typeof parsed.detail === 'string') {
        throw new Error(parsed.detail);
      }
      if (Array.isArray(parsed.detail)) {
        const messages = parsed.detail
          .map((item) => (typeof item === 'object' && item && 'msg' in item && typeof item.msg === 'string' ? item.msg : null))
          .filter((item): item is string => item !== null);
        if (messages.length > 0) {
          throw new Error(messages.join(' '));
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
    }
    throw new Error(raw || `HTTP ${fallbackResponse.status}`);
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

function lostFoundThumbSrc(item: LostFoundItem): string | null {
  const photo = item.photos?.[0];
  return photo ? `/api/v1/lost-found/${item.id}/photos/${photo.id}/thumb` : null;
}

function formatTaskBoardDate(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleDateString('cs-CZ');
}

function formatTaskBoardTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit' });
}

function TaskBoardKpi({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="k-task-kpi">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function TaskBoardCard({
  href,
  title,
  description,
  date,
  time,
  openFor,
  imageSrc,
  imageAlt,
  actionLabel,
  onAction,
}: {
  href: string;
  title: string;
  description: string;
  date: string;
  time: string;
  openFor: string;
  imageSrc: string | null;
  imageAlt: string;
  actionLabel: string;
  onAction: () => void;
}): JSX.Element {
  return (
    <article className="k-task-card">
      <Link className="k-task-card-main" to={href}>
        <div className="k-task-card-topline">
          <h2>{title}</h2>
          <span>{date}</span>
        </div>
        <div className="k-task-card-body">
          <div className="k-task-photo" aria-hidden={imageSrc ? undefined : 'true'}>
            {imageSrc ? <img src={imageSrc} alt={imageAlt} /> : <span>{title.slice(0, 2).toUpperCase()}</span>}
          </div>
          <div className="k-task-copy">
            <p className="k-task-description">{description}</p>
            <p className="k-task-meta">Nahlášeno: {date}</p>
            <strong>{time}</strong>
            <span>Otevřeno: {openFor}</span>
          </div>
        </div>
      </Link>
      <button className="k-task-action" type="button" onClick={onAction}>{actionLabel}</button>
    </article>
  );
}

function TaskBoardHero({
  title,
  description,
  date,
  time,
  openFor,
  imageSrc,
  imageAlt,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  description: string;
  date: string;
  time: string;
  openFor: string;
  imageSrc: string | null;
  imageAlt: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <section className="k-task-hero">
      <div className="k-task-card-topline">
        <h2>{title}</h2>
        <span>{date}</span>
      </div>
      <div className="k-task-card-body">
        <div className="k-task-photo" aria-hidden={imageSrc ? undefined : 'true'}>
          {imageSrc ? <img src={imageSrc} alt={imageAlt} /> : <span>{title.slice(0, 2).toUpperCase()}</span>}
        </div>
        <div className="k-task-copy">
          <p className="k-task-description">{description}</p>
          <p className="k-task-meta">Nahlášeno: {date}</p>
          <strong>{time}</strong>
          <span>Otevřeno: {openFor}</span>
        </div>
        {actionLabel && onAction ? <button className="k-task-action" type="button" onClick={onAction}>{actionLabel}</button> : null}
      </div>
      {children}
    </section>
  );
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

function inventoryItemById(items: InventoryItem[], itemId: string | number): InventoryItem | undefined {
  const normalizedId = Number(itemId);
  return items.find((item) => item.id === normalizedId);
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
  return auth?.activeRole ?? auth?.role ?? 'recepce';
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
  return auth?.activeRole ?? auth?.role ?? 'recepce';
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

  return (
    <main className="k-page" data-testid="dashboard-page">
      {stateMarker}
      <h1>Přehled</h1>
      <div className="k-toolbar">
        <Link className="k-button secondary" to="/profil">Muj profil</Link>
      </div>
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
  const actorRole = normalizeRole(auth?.activeRole ?? auth?.role ?? 'recepce');
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

function HousekeepingForm(): JSX.Element {
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
      setSuccess(mode === 'issue' ? 'Závada byla odeslána.' : 'Nález byl odeslán.');
      resetForm();
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
        <div className="k-card k-card--compact">
          <div className="k-toolbar" role="group" aria-label="Typ zápisu pokojské">
            <button className={mode === 'issue' ? 'k-button' : 'k-button secondary'} type="button" onClick={() => setMode('issue')} aria-pressed={mode === 'issue'}>
              Závada
            </button>
            <button className={mode === 'lost_found' ? 'k-button' : 'k-button secondary'} type="button" onClick={() => setMode('lost_found')} aria-pressed={mode === 'lost_found'}>
              Nález
            </button>
          </div>
          {error ? <p className="k-text-error">{error}</p> : null}
          <div className="k-form-grid">
            <FormField id="housekeeping_room" label="Pokoj">
              <select id="housekeeping_room" className="k-select" value={selectedRoom} onChange={(event) => setSelectedRoom(event.target.value)}>
                <option value="">Vyberte pokoj</option>
                {HOUSEKEEPING_ROOMS.map((room) => (
                  <option key={room} value={room}>
                    {room}
                  </option>
                ))}
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
            <button className="k-button" type="button" onClick={() => void submit()} disabled={saving}>
              Odeslat
            </button>
            <button className="k-button secondary" type="button" onClick={resetForm} disabled={saving}>
              Vyčistit
            </button>
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
  const auth = useAuth();
  const activeRole = normalizeRole(auth?.activeRole ?? auth?.role ?? 'recepce');
  const isReception = activeRole === 'recepce';
  const isAdmin = activeRole === 'admin';
  const [items, setItems] = React.useState<LostFoundItem[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<'all' | LostFoundStatus>(isReception ? 'new' : 'all');
  const [error, setError] = React.useState<string | null>(null);

  const loadItems = React.useCallback(() => {
    const params = new URLSearchParams();
    const effectiveStatus = isReception ? 'new' : statusFilter;
    if (effectiveStatus !== 'all') {
      params.set('status', effectiveStatus);
    }
    const query = params.toString();
    const url = query ? `/api/v1/lost-found?${query}` : '/api/v1/lost-found';
    fetchJson<LostFoundItem[]>(url)
      .then((response) => {
        setItems(response.filter((item) => (isReception ? item.status === 'new' : true)));
        setError(null);
      })
      .catch(() => setError('Nepodařilo se načíst nálezy.'));
  }, [isReception, statusFilter]);

  React.useEffect(() => {
    if (state !== 'default') {
      return;
    }
    loadItems();
  }, [loadItems, state]);

  const markProcessed = async (itemId: number): Promise<void> => {
    try {
      await fetchJson<LostFoundItem>(`/api/v1/lost-found/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'claimed' }),
      });
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch {
      setError('Označení nálezu jako zpracovaného selhalo.');
    }
  };

  const visibleItems = React.useMemo(() => {
    if (isReception) {
      return items;
    }
    if (statusFilter === 'all') {
      return items;
    }
    return items.filter((item) => item.status === statusFilter);
  }, [isReception, items, statusFilter]);

  return (
    <main className="k-page" data-testid="lost-found-list-page">
      {stateMarker}
      <h1>{isReception ? 'Recepční úkoly' : 'Ztráty a nálezy'}</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? (
        <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => void loadItems()}>Obnovit</button>} />
      ) : visibleItems.length === 0 ? (
        <StateView title={isReception ? '?ekaj?c? n?lezy' : 'Pr?zdn? stav'} description={isReception ? '??dn? ?ekaj?c? n?lez pro recepci.' : '??dn? evidovan? n?lez.'} stateKey="empty" action={isAdmin ? <Link className="k-button" to="/ztraty-a-nalezy/novy">P?idat z?znam</Link> : undefined} />
      ) : isReception ? (
        <section className="k-task-board">
          <div className="k-task-kpis">
            <TaskBoardKpi label="Čeká na recepci" value={String(visibleItems.length)} />
            <TaskBoardKpi label="S fotografií" value={String(visibleItems.filter((item) => (item.photos?.length ?? 0) > 0).length)} />
            <TaskBoardKpi label="Z pokojů" value={String(visibleItems.filter((item) => Boolean(item.room_number)).length)} />
          </div>
          <div className="k-task-list">
            {visibleItems.map((item) => (
              <TaskBoardCard
                key={item.id}
                href={`/ztraty-a-nalezy/${item.id}`}
                title={item.room_number ? `Pokoj ${item.room_number}` : 'Nález'}
                description={item.description}
                date={formatTaskBoardDate(item.event_at)}
                time={formatTaskBoardTime(item.event_at)}
                openFor={hoursOpenSince(item.event_at)}
                imageSrc={lostFoundThumbSrc(item)}
                imageAlt={`Fotografie nálezu ${item.description}`}
                actionLabel="Hotovo"
                onAction={() => void markProcessed(item.id)}
              />
            ))}
          </div>
        </section>
      ) : (
        <>
          {!isReception ? (
            <div className="k-toolbar">
              <select className="k-select" aria-label="Filtr stavu" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | LostFoundStatus)}>
                <option value="all">Všechny stavy</option>
                <option value="new">Nezpracováno</option>
                <option value="claimed">Zpracováno</option>
              </select>
              {isAdmin ? <Link className="k-button" to="/ztraty-a-nalezy/novy">Nový záznam</Link> : null}
            </div>
          ) : null}
          <DataTable
            headers={isReception ? ['Miniatura', 'Pokoj', 'Popis', 'Vznik', 'Akce'] : ['Stav', 'Pokoj', 'Popis', 'Vznik', 'Akce']}
            rows={visibleItems.map((item) => (isReception
              ? [
                  item.photos && item.photos.length > 0 ? <img key={`thumb-${item.id}`} src={`/api/v1/lost-found/${item.id}/photos/${item.photos[0].id}/thumb`} alt="Miniatura nálezu" className="k-photo-thumb" /> : '-',
                  item.room_number ?? '-',
                  item.description,
                  formatShortDateTime(item.event_at),
                  <div className="k-inline-links" key={`actions-${item.id}`}><Link className="k-nav-link" to={`/ztraty-a-nalezy/${item.id}`}>Detail</Link><button className="k-button" type="button" onClick={() => void markProcessed(item.id)}>Zpracováno</button></div>,
                ]
              : [
                  lostFoundStatusLabel(item.status),
                  item.room_number ?? '-',
                  item.description,
                  formatShortDateTime(item.event_at),
                  <Link className="k-nav-link" key={item.id} to={`/ztraty-a-nalezy/${item.id}`}>Detail</Link>,
                ]))}
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
                <option value="new">Nový</option>
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
  const [error, setError] = React.useState<string | null>(null);
  const auth = useAuth();
  const activeRole = normalizeRole(auth?.activeRole ?? auth?.role ?? 'recepce');
  const canProcess = activeRole === 'recepce';
  const canAdmin = activeRole === 'admin';

  const loadItem = React.useCallback(() => {
    if (!id) {
      return;
    }
    fetchJson<LostFoundItem>(`/api/v1/lost-found/${id}`)
      .then((response) => {
        setItem(response);
        setError(null);
      })
      .catch(() => setError('Položka nebyla nalezena.'));
  }, [id]);

  React.useEffect(() => {
    if (state !== 'default') {
      return;
    }
    loadItem();
  }, [loadItem, state]);

  const setWorkflowStatus = async (status: LostFoundStatus): Promise<void> => {
    if (!id) return;
    try {
      const updated = await fetchJson<LostFoundItem>(`/api/v1/lost-found/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setItem(updated);
      if (activeRole === 'recepce' && status === 'claimed') {
        window.location.assign('/ztraty-a-nalezy');
      }
    } catch {
      setError('Změna stavu nálezu selhala.');
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
      <h1>{canProcess ? 'Recepční úkoly' : 'Detail nálezu'}</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="404" description={error} /> : item ? (
        <div className="k-task-board">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/ztraty-a-nalezy">Zpět na seznam</Link>
            {canAdmin && item.status !== 'new' ? <button className="k-button" type="button" onClick={() => void setWorkflowStatus('new')}>Vrátit do nezpracovaných</button> : null}
            {canAdmin ? <button className="k-button secondary" type="button" onClick={() => void deleteItem()}>Smazat</button> : null}
          </div>
          <TaskBoardHero
            title={item.room_number ? `Pokoj ${item.room_number}` : 'Nález'}
            description={item.description}
            date={formatTaskBoardDate(item.event_at)}
            time={formatTaskBoardTime(item.event_at)}
            openFor={hoursOpenSince(item.event_at)}
            imageSrc={lostFoundThumbSrc(item)}
            imageAlt={`Fotografie nálezu ${item.description}`}
            actionLabel={canProcess ? 'Hotovo' : undefined}
            onAction={canProcess ? () => void setWorkflowStatus('claimed') : undefined}
          />
          <DataTable
            headers={['Položka', 'Hodnota']}
            rows={[
              ['Pokoj', item.room_number ?? '-'],
              ['Místo', item.location],
              ['Popis', item.description],
              ['Vznik', formatDateTime(item.event_at)],
              ['Stav', lostFoundStatusLabel(item.status)],
            ]}
          />
          {item.photos && item.photos.length > 0 ? <div className="k-grid cards-3">{item.photos.map((photo) => <img key={photo.id} src={`/api/v1/lost-found/${item.id}/photos/${photo.id}/thumb`} alt={`Fotografie nálezu ${photo.id}`} className="k-photo-thumb" />)}</div> : null}
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
  const activeRole = auth?.activeRole ?? auth?.role ?? 'recepce';
  const isMaintenance = normalizeRole(activeRole) === normalizeRole('udrzba');
  const isAdmin = activeRole === 'admin';
  const [items, setItems] = React.useState<Issue[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'open' | IssueStatus>(isMaintenance ? 'open' : 'all');
  const [error, setError] = React.useState<string | null>(null);

  const loadItems = React.useCallback(() => {
    const params = new URLSearchParams();
    if (!isMaintenance && statusFilter !== 'all' && statusFilter !== 'open') {
      params.set('status', statusFilter);
    }
    const query = params.toString();
    fetchJson<Issue[]>(query ? `/api/v1/issues?${query}` : '/api/v1/issues')
      .then((response) => {
        setItems(response);
        setError(null);
      })
      .catch(() => setError('Nepodařilo se načíst seznam závad.'));
  }, [isMaintenance, statusFilter]);

  React.useEffect(() => {
    if (state !== 'default') return;
    loadItems();
  }, [loadItems, state]);

  const visibleItems = React.useMemo(() => {
    if (!isMaintenance) {
      return items;
    }
    if (statusFilter === 'all') {
      return items;
    }
    return items.filter((item) => item.status !== 'resolved' && item.status !== 'closed');
  }, [isMaintenance, items, statusFilter]);

  const markDone = async (issueId: number): Promise<void> => {
    try {
      await fetchJson<Issue>(`/api/v1/issues/${issueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      setItems((prev) => prev.map((item) => (item.id === issueId ? { ...item, status: 'resolved', resolved_at: new Date().toISOString() } : item)));
    } catch {
      setError('Označení závady jako hotové selhalo.');
    }
  };

  return (
    <main className="k-page" data-testid="issues-list-page">
      {stateMarker}
      <h1>{isMaintenance ? 'Údržba' : 'Závady'}</h1>
      <StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => void loadItems()}>Obnovit</button>} /> : visibleItems.length === 0 ? (
        <StateView title="Pr?zdn? stav" description={isMaintenance ? 'Žádná otevřená závada.' : 'Zatím nejsou evidované žádné závady.'} stateKey="empty" action={isAdmin ? <Link className="k-button" to="/zavady/nova">Nahlásit závadu</Link> : undefined} />
      ) : isMaintenance ? (
        <section className="k-task-board" aria-label="Seznam závad pro údržbu">
          <div className="k-task-kpis">
            <TaskBoardKpi label="Aktivní úkoly" value={String(visibleItems.length)} />
            <TaskBoardKpi label="S fotografií" value={String(visibleItems.filter((item) => (item.photos?.length ?? 0) > 0).length)} />
            <TaskBoardKpi label="Nad 24 h" value={String(visibleItems.filter((item) => {
              if (!item.created_at) return false;
              return Date.now() - new Date(item.created_at).getTime() >= 86_400_000;
            }).length)} />
          </div>
          <div className="k-issues-toolbar">
            <div className="k-issues-filters" role="tablist" aria-label="Filtr závad">
              <button className={`k-issues-filter${statusFilter === 'open' ? ' is-active' : ''}`} type="button" onClick={() => setStatusFilter('open')} aria-pressed={statusFilter === 'open'}>Otevřené</button>
              <button className={`k-issues-filter${statusFilter === 'all' ? ' is-active' : ''}`} type="button" onClick={() => setStatusFilter('all')} aria-pressed={statusFilter === 'all'}>Vše</button>
            </div>
          </div>
          <div className="k-task-list">
            {visibleItems.map((item) => (
              <TaskBoardCard
                key={item.id}
                href={`/zavady/${item.id}`}
                title={item.room_number ? `Pokoj ${item.room_number}` : item.location}
                description={item.description ?? item.title}
                date={formatTaskBoardDate(item.created_at)}
                time={formatTaskBoardTime(item.created_at)}
                openFor={hoursOpenSince(item.created_at)}
                imageSrc={item.photos?.[0] ? `/api/v1/issues/${item.id}/photos/${item.photos[0].id}/thumb` : null}
                imageAlt={`Fotografie závady ${item.description ?? item.title}`}
                actionLabel="Hotovo"
                onAction={() => void markResolved(item.id)}
              />
            ))}
          </div>
        </section>
      ) : (
        <>
          <div className="k-toolbar">
            <select className="k-select" aria-label="Filtr stavu" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | IssueStatus)}>
              <option value="all">Všechny stavy</option>
              <option value="new">Otevřené</option>
              <option value="resolved">Odstraněné</option>
            </select>
            {isAdmin ? <Link className="k-button" to="/zavady/nova">Nová závada</Link> : null}
          </div>
          <DataTable headers={['Stav', 'Pokoj', 'Popis', 'Vznik', 'Otevřeno', 'Akce']} rows={visibleItems.map((item) => [
            issueStatusLabel(item.status), item.room_number ?? '-', item.description ?? item.title, formatShortDateTime(item.created_at), hoursOpenSince(item.created_at),
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
  const auth = useAuth();
  const canManage = isIssueAdmin(auth);
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

  return <main className="k-page" data-testid={mode === 'create' ? 'issues-create-page' : 'issues-edit-page'}>{stateMarker}<h1>{mode === 'create' ? 'Nová závada' : 'Upravit závadu'}</h1><StateSwitcher />{stateUI ? stateUI : !canManage ? <StateView title="Přístup odepřen" description="Závadu může upravovat nebo znovu zakládat jen admin." stateKey="error" action={<Link className="k-button secondary" to="/zavady">Zpět na seznam</Link>} /> : error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>Obnovit</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">Zpět na seznam</Link><button className="k-button" type="button" onClick={() => void save()}>Uložit</button></div><div className="k-form-grid">
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
  const stateMarker = <StateMarker state={state} />;
  const { id } = useParams();
  const [item, setItem] = React.useState<Issue | null>(null);
  const [photos, setPhotos] = React.useState<MediaPhoto[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const auth = useAuth();
  const activeRole = auth?.activeRole ?? auth?.role ?? 'recepce';
  const canDelete = activeRole === 'admin';
  const canResolve = normalizeRole(activeRole) === normalizeRole('udrzba');
  const canReopen = activeRole === 'admin';

  const loadIssue = React.useCallback(() => {
    if (!id) return;
    fetchJson<Issue>(`/api/v1/issues/${id}`)
      .then((response) => {
        setItem(response);
        setError(null);
        return fetchJson<MediaPhoto[]>(`/api/v1/issues/${id}/photos`);
      })
      .then((media) => setPhotos(media ?? []))
      .catch(() => setError('Závada nebyla nalezena.'));
  }, [id]);

  React.useEffect(() => {
    if (state !== 'default') return;
    loadIssue();
  }, [loadIssue, state]);

  const updateStatus = async (status: IssueStatus): Promise<void> => {
    if (!id) return;
    try {
      const updated = await fetchJson<Issue>(`/api/v1/issues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setItem(updated);
      if (canResolve && status === 'resolved') {
        window.location.assign('/zavady');
      }
    } catch {
      setError('Změna stavu závady selhala.');
    }
  };

  const deleteIssue = async (): Promise<void> => {
    if (!id) return;
    try {
      await fetchJson(`/api/v1/issues/${id}`, { method: 'DELETE' });
      window.location.assign('/zavady');
    } catch {
      setError('Smazání závady selhalo.');
    }
  };

  const timeline = item ? [
    { label: 'Vznik', value: formatDateTime(item.created_at) },
    { label: 'Otevřeno', value: hoursOpenSince(item.created_at) },
    ...(item.resolved_at ? [{ label: 'Odstraněno', value: formatDateTime(item.resolved_at) }] : []),
  ] : [];

  return (
    <main className="k-page" data-testid="issues-detail-page">
      {stateMarker}
      <h1>{canResolve ? 'Údržbářské úkoly' : 'Detail závady'}</h1><StateSwitcher />
      {stateUI ? stateUI : error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/zavady">Zpět na seznam</Link>} /> : item ? <div className="k-task-board"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">Zpět na seznam</Link>{canReopen && item.status === 'resolved' ? <button className="k-button" type="button" onClick={() => void updateStatus('new')}>Znovu otevřít</button> : null}{canDelete ? <button className="k-button secondary" type="button" onClick={() => void deleteIssue()}>Smazat</button> : null}</div><TaskBoardHero title={item.room_number ? `Pokoj ${item.room_number}` : item.location} description={item.description ?? item.title} date={formatTaskBoardDate(item.created_at)} time={formatTaskBoardTime(item.created_at)} openFor={hoursOpenSince(item.created_at)} imageSrc={photos[0] ? `/api/v1/issues/${item.id}/photos/${photos[0].id}/thumb` : null} imageAlt={`Fotografie závady ${item.description ?? item.title}`} actionLabel={canResolve && item.status !== 'resolved' ? 'Hotovo' : undefined} onAction={canResolve && item.status !== 'resolved' ? () => void updateStatus('resolved') : undefined} /><DataTable headers={['Položka', 'Hodnota']} rows={[[ 'Pokoj', item.room_number ?? '-'],[ 'Místo', item.location],[ 'Popis', item.description ?? item.title],[ 'Stav', issueStatusLabel(item.status)],[ 'Vznik', formatDateTime(item.created_at)],[ 'Otevřeno', hoursOpenSince(item.created_at)] ]} /><h2>Přehled</h2><Timeline entries={timeline} />{photos.length > 0 ? <div className="k-grid cards-3">{photos.map((photo) => <img key={photo.id} src={`/api/v1/issues/${item.id}/photos/${photo.id}/thumb`} alt={`Fotografie závady ${photo.id}`} className="k-photo-thumb" />)}</div> : null}</div> : <SkeletonPage />}
    </main>
  );
}


function InventoryList(): JSX.Element {
  const state = useViewState();
  const stateUI = stateViewForRoute(state, 'Skladové hospodářství', '/sklad');
  const stateMarker = <StateMarker state={state} />;
  const auth = useAuth();
  const actorRole = normalizeRole(auth?.activeRole ?? auth?.role ?? 'recepce');
  const isAdmin = actorRole === 'admin';
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [movementItemId, setMovementItemId] = React.useState<string>('');
  const [movementType, setMovementType] = React.useState<InventoryMovementType>('in');
  const [movementQuantity, setMovementQuantity] = React.useState<number>(1);
  const [movementDate, setMovementDate] = React.useState<string>(currentDateForTimeZone());
  const [movementReference, setMovementReference] = React.useState<string>('');
  const [movementNote, setMovementNote] = React.useState<string>('');
  const [movementInfo, setMovementInfo] = React.useState<string | null>(null);
  const [draftMovements, setDraftMovements] = React.useState<InventoryDraftMovement[]>([]);
  const [carouselIndex, setCarouselIndex] = React.useState<number>(0);

  const loadItems = React.useCallback(() => {
    fetchJson<InventoryItem[]>('/api/v1/inventory')
      .then((response) => {
        setItems(response);
        setError(null);
      })
      .catch(() => setError('Polo?ky skladu se nepoda?ilo na??st.'));
  }, []);

  React.useEffect(() => {
    if (state !== 'default') return;
    loadItems();
  }, [loadItems, state]);

  React.useEffect(() => {
    if (!movementItemId && items.length > 0) {
      setMovementItemId(String(items[0].id));
    }
  }, [items, movementItemId]);

  React.useEffect(() => {
    if (items.length === 0) {
      return;
    }
    const selectedIndex = Math.max(0, items.findIndex((item) => String(item.id) === movementItemId));
    setCarouselIndex(Math.max(0, Math.min(selectedIndex, Math.max(0, items.length - 1))));
  }, [items, movementItemId]);

  const downloadStocktakePdf = (): void => {
    window.open('/api/v1/inventory/stocktake/pdf', '_blank', 'noopener');
  };

  const selectedItem = React.useMemo(
    () => inventoryItemById(items, movementItemId),
    [items, movementItemId],
  );

  const visibleCarouselItems = React.useMemo(() => {
    if (items.length <= 5) {
      return items;
    }
    const start = Math.max(0, Math.min(carouselIndex - 2, items.length - 5));
    return items.slice(start, start + 5);
  }, [carouselIndex, items]);

  const draftSummary = React.useMemo(() => draftMovements.map((entry) => ({
    ...entry,
    item: inventoryItemById(items, entry.itemId),
  })), [draftMovements, items]);

  const moveCarousel = (direction: 'prev' | 'next'): void => {
    setCarouselIndex((prev) => {
      if (items.length === 0) {
        return 0;
      }
      return direction === 'prev' ? Math.max(0, prev - 1) : Math.min(items.length - 1, prev + 1);
    });
  };

  const addDraftMovement = (): void => {
    if (!selectedItem) {
      setError('Vyberte položku skladu.');
      return;
    }
    if (movementQuantity <= 0) {
      setError('Množství musí být větší než nula.');
      return;
    }
    setDraftMovements((prev) => [...prev, { itemId: selectedItem.id, quantity: movementQuantity }]);
    setMovementQuantity(1);
    setMovementInfo(null);
    setError(null);
  };

  const removeDraftMovement = (index: number): void => {
    setDraftMovements((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const submitMovement = async (): Promise<void> => {
    if (draftMovements.length === 0) {
      setError('Přidejte alespoň jednu položku do připravovaného pohybu.');
      return;
    }
    try {
      const results = await Promise.all(draftMovements.map((entry) => fetchJson<InventoryDetail>(`/api/v1/inventory/${entry.itemId}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movement_type: movementType,
          quantity: entry.quantity,
          document_date: movementDate,
          document_reference: movementReference || null,
          note: movementNote || null,
        }),
      })));
      const latestMovement = results
        .flatMap((response) => response.movements)
        .sort((left, right) => right.id - left.id)[0];
      setMovementInfo(latestMovement?.document_number
        ? `${inventoryMovementPanelLabels[movementType]} uložena. Interní číslo ${latestMovement.document_number}.`
        : `${inventoryMovementPanelLabels[movementType]} uložena.`);
      setMovementReference('');
      setMovementNote('');
      setDraftMovements([]);
      loadItems();
      setError(null);
    } catch {
      setError('Pohyb skladu se nepodařilo uložit.');
    }
  };

  const movementCard = items.length > 0 ? (
    <section className="k-stock-movement-panel">
      <div className="k-stock-movement-header">
        <div className="k-stock-movement-brand">
          <span className="k-stock-movement-logo">KÁJOVO</span>
          <span className="k-stock-movement-logo k-stock-movement-logo--hotel">Hotel</span>
        </div>
        <p className="k-stock-movement-kicker">Skladové hospodářství</p>
      </div>

      <div className="k-stock-movement-segments" role="tablist" aria-label="Druh pohybu">
        {(['in', 'out', 'adjust'] as InventoryMovementType[]).map((type) => (
          <button
            key={type}
            type="button"
            className={`k-stock-segment${movementType === type ? ' is-active' : ''}`}
            aria-pressed={movementType === type}
            onClick={() => setMovementType(type)}
          >
            {inventoryMovementPanelLabels[type]}
          </button>
        ))}
      </div>

      <div className="k-stock-carousel">
        <button className="k-stock-carousel-arrow" type="button" onClick={() => moveCarousel('prev')} aria-label="Předchozí zboží">‹</button>
        <div className="k-stock-carousel-track" role="list" aria-label="Výběr zboží">
          {visibleCarouselItems.map((item) => {
            const isSelected = String(item.id) === movementItemId;
            return (
              <button
                key={item.id}
                type="button"
                className={`k-stock-carousel-item${isSelected ? ' is-selected' : ''}`}
                onClick={() => setMovementItemId(String(item.id))}
              >
                <InventoryThumb item={item} size={isSelected ? 'detail' : 'list'} alt={`Miniatura ${item.name}`} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
        <button className="k-stock-carousel-arrow" type="button" onClick={() => moveCarousel('next')} aria-label="Další zboží">›</button>
      </div>

      <div className="k-stock-carousel-dots" aria-hidden="true">
        {items.slice(0, Math.min(items.length, 6)).map((item) => (
          <span key={`dot-${item.id}`} className={`k-stock-carousel-dot${String(item.id) === movementItemId ? ' is-active' : ''}`} />
        ))}
      </div>

      <div className="k-stock-movement-layout">
        <div className="k-stock-movement-primary">
          <div className="k-stock-selected-card">
            <div className="k-stock-selected-head">
              <span>Vyberte zboží:</span>
            </div>
            {selectedItem ? (
              <div className="k-stock-selected-row">
                <div className="k-stock-selected-item">
                  <InventoryThumb item={selectedItem} size="form" alt={`Vybrané zboží ${selectedItem.name}`} />
                  <div>
                    <strong>{selectedItem.name}</strong>
                    <p>{selectedItem.current_stock} skladem · minimum {selectedItem.min_stock}</p>
                  </div>
                </div>
                <button className="k-button" type="button" onClick={addDraftMovement}>Přidat</button>
              </div>
            ) : null}
          </div>

          <div className="k-stock-quantity-card">
            <FormField id="inventory_movement_quantity" label="Zadejte množství">
              <div className="k-stock-quantity-row">
                <input id="inventory_movement_quantity" type="number" min={1} className="k-input" value={movementQuantity} onChange={(event) => setMovementQuantity(Number(event.target.value))} />
                <button className="k-button" type="button" onClick={addDraftMovement}>Přidat</button>
              </div>
            </FormField>
          </div>

          <div className="k-stock-draft-card">
            <h3>{inventoryMovementLabel(movementType)} se připravuje…</h3>
            {draftSummary.length > 0 ? (
              <div className="k-stock-draft-list">
                {draftSummary.map((entry, index) => (
                  <div key={`draft-${entry.itemId}-${index}`} className="k-stock-draft-row">
                    <div className="k-stock-draft-item">
                      {entry.item ? <InventoryThumb item={entry.item} alt={`Položka ${entry.item.name}`} /> : null}
                      <strong>{entry.item?.name ?? `Položka ${entry.itemId}`}</strong>
                      <span>{entry.quantity} {entry.item?.unit ?? 'ks'}</span>
                    </div>
                    <button className="k-stock-delete" type="button" onClick={() => removeDraftMovement(index)} aria-label={`Odebrat ${entry.item?.name ?? 'položku'}`}>X</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="k-subtle">Zatím není přidaná žádná položka.</p>
            )}
          </div>
        </div>

        <div className="k-stock-movement-secondary">
          <div className="k-stock-document-card">
            <FormField id="inventory_movement_date" label="Datum">
              <input id="inventory_movement_date" type="date" className="k-input" value={movementDate} onChange={(event) => setMovementDate(event.target.value)} />
            </FormField>
            <FormField id="inventory_movement_reference" label="Číslo dokladu">
              <input id="inventory_movement_reference" className="k-input" value={movementReference} onChange={(event) => setMovementReference(event.target.value)} placeholder="PR-2024-001" />
            </FormField>
            <FormField id="inventory_movement_note" label="Poznámka (volitelné)">
              <input id="inventory_movement_note" className="k-input" value={movementNote} onChange={(event) => setMovementNote(event.target.value)} />
            </FormField>
            <button className="k-button k-stock-confirm" type="button" onClick={() => void submitMovement()}>
              Potvrdit {movementType === 'in' ? 'příjem' : movementType === 'out' ? 'výdej' : 'odpis'}
            </button>
          </div>
        </div>
      </div>

      {movementInfo ? <p className="k-text-success">{movementInfo}</p> : null}
    </section>
  ) : null;

  return (
    <main className="k-page" data-testid="inventory-list-page">
      {stateMarker}
      <h1>Skladové hospodářství</h1>
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

  React.useEffect(() => {
    if (state !== 'default') {
      return;
    }
    loadItems();
    loadCards();
    loadMovements();
  }, [loadCards, loadItems, loadMovements, state]);

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
          <div className="k-card">
            <h2>Ingredience</h2>
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

type AuthLoadState = { status: 'loading' } | ResolvedAuthState;

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

function AdminSurfaceRetiredPage(): JSX.Element {
  return (
    <main className="k-page" data-testid="admin-surface-retired-page">
      <StateView
        title="Admin je presunut do samostatne aplikace"
        description="Webovy runtime uz neobsahuje vlozeny admin panel. Pro administraci pouzijte dedikovanou admin aplikaci."
        stateKey="info"
        action={(
          <div className="k-toolbar">
            <a className="k-button" href="/admin/">Otevrit admin aplikaci</a>
            <Link className="k-button secondary" to="/login">Portal login</Link>
          </div>
        )}
      />
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

function PortalProfilePage(): JSX.Element {
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
      window.location.assign('/login');
    } catch {
      setError('Zmena hesla se nepodarila.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="k-page" data-testid="portal-profile-page">
      <h1>Muj profil</h1>
      {error ? <StateView title="Chyba" description={error} stateKey="error" action={<button className="k-button secondary" type="button" onClick={load}>Zkusit znovu</button>} /> : null}
      {message ? <StateView title="Info" description={message} stateKey="info" /> : null}
      {loading || profile === null ? <SkeletonPage /> : (
        <div className="k-grid cards-2">
          <Card title="Profil">
            <div className="k-form-grid">
              <FormField id="portal_profile_email" label="Email">
                <input id="portal_profile_email" className="k-input" value={profile.email} readOnly />
              </FormField>
              <FormField id="portal_profile_first_name" label="Jmeno">
                <input id="portal_profile_first_name" className="k-input" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </FormField>
              <FormField id="portal_profile_last_name" label="Prijmeni">
                <input id="portal_profile_last_name" className="k-input" value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </FormField>
              <FormField id="portal_profile_phone" label="Telefon">
                <input id="portal_profile_phone" className="k-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+420123456789" />
              </FormField>
              <FormField id="portal_profile_note" label="Poznamka">
                <textarea id="portal_profile_note" className="k-input" value={note} onChange={(event) => setNote(event.target.value)} />
              </FormField>
              <button className="k-button" type="button" onClick={() => void saveProfile()} disabled={saving}>Ulozit profil</button>
            </div>
          </Card>
          <Card title="Zmena hesla">
            <div className="k-form-grid">
              <FormField id="portal_profile_current_password" label="Aktualni heslo">
                <input id="portal_profile_current_password" className="k-input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </FormField>
              <FormField id="portal_profile_new_password" label="Nove heslo">
                <input id="portal_profile_new_password" className="k-input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </FormField>
              <button className="k-button" type="button" onClick={() => void changePassword()} disabled={saving || currentPassword.length < 8 || newPassword.length < 8}>Zmenit heslo</button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}

function AppRoutes(): JSX.Element {
  const location = useLocation();
  const [authState, setAuthState] = React.useState<AuthLoadState>({ status: 'loading' });

  const refreshAuth = React.useCallback(() => {
    void resolveAuthProfile().then(setAuthState);
  }, []);

  React.useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  if (authState.status === 'loading') {
    return <SkeletonPage />;
  }
  const auth = authState.status === 'authenticated' ? authState.profile : null;
  const testNav = qaRuntimeEnabled && typeof window !== 'undefined'
    ? (window as Window & { __KAJOVO_TEST_NAV__?: unknown }).__KAJOVO_TEST_NAV__
    : undefined;
  const injectedModules = Array.isArray((testNav as { modules?: unknown } | undefined)?.modules)
    ? ((testNav as { modules: typeof ia.modules }).modules ?? [])
    : [];
  const modules = [...ia.modules, ...injectedModules];

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route
          path="/admin/login"
          element={<AdminSurfaceRetiredPage />}
        />
        <Route
          path="/admin/*"
          element={
            authState.status === 'error'
              ? <AuthStatusPage description={authState.message} loginPath="/login" onRetry={refreshAuth} />
              : <AdminSurfaceRetiredPage />
          }
        />
        <Route
          path="/login"
          element={auth?.actorType === 'portal' ? <Navigate to="/" replace /> : <PortalLoginPage authError={authState.status === 'error' ? authState.message : null} />}
        />
        <Route
          path="*"
          element={
            authState.status === 'error' ? (
              <AuthStatusPage description={authState.message} loginPath="/login" onRetry={refreshAuth} />
            ) : auth?.actorType === 'portal' ? (
              <PortalRoutes
                currentPath={location.pathname}
                auth={auth}
                modules={modules}
                deps={{
                  Dashboard,
                  PortalProfilePage,
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
                  InventoryList: InventoryWorkbench,
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
            ) : auth?.actorType === 'admin' ? (
              <Navigate to="/admin/" replace />
            ) : (
              <Navigate to="/login" replace />
            )
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


