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
} from 'react-router-dom';
import ia from '../../kajovo-hotel/ux/ia.json';
import { Badge, Card, DataTable, DateNavigation, FormField, HousekeepingRooms, KajovoStartupSplash, SkeletonPage, StateView, Timeline } from '@kajovo/ui';
import {
  apiClient,
  attachWebActivity,
  getAuthBundle,
  getPortalLocale,
  t,
  tf,
  getIntlLocale,
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
import '@kajovo/ui/src/workspace.css';
import noGlutenIcon from './assets/diets/no-gluten.png';
import noMilkIcon from './assets/diets/no-milk.png';
import noPorkIcon from './assets/diets/no-pork.png';
import { canWriteModule, normalizeRole, resolveAuthProfile, type AuthProfile } from './rbac';
import { currentDateForTimeZone, currentDateTimeInputValue, currentMinutesForTimeZone, isoUtcToLocalDateTimeInput, localDateTimeInputToIsoUtc } from './lib/date';
import { AdminLoginPage } from './admin/AdminLoginPage';
import { AdminRoutes } from './admin/AdminRoutes';
import { PortalLoginPage } from './portal/PortalLoginPage';
import { PortalResetPasswordPage } from './portal/PortalResetPasswordPage';
import { PortalRoutes, requestRoleSelection } from './portal/PortalRoutes';

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

type BreakfastDailyOverview = {
  orders: BreakfastOrder[];
  summary: BreakfastSummary;
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

type HousekeepingDraftMode = 'issue' | 'lost_found';

class HttpError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail: unknown = null) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function localizeServerError(message: string, status: number): string {
  if (getPortalLocale() === 'cs') return message;
  const known = t(message);
  if (known !== message) return known;
  if (status === 401) return t('Přihlášení vypršelo. Přihlaste se znovu.');
  if (status === 403) return t('Nemáte oprávnění k této akci.');
  if (status === 404) return t('Požadovaný záznam nebyl nalezen.');
  if (status === 409) return t('Záznam se mezitím změnil. Obnovte stránku a zkuste to znovu.');
  if (status === 422) return t('Zkontrolujte zadané údaje.');
  return tf('Požadavek se nepodařilo zpracovat (HTTP {status}).', { status });
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
      if (typeof parsed.detail === 'string') {
        message = parsed.detail;
      } else if (Array.isArray(parsed.detail)) {
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
  return new HttpError(status, localizeServerError(message, status), detail);
}


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
  '203',
  '204',
  '205',
  '206',
  '207',
  '208',
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
  '201',
  '202',
  '209',
  '210',
  '221',
  '222',
  '223',
  '224',
  '321',
  '322',
  '323',
  '324',
];

type HousekeepingDraftPhoto = {
  name: string;
  type: string;
  lastModified: number;
  bytes: ArrayBuffer;
};

type HousekeepingDraftStorage = {
  key: string;
  mode: HousekeepingDraftMode;
  selectedRoom: string;
  description: string;
  photos: HousekeepingDraftPhoto[];
  updatedAt: string;
};

const HOUSEKEEPING_DRAFT_DB = 'kajovo-hotel-housekeeping';
const HOUSEKEEPING_DRAFT_STORE = 'housekeeping-drafts';
const HOUSEKEEPING_DRAFT_STORAGE_KEY = 'kajovo.housekeeping.quick-capture.v4';

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
            title={t("Chyba")}
            description={this.state.message ?? t('Aplikace narazila na neočekávanou chybu.')}
            stateKey="error"
            action={<button className="k-button" type="button" onClick={() => window.location.reload()}>{t("Obnovit")}</button>}
          />
        </main>
      );
    }
    return this.props.children;
  }
}

const defaultServiceDate = currentDateForTimeZone(new Date(), 'Europe/Prague');

function metricValue(value: number | null): string {
  return value === null ? '—' : String(value);
}


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
  return status ? t(statusLabels[status]) : '-';
}

function lostFoundStatusLabel(status: LostFoundStatus | null | undefined): string {
  return status ? t(lostFoundStatusLabels[status]) : '-';
}

const lostFoundTagLabels: Record<string, string> = {
  kontaktova: 'Kontaktová',
  nezastizen: 'Nezastižen',
  vyzvedne: 'Vyzvedne',
  odesleme: 'Odešleme',
};

function lostFoundTagLabel(tag: string): string {
  return t(lostFoundTagLabels[tag] ?? tag);
}

function lostFoundTypeLabel(itemType: LostFoundType | null | undefined): string {
  return itemType ? t(lostFoundTypeLabels[itemType]) : '-';
}

function issuePriorityLabel(priority: IssuePriority | null | undefined): string {
  return priority ? t(issuePriorityLabels[priority]) : '-';
}

function issueStatusLabel(status: IssueStatus | null | undefined): string {
  return status ? t(issueStatusLabels[status]) : '-';
}

function inventoryMovementLabel(movementType: InventoryMovementType | null | undefined): string {
  return movementType ? t(inventoryMovementLabels[movementType]) : '-';
}

function reportStatusLabel(status: string | null | undefined): string {
  if (status === 'open' || status === 'in_progress' || status === 'closed') {
    return t(reportStatusLabels[status]);
  }
  return status ?? '-';
}

function compareRoomNumbers(left: string, right: string): number {
  const leftMatch = left.match(/\d+/);
  const rightMatch = right.match(/\d+/);
  if (leftMatch && rightMatch) {
    const numericDiff = Number(leftMatch[0]) - Number(rightMatch[0]);
    if (numericDiff !== 0) {
      return numericDiff;
    }
  } else if (leftMatch) {
    return -1;
  } else if (rightMatch) {
    return 1;
  }
  return left.localeCompare(right, 'cs-CZ', { numeric: true, sensitivity: 'base' });
}

function prepareBreakfastListItems(items: BreakfastOrder[]): BreakfastOrder[] {
  return [...items]
    .filter((item) => item.guest_count > 0)
    .sort((left, right) => compareRoomNumbers(left.room_number, right.room_number));
}

type BreakfastOverviewStats = {
  totalBreakfasts: number;
  servedBreakfasts: number;
  remainingBreakfasts: number;
};

function buildBreakfastOverviewStats(items: BreakfastOrder[]): BreakfastOverviewStats {
  const totalBreakfasts = items.reduce((sum, item) => sum + item.guest_count, 0);
  const servedBreakfasts = items
    .filter((item) => item.status === 'served')
    .reduce((sum, item) => sum + item.guest_count, 0);
  return {
    totalBreakfasts,
    servedBreakfasts,
    remainingBreakfasts: Math.max(0, totalBreakfasts - servedBreakfasts),
  };
}

function readCsrfToken(): string {
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith('kajovo_csrf='))
    ?.split('=')[1] ?? '';
}

function hasAuthCookieHint(): boolean {
  return readCsrfToken().length > 0;
}

function normalizePhoneInput(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.startsWith('+')) {
    return trimmed;
  }
  if (trimmed.startsWith('00')) {
    return `+${trimmed.slice(2)}`;
  }
  if (/^\d+$/.test(trimmed)) {
    return trimmed.startsWith('420') ? `+${trimmed}` : `+420${trimmed}`;
  }
  return trimmed;
}

const e164PhoneRegex = /^\+[1-9]\d{1,14}$/;

async function normalizeHousekeepingPhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(t('Fotografii se nepodařilo připravit.')));
      element.src = objectUrl;
    });
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return file;
    }
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.86);
    });
    if (!blob) {
      return file;
    }
    const outputName = file.name.replace(/\.[^.]+$/, '') || 'housekeeping-photo';
    return new File([blob], `${outputName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canUseHousekeepingDraftStorage(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openHousekeepingDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!canUseHousekeepingDraftStorage()) {
      reject(new Error(t('IndexedDB není dostupné.')));
      return;
    }
    const request = window.indexedDB.open(HOUSEKEEPING_DRAFT_DB, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HOUSEKEEPING_DRAFT_STORE)) {
        database.createObjectStore(HOUSEKEEPING_DRAFT_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(t('Lokální úložiště pokojské se nepodařilo otevřít.')));
  });
}

async function readHousekeepingDraft(): Promise<HousekeepingDraftStorage | null> {
  if (!canUseHousekeepingDraftStorage()) {
    return null;
  }
  const database = await openHousekeepingDraftDatabase();
  return await new Promise((resolve, reject) => {
    const transaction = database.transaction(HOUSEKEEPING_DRAFT_STORE, 'readonly');
    const request = transaction.objectStore(HOUSEKEEPING_DRAFT_STORE).get(HOUSEKEEPING_DRAFT_STORAGE_KEY);
    request.onsuccess = () => {
      resolve((request.result as HousekeepingDraftStorage | undefined) ?? null);
      database.close();
    };
    request.onerror = () => {
      reject(request.error ?? new Error(t('Lokální koncept pokojské se nepodařilo načíst.')));
      database.close();
    };
  });
}

async function writeHousekeepingDraft(draft: HousekeepingDraftStorage): Promise<void> {
  if (!canUseHousekeepingDraftStorage()) {
    return;
  }
  const database = await openHousekeepingDraftDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(HOUSEKEEPING_DRAFT_STORE, 'readwrite');
    transaction.oncomplete = () => {
      resolve();
      database.close();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error(t('Lokální koncept pokojské se nepodařilo uložit.')));
      database.close();
    };
    transaction.objectStore(HOUSEKEEPING_DRAFT_STORE).put(draft);
  });
}

async function filesToHousekeepingDraftPhotos(files: File[]): Promise<HousekeepingDraftPhoto[]> {
  return await Promise.all(files.map(async (file) => ({
    name: file.name,
    type: file.type || 'image/jpeg',
    lastModified: file.lastModified,
    bytes: await file.arrayBuffer(),
  })));
}

function draftPhotoToFile(photo: HousekeepingDraftPhoto): File {
  return new File([photo.bytes], photo.name, {
    type: photo.type || 'image/jpeg',
    lastModified: photo.lastModified,
  });
}

function clearHousekeepingDraft(): void {
  if (!canUseHousekeepingDraftStorage()) {
    return;
  }
  void openHousekeepingDraftDatabase()
    .then((database) => {
      const transaction = database.transaction(HOUSEKEEPING_DRAFT_STORE, 'readwrite');
      transaction.objectStore(HOUSEKEEPING_DRAFT_STORE).delete(HOUSEKEEPING_DRAFT_STORAGE_KEY);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => database.close();
    })
    .catch(() => {
      console.warn('housekeeping.draft_clear_failed');
    });
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

  const directResponse = await fetch(path + url.search, {
    ...init,
    credentials: 'include',
  });
  if (!directResponse.ok) {
    throw await buildHttpError(directResponse);
  }
  if (directResponse.status === 204) {
    return undefined as T;
  }
  return (await directResponse.json()) as T;
}


function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString(getIntlLocale());
}

function formatShortDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString(getIntlLocale(), {
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
        <img src={src} alt={alt ?? tf('Miniatura položky {name}', { name: item.name })} />
      ) : (
        <span className="k-inventory-thumb-letter">{item.name.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}

type DietKey = 'diet_no_gluten' | 'diet_no_milk' | 'diet_no_pork';

const dietIconSources: Record<DietKey, string> = {
  diet_no_gluten: noGlutenIcon,
  diet_no_milk: noMilkIcon,
  diet_no_pork: noPorkIcon,
};

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

function DietIcon({ kind }: { kind: DietKey }): JSX.Element {
  return (
    <img className="k-diet-pictogram" src={dietIconSources[kind]} alt="" aria-hidden="true" />
  );
}

function Dashboard(): JSX.Element {
    const [todayCount, setTodayCount] = React.useState<number | null>(null);
  const [tomorrowCount, setTomorrowCount] = React.useState<number | null>(null);
  const [unresolvedIssuesCount, setUnresolvedIssuesCount] = React.useState<number | null>(null);
  const [unprocessedLostFoundCount, setUnprocessedLostFoundCount] = React.useState<number | null>(null);
  const [stockTotal, setStockTotal] = React.useState<number | null>(null);
  const [stockItemCount, setStockItemCount] = React.useState<number | null>(null);

  React.useEffect(() => {

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
  }, []);

  return (
    <main className="k-page" data-testid="dashboard-page">
      <h1>{t("Přehled")}</h1>
      {(
        <div className="k-grid cards-4 k-dashboard-cards">
          <Card title={t("Snídaně dnes a zítra")}>
            <strong>{metricValue(todayCount)}</strong>
            <p>{t("Zítra:")}{' '}{metricValue(tomorrowCount)}</p>
          </Card>
          <Card title={t("Neopravené závady")}>
            <strong>{metricValue(unresolvedIssuesCount)}</strong>
            <p>{t("Aktuálně otevřené závady")}</p>
          </Card>
          <Card title={t("Nezpracované nálezy")}>
            <strong>{metricValue(unprocessedLostFoundCount)}</strong>
            <p>{t("Položky čekající na zpracování")}</p>
          </Card>
          <Card title={t("Stav skladu")}>
            <strong>{metricValue(stockTotal)}</strong>
            <p>{t("Položek v evidenci:")}{' '}{metricValue(stockItemCount)}</p>
          </Card>
        </div>
      )}
    </main>
  );
}

function BreakfastList(): JSX.Element {
  const auth = useAuth();
  const actorRole = auth?.activeRole ?? auth?.role ?? null;
  const roles = (auth?.roles ?? []).map((role) => normalizeRole(role));
  const breakfastRole = normalizeRole('snidane');
  const isAdmin = actorRole === 'admin';
  const isRecepce = isAdmin || actorRole === 'recepce' || roles.includes('recepce');
  const isBreakfast = isAdmin || actorRole === breakfastRole || roles.includes(breakfastRole);
  const isServingView = actorRole === breakfastRole && !isRecepce && !isAdmin;
  const canReactivate = isRecepce || isAdmin;
  const canEditDiet = actorRole === 'recepce' || isAdmin;
  const today = currentDateForTimeZone(new Date(), 'Europe/Prague');
  const minutesNow = currentMinutesForTimeZone(new Date(), 'Europe/Prague');
  const canClearDay = isAdmin;

  const [serviceDate, setServiceDate] = React.useState(defaultServiceDate);
  const canServe = isAdmin || ((isBreakfast || isRecepce) && serviceDate === today && minutesNow >= 300 && minutesNow <= 660);
  const [items, setItems] = React.useState<BreakfastOrder[]>([]);
  const [summary, setSummary] = React.useState<BreakfastSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [saveInfo, setSaveInfo] = React.useState<string | null>(null);
  const [rangeDeleteFrom, setRangeDeleteFrom] = React.useState(serviceDate);
  const [rangeDeleteTo, setRangeDeleteTo] = React.useState(serviceDate);

  const breakfastRequestSequence = React.useRef(0);
  const displayedDate = React.useRef(serviceDate);
  displayedDate.current = serviceDate;
  const loadDay = React.useCallback((targetDate: string) => {
    const sequence = ++breakfastRequestSequence.current;
    let active = true;
    fetchJson<BreakfastDailyOverview>(`/api/v1/breakfast/daily-overview?service_date=${targetDate}`)
      .then(({ orders, summary: dailySummary }) => {
        if (!active || sequence !== breakfastRequestSequence.current || targetDate !== displayedDate.current) {
          return;
        }
        setItems(orders);
        setSummary(dailySummary);
        setError(null);
      })
      .catch(() => {
        if (!active || sequence !== breakfastRequestSequence.current || targetDate !== displayedDate.current) {
          return;
        }
        setError(t('Nepodařilo se načíst seznam snídaní.'));
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    setSaveInfo(null);
    const cleanup = loadDay(serviceDate);
    const refresh = () => { if (document.visibilityState === 'visible') loadDay(serviceDate); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      if (cleanup) cleanup();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadDay, serviceDate]);

  const visibleItems = React.useMemo(() => prepareBreakfastListItems(items), [items]);
  const mergeOrderWithDraft = (order: BreakfastOrder): BreakfastOrder => order;

  const effectiveVisibleItems = React.useMemo(
    () => visibleItems.map((item) => mergeOrderWithDraft(item)),
    [mergeOrderWithDraft, visibleItems],
  );
  const overviewStats = React.useMemo(
    () => buildBreakfastOverviewStats(effectiveVisibleItems),
    [effectiveVisibleItems],
  );

  const filteredItems = visibleItems;

  const updateOrder = async (order: BreakfastOrder, updates: Partial<BreakfastPayload>): Promise<BreakfastOrder> => {
    const updated = await fetchJson<BreakfastOrder>(`/api/v1/breakfast/${order.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setItems((prev) => prev.map((item) => (item.id === order.id ? updated : item)));
    return updated;
  };

  const saveOrderUpdates = (order: BreakfastOrder, updates: Partial<BreakfastPayload>, successMessage?: string): void => {
    setError(null);
    void updateOrder(order, updates)
      .then(() => {
        if (successMessage) setSaveInfo(successMessage);
      })
      .catch((saveError) => {
        setError(saveError instanceof Error ? saveError.message : t('Uložení změn snídaní selhalo.'));
      });
  };

  const dietBusy = React.useRef(false);
  const [dietSaving, setDietSaving] = React.useState(false);
  const [dietError, setDietError] = React.useState<string | null>(null);
  const toggleDiet = async (order: BreakfastOrder, reservation: NonNullable<BreakfastOrder['reservations']>[number], key: DietKey): Promise<void> => {
    if (!canEditDiet || dietBusy.current) return;
    dietBusy.current = true;
    setDietSaving(true);
    setDietError(null);
    try {
      await apiClient.updateReservationDietApiV1BreakfastOrderIdReservationsReservationIdDietPatch(order.id, reservation.reservation_id, {
        kind: key, enabled: !reservation[key], version: reservation.version,
      });
    } catch {
      setDietError(t('Dietu se nepodařilo uložit. Pobyt mohl mezitím změnit jiný uživatel; přehled se obnoví.'));
    } finally {
      if (displayedDate.current === serviceDate) loadDay(serviceDate);
      dietBusy.current = false;
      setDietSaving(false);
    }
  };

  const markServed = (order: BreakfastOrder): void => {
    const effectiveOrder = mergeOrderWithDraft(order);
    if (!canServe || effectiveOrder.status === 'served') {
      return;
    }
    saveOrderUpdates(order, { status: 'served' });
  };

  const reactivate = (order: BreakfastOrder): void => {
    const effectiveOrder = mergeOrderWithDraft(order);
    if (!canReactivate || effectiveOrder.status !== 'served') {
      return;
    }
    saveOrderUpdates(order, { status: 'pending' });
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
    const confirmed = window.confirm(tf('Opravdu chcete smazat všechny snídaně pro den {date}? Operaci nelze vrátit.', { date: serviceDate }));
    if (!confirmed) return;
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

  const clearPeriod = async (): Promise<void> => {
    if (!isAdmin) {
      return;
    }
    const confirmed = window.confirm(tf('Opravdu chcete smazat snídaně v období {from} až {to}? Operaci nelze vrátit.', { from: rangeDeleteFrom, to: rangeDeleteTo }));
    if (!confirmed) return;
    const csrf = readCsrfToken();
    await fetchJson<void>(`/api/v1/breakfast/period/delete?date_from=${encodeURIComponent(rangeDeleteFrom)}&date_to=${encodeURIComponent(rangeDeleteTo)}`, {
      method: 'DELETE',
      headers: csrf ? { 'x-csrf-token': csrf } : undefined,
    });
    setSaveInfo(tf('Smazáno období {from} až {to}.', { from: rangeDeleteFrom, to: rangeDeleteTo }));
    if (serviceDate >= rangeDeleteFrom && serviceDate <= rangeDeleteTo) {
      setItems([]);
      setSummary({
        service_date: serviceDate,
        total_orders: 0,
        total_guests: 0,
        status_counts: { pending: 0, preparing: 0, served: 0, cancelled: 0 },
      });
      return;
    }
    loadDay(serviceDate);
  };

  const renderDietToggles = (
    data: { diet_no_gluten?: boolean; diet_no_milk?: boolean; diet_no_pork?: boolean },
    onToggle: (key: DietKey) => void,
    disabled: boolean,
  ): JSX.Element => (
    <div className="k-diet-toggle-group">
      <DietToggleButton active={Boolean(data.diet_no_gluten)} label={t("Bez lepku")} disabled={disabled} onToggle={() => onToggle('diet_no_gluten')}>
        <DietIcon kind="diet_no_gluten" />
      </DietToggleButton>
      <DietToggleButton active={Boolean(data.diet_no_milk)} label={t("Bez laktózy")} disabled={disabled} onToggle={() => onToggle('diet_no_milk')}>
        <DietIcon kind="diet_no_milk" />
      </DietToggleButton>
      <DietToggleButton active={Boolean(data.diet_no_pork)} label={t("Bez vepřového")} disabled={disabled} onToggle={() => onToggle('diet_no_pork')}>
        <DietIcon kind="diet_no_pork" />
      </DietToggleButton>
    </div>
  );

  const renderReservationDiets = (item: BreakfastOrder): JSX.Element => <span>{(item.reservations ?? []).length ? item.reservations!.map((reservation) => <span className="k-breakfast-reservation-diets" key={reservation.reservation_id}>
    {item.reservations!.length > 1 ? <strong>{reservation.guest_name ?? `Pobyt ${reservation.reservation_id}`}</strong> : null}
    {renderDietToggles(reservation, (key) => void toggleDiet(item, reservation, key), !canEditDiet || dietSaving)}
    <small>{t("Pro celý pobyt")}{reservation.arrival && reservation.departure ? ` ${reservation.arrival} – ${reservation.departure}` : ''}</small>
  </span>) : <span title={t("Obnovte rezervace z Better Hotel API.")}>{t("Chybí vazba na pobyt")}</span>}</span>;

  const renderActiveDiets = (data: { diet_no_gluten?: boolean; diet_no_milk?: boolean; diet_no_pork?: boolean }): JSX.Element | null => {
    const active = [
      data.diet_no_gluten ? <span key="gluten" className="k-diet-icon k-diet-icon--active" title={t("Bezlepková strava")}><DietIcon kind="diet_no_gluten" /></span> : null,
      data.diet_no_milk ? <span key="milk" className="k-diet-icon k-diet-icon--active" title={t("Bez laktózy")}><DietIcon kind="diet_no_milk" /></span> : null,
      data.diet_no_pork ? <span key="pork" className="k-diet-icon k-diet-icon--active" title={t("Strava bez vepřového masa")}><DietIcon kind="diet_no_pork" /></span> : null,
    ].filter(Boolean);
    return active.length ? <span className="k-diet-toggle-group">{active}</span> : null;
  };

  const renderActionButton = (order: BreakfastOrder, effectiveItem: BreakfastOrder): JSX.Element => {
    if (effectiveItem.status === 'served') {
      if (canReactivate) {
        return <button className="k-button secondary" type="button" onClick={() => reactivate(order)}>{t("Vrátit výdej")}</button>;
      }
      return <button className="k-button secondary" type="button" disabled aria-pressed="true">{t("Vydáno")}</button>;
    }
    if (effectiveItem.status === 'cancelled') {
      return <button className="k-button secondary" type="button" disabled>{t("Zrušeno")}</button>;
    }
    return <button className="k-button" type="button" onClick={() => markServed(order)} disabled={!canServe}>{t("Vydat")}</button>;
  };

  const listItems = isServingView ? visibleItems : filteredItems;
  const guestDisplay = (order: BreakfastOrder): string => order.guest_names || order.guest_name || `${t('Pokoj')} ${order.room_number}`;
  const countryDisplay = (order: BreakfastOrder): string => order.country_code
    ? new Intl.DisplayNames([getIntlLocale()], { type: 'region' }).of(order.country_code) ?? order.country_code
    : '—';
  const breakfastImportStamp = summary?.source_imported_at
    ? formatShortDateTime(summary.source_imported_at)
    : 'nenalezeno';
  const breakfastToolbar = !isServingView ? <div className="k-toolbar">
    {isRecepce ? <a className="k-button secondary" href={`/api/v1/breakfast/export/daily?service_date=${encodeURIComponent(serviceDate)}`} target="_blank" rel="noopener noreferrer">{t('Export snídaní (PDF)')}</a> : null}
    {isAdmin ? <button className="k-button secondary" type="button" onClick={() => void reactivateAll()}>{t('Vrátit celý den')}</button> : null}
    {canClearDay ? <button className="k-button secondary danger" type="button" onClick={() => void clearDay()}>{t('Smazat den')}</button> : null}
  </div> : null;

  const compactServingList = (
    <div className="k-breakfast-serving-list" data-testid="breakfast-serving-mobile-list">
      {listItems.map((item) => {
        const effectiveItem = mergeOrderWithDraft(item);
        return (
          <article
            key={item.id}
            className={`k-breakfast-serving-row${effectiveItem.status === 'served' ? ' k-breakfast-serving-row--served' : ''}`}
            data-testid="breakfast-serving-mobile-row"
            data-room-number={effectiveItem.room_number}
          >
            <div className="k-breakfast-serving-row__main">
              <strong className="k-breakfast-serving-row__room" title={effectiveItem.room_number}>{effectiveItem.room_number}</strong>
              <span className="k-breakfast-serving-row__guest" title={guestDisplay(effectiveItem)}>{guestDisplay(effectiveItem)}</span>
              <span className="k-breakfast-serving-row__country">{countryDisplay(effectiveItem)}</span>
              <span className="k-breakfast-serving-row__count">{t('Snídaní')}: {effectiveItem.guest_count}</span>
              <span className="k-breakfast-serving-row__note-inline" title={effectiveItem.note ?? ''}>{effectiveItem.note || '—'}</span>
              <span className="k-breakfast-serving-row__diets">{renderActiveDiets(effectiveItem)}</span>
              <span className="k-breakfast-serving-row__action">{renderActionButton(item, effectiveItem)}</span>
            </div>
            {canEditDiet ? <details><summary>{t("Diety pobytu")}</summary>{renderReservationDiets(item)}</details> : null}
          </article>
        );
      })}
    </div>
  );

  return (
    <main className="k-page k-breakfast-serving-page" data-testid="breakfast-list-page">
      <h1>{t("Snídaně")}</h1>
      {error ? (
        <StateView title={t("Chyba")} description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>{t("Obnovit")}</button>} />
      ) : (
        <>
          <DateNavigation value={serviceDate} onChange={setServiceDate} />
          {isAdmin ? (
            <div className="k-toolbar">
              <input className="k-input" type="date" aria-label={t("Smazat období od")} value={rangeDeleteFrom} onChange={(event) => setRangeDeleteFrom(event.target.value)} />
              <input className="k-input" type="date" aria-label={t("Smazat období do")} value={rangeDeleteTo} onChange={(event) => setRangeDeleteTo(event.target.value)} />
              <button className="k-button secondary danger" type="button" onClick={() => void clearPeriod()} disabled={saveBusy}>{t("Smazat období")}</button>
            </div>
          ) : null}
          {saveInfo ? <p className="k-text-success">{saveInfo}</p> : null}
          {dietError ? <p className="k-text-error" role="alert">{dietError}</p> : null}
          {listItems.length === 0 ? (
            <StateView title={t("Prázdný stav")} description={isServingView ? t('Na vybraný den nejsou naplánované žádné snídaně.') : t('Nebyly nalezeny žádné objednávky.')} stateKey="empty" />
          ) : (
            <>
              {compactServingList}
              <DataTable
                headers={[t('Pokoj'), t('Ubytovaní'), t('Národnost'), t('Snídaní'), t('Diety'), t('Poznámka'), t('Akce')]}
                rows={listItems.map((item) => {
                  const effectiveItem = mergeOrderWithDraft(item);
                  const rowClass = effectiveItem.status === 'served' ? 'k-row-muted' : '';
                  const action = renderActionButton(item, effectiveItem);

                  if (isServingView) {
                    return [
                      <span className={rowClass}>{effectiveItem.room_number}</span>,
                      <span className={rowClass}>{guestDisplay(effectiveItem)}</span>,
                      <span className={rowClass}>{countryDisplay(effectiveItem)}</span>,
                      <span className={rowClass}>{effectiveItem.guest_count}</span>,
                      <span className={rowClass}>{renderActiveDiets(effectiveItem)}</span>,
                      <span className={rowClass}>{effectiveItem.note || '-'}</span>,
                      action,
                    ];
                  }

                  return [
                    <span className={rowClass}>{effectiveItem.room_number}</span>,
                    <span className={rowClass}>{guestDisplay(effectiveItem)}</span>,
                    <span className={rowClass}>{countryDisplay(effectiveItem)}</span>,
                    <span className={rowClass}>{effectiveItem.guest_count}</span>,
                    <span className={rowClass}>{renderReservationDiets(item)}</span>,
                    <span className={rowClass}>{effectiveItem.note || '-'}</span>,
                    action,
                  ];
                })}
              />
            </>
          )}
          <div className="k-grid cards-3">
            <Card title={t("Snídaní celkem")}><strong>{overviewStats.totalBreakfasts}</strong></Card>
            <Card title={t("Vydáno")}><strong>{overviewStats.servedBreakfasts}</strong></Card>
            <Card title={t("Zbývá vydat")}><strong>{overviewStats.remainingBreakfasts}</strong></Card>
          </div>
          <p className="k-text-muted k-breakfast-overview-updated-at">{t("Data aktualizována:")}{' '}{breakfastImportStamp}
          </p>
          {breakfastToolbar}

        </>
      )}
    </main>
  );
}

function BreakfastForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
    const navigate = useNavigate();
  const { id } = useParams();
  const [payload, setPayload] = React.useState<BreakfastPayload>({
    service_date: defaultServiceDate,
    room_number: '',
    guest_name: '',
    guest_count: 1,
    status: 'pending',
  });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (mode !== 'edit' || !id) {
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
        });
      })
      .catch(() => {
        setError(t('Objednávku se nepodařilo načíst.'));
      });
  }, [id, mode]);

  const save = async (): Promise<void> => {
    setError(null);
    const body: BreakfastPayload = payload;

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
      setError(t('Objednávku se nepodařilo uložit.'));
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'breakfast-create-page' : 'breakfast-edit-page'}>
      <h1>{mode === 'create' ? t('Nová snídaně') : t('Upravit snídani')}</h1>
      {error ? (
        <StateView title={t("Chyba")} description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>{t("Obnovit")}</button>} />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/snidane">{t("Zpět na seznam")}{' '}</Link>
            <button className="k-button" type="button" onClick={() => void save()}>{t("Uložit")}{' '}</button>
          </div>
          <div className="k-form-grid">
            <FormField id="service_date" label={t("Datum služby")}>
              <input
                id="service_date"
                type="date"
                className="k-input"
                value={payload.service_date}
                onChange={(event) => setPayload((prev) => ({ ...prev, service_date: event.target.value }))}
              />
            </FormField>
            <FormField id="room_number" label={t("Pokoj")}>
              <input
                id="room_number"
                className="k-input"
                value={payload.room_number}
                onChange={(event) => setPayload((prev) => ({ ...prev, room_number: event.target.value }))}
              />
            </FormField>
            <FormField id="guest_name" label={t("Host")}>
              <input
                id="guest_name"
                className="k-input"
                value={payload.guest_name}
                onChange={(event) => setPayload((prev) => ({ ...prev, guest_name: event.target.value }))}
              />
            </FormField>
            <FormField id="guest_count" label={t("Počet hostů")}>
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
            <FormField id="status" label={t("Stav")}>
              <select
                id="status"
                className="k-select"
                value={payload.status}
                onChange={(event) =>
                  setPayload((prev) => ({ ...prev, status: event.target.value as BreakfastStatus }))
                }
              >
                <option value="pending">{t("Čeká")}</option>
                <option value="preparing">{t("Připravuje se")}</option>
                <option value="served">{t("Vydáno")}</option>
                <option value="cancelled">{t("Zrušeno")}</option>
              </select>
            </FormField>
          </div>
        </div>
      )}
    </main>
  );
}

function BreakfastDetail(): JSX.Element {
    const { id } = useParams();
  const [item, setItem] = React.useState<BreakfastOrder | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id) {
      return;
    }

    fetchJson<BreakfastOrder>(`/api/v1/breakfast/${id}`)
      .then((order) => {
        setItem(order);
        setNotFound(false);
      })
      .catch(() => {
        setNotFound(true);
        setError(t('Objednávka nebyla nalezena.'));
      });
  }, [id]);

  return (
    <main className="k-page" data-testid="breakfast-detail-page">
      <h1>{t("Detail snídaně")}</h1>
      {notFound ? (
        <StateView title="404" description={error ?? t('Objednávka neexistuje.')} stateKey="404" action={<Link className="k-button secondary" to="/snidane">{t("Zpět na seznam")}</Link>} />
      ) : item ? (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/snidane">{t("Zpět na seznam")}{' '}</Link>
            <Link className="k-button" to={`/snidane/${item.id}/edit`}>{t("Upravit")}{' '}</Link>
          </div>
          <DataTable
            headers={[t('Položka'), t('Hodnota')]}
            rows={[
              [t('Datum služby'), item.service_date],
              [t('Pokoj'), item.room_number],
              [t('Host'), item.guest_name],
              [t('Počet hostů'), item.guest_count],
              [t('Stav'), breakfastStatusLabel(item.status)],
              [t('Poznámka'), item.note ?? '-'],
              [t('Bez lepku'), item.diet_no_gluten ? t('Ano') : t('Ne')],
              [t('Bez laktózy'), item.diet_no_milk ? t('Ano') : t('Ne')],
              [t('Bez vepřového'), item.diet_no_pork ? t('Ano') : t('Ne')],
              [t('Vytvořeno'), item.created_at ? formatDateTime(item.created_at) : '-'],
              [t('Aktualizováno'), item.updated_at ? formatDateTime(item.updated_at) : '-'],
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
  const auth = useAuth();
  const { search } = useLocation();
  const permissions = auth?.permissions ?? new Set<string>();
  const canCreateIssue = permissions.has('issues:write');
  const canCreateLostFound = permissions.has('lost_found:write');
  const canWriteRooms = permissions.has('housekeeping:write');
  const requestedView = new URLSearchParams(search).get('view');
  const activeView = requestedView === 'issue' && canCreateIssue ? 'issue'
    : requestedView === 'lost_found' && canCreateLostFound ? 'lost_found' : 'rooms';
  const [draftMode, setDraftMode] = React.useState<'issue' | 'lost_found'>('issue');
  const mode = activeView === 'rooms' ? draftMode : activeView;
  const [selectedRoom, setSelectedRoom] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [photos, setPhotos] = React.useState<File[]>([]);
  const [draftNotice, setDraftNotice] = React.useState<string>(t('Rozpracovaný záznam se ukládá lokálně v tomto zařízení, včetně nově pořízených fotek.'));
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [cameraReady, setCameraReady] = React.useState(false);
  const galleryInputRef = React.useRef<HTMLInputElement | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = React.useRef<MediaStream | null>(null);
  const restoredDraftRef = React.useRef(false);
  const photoPreviews = React.useMemo(
    () => photos.map((photo) => ({ name: photo.name, url: URL.createObjectURL(photo) })),
    [photos],
  );

  const clearDraftForm = React.useCallback(() => {
    setSelectedRoom('');
    setDescription('');
    setPhotos([]);
    setError(null);
    setCameraError(null);
    setCameraReady(false);
    clearHousekeepingDraft();
    setDraftNotice(t('Rozpracovaný záznam se ukládá lokálně v tomto zařízení, včetně nově pořízených fotek.'));
  }, []);

  const stopCamera = React.useCallback((): void => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
    setCameraReady(false);
    setCameraOpen(false);
  }, []);

  const resetForm = React.useCallback(() => {
    stopCamera();
    clearDraftForm();
    setSuccess(null);
  }, [clearDraftForm, stopCamera]);

  React.useEffect(() => {
    setSuccess(null);
    if (activeView !== 'rooms') setDraftMode(activeView);
  }, [activeView]);

  const updatePhotos = React.useCallback(async (files: File[], append: boolean): Promise<void> => {
    const normalized = await Promise.all(files.map((file) => normalizeHousekeepingPhoto(file)));
    setPhotos((current) => {
      const merged = append ? [...current, ...normalized] : normalized;
      if (merged.length > 3) {
        setError(t('Lze připojit nejvýše 3 fotografie.'));
        return merged.slice(0, 3);
      }
      setError((previous) => (previous === t('Lze připojit nejvýše 3 fotografie.') ? null : previous));
      return merged;
    });
  }, []);

  const onGalleryChange = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    await updatePhotos(Array.from(event.target.files ?? []), true);
    event.target.value = '';
  };

  const onCameraChange = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    await updatePhotos(Array.from(event.target.files ?? []), true);
    event.target.value = '';
  };

  const removePhoto = React.useCallback((index: number): void => {
    setPhotos((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setError((previous) => (previous === t('Lze připojit nejvýše 3 fotografie.') ? null : previous));
  }, []);

  const openNativeCamera = React.useCallback(async (): Promise<void> => {
    if (photos.length >= 3 || saving) {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t('Tento prohlížeč nepodporuje přímý kamerový náhled. Použijte systémové vyfocení.'));
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraError(null);
      setCameraOpen(true);
    } catch {
      setCameraError(t('Kamera není dostupná. Zkontrolujte oprávnění a zkuste to znovu.'));
      cameraInputRef.current?.click();
    }
  }, [photos.length, saving]);

  const capturePhoto = React.useCallback(async (): Promise<void> => {
    const video = cameraVideoRef.current;
    if (!video) {
      setCameraError(t('Náhled kamery ještě není připravený.'));
      return;
    }
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError(t('Snímek z kamery se nepodařilo zpracovat.'));
      return;
    }
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    });
    if (!blob) {
      setCameraError(t('Snímek z kamery se nepodařilo uložit.'));
      return;
    }
    const file = new File([blob], `housekeeping-${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
    await updatePhotos([file], true);
    stopCamera();
  }, [stopCamera, updatePhotos]);

  React.useEffect(() => {
    if (!cameraOpen || !cameraStreamRef.current || !cameraVideoRef.current) {
      return;
    }
    cameraVideoRef.current.srcObject = cameraStreamRef.current;
    void cameraVideoRef.current.play()
      .then(() => setCameraReady(true))
      .catch(() => setCameraError(t('Náhled kamery se nepodařilo spustit.')));
  }, [cameraOpen]);

  React.useEffect(() => {
    if (restoredDraftRef.current) {
      return;
    }
    restoredDraftRef.current = true;
    void readHousekeepingDraft()
      .then((draft) => {
        if (!draft) {
          return;
        }
        setDraftMode(draft.mode === 'lost_found' ? 'lost_found' : 'issue');
        setSelectedRoom(typeof draft.selectedRoom === 'string' ? draft.selectedRoom : '');
        setDescription(typeof draft.description === 'string' ? draft.description : '');
        if (Array.isArray(draft.photos) && draft.photos.length > 0) {
          setPhotos(draft.photos.slice(0, 3).map(draftPhotoToFile));
        }
        if (draft.updatedAt) {
          setDraftNotice(tf('Obnoven lokální koncept z {date}.', { date: formatDateTime(draft.updatedAt) }));
        }
      })
      .catch(() => {
        clearHousekeepingDraft();
      });
  }, []);

  React.useEffect(() => {
    const isEmpty = mode === 'issue' && selectedRoom === '' && description.trim() === '' && photos.length === 0;
    if (isEmpty) {
      clearHousekeepingDraft();
      setDraftNotice(t('Rozpracovaný záznam se ukládá lokálně v tomto zařízení, včetně nově pořízených fotek.'));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const draftPhotos = await filesToHousekeepingDraftPhotos(photos);
        if (cancelled) {
          return;
        }
        const payload: HousekeepingDraftStorage = {
          key: HOUSEKEEPING_DRAFT_STORAGE_KEY,
          mode,
          selectedRoom,
          description,
          photos: draftPhotos,
          updatedAt: new Date().toISOString(),
        };
        await writeHousekeepingDraft(payload);
        if (!cancelled) {
          setDraftNotice(t('Rozpracovaný záznam je uložený lokálně v tomto zařízení, včetně pořízených fotek.'));
        }
      } catch {
        console.warn('housekeeping.draft_persist_failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [description, mode, photos, selectedRoom]);

  React.useEffect(() => () => {
    stopCamera();
  }, [stopCamera]);

  React.useEffect(() => () => {
    photoPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [photoPreviews]);

  const submit = async (): Promise<void> => {
    const shortDescription = description.trim();
    const roomValue = selectedRoom.trim();
    if (mode === 'issue' && !canCreateIssue) {
      setError(t('Aktivní role nemá oprávnění pro založení závady.'));
      return;
    }
    if (mode === 'lost_found' && !canCreateLostFound) {
      setError(t('Aktivní role nemá oprávnění pro založení nálezu.'));
      return;
    }
    if (!roomValue) {
      setError('Vyberte pokoj.');
      return;
    }
    if (!shortDescription) {
      setError(t('Vyplňte krátký popis.'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let successReference = '';
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
            throw new Error(t('Fotografie závady se nepodařilo nahrát.'));
          }
        }
        successReference = `#${created.id}`;
      } else {
        const created = await fetchJson<LostFoundItem>('/api/v1/lost-found', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_type: 'found',
            category: t('Nález'),
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
            throw new Error(t('Fotografie nálezu se nepodařilo nahrát.'));
          }
        }
        successReference = `#${created.id}`;
      }
      stopCamera();
      clearDraftForm();
      setSuccess(tf('Úspěšně byl odeslán záznam {reference}.', { reference: successReference }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('Uložení záznamu selhalo.'));
    } finally {
      setSaving(false);
    }
  };

  if (!canCreateIssue && !canCreateLostFound) {
    return (
      <main className="k-page" data-testid="housekeeping-form-page">
        <h1>{t("Pokojská")}</h1>
        <StateView
          title={t("Přístup odepřen")}
          description={t("Aktivní role nemá oprávnění pro založení závady ani nálezu z toku pokojské.")}
          stateKey="error"
        />
      </main>
    );
  }

  if (success) {
    return (
      <main className="k-page" data-testid="housekeeping-form-page">
          <h1>{t("Pokojská")}</h1>
        {(
          <StateView
            title={t("Hotovo")}
            description={success}
            stateKey="empty"
            action={<button className="k-button" type="button" onClick={resetForm}>{t("Nový záznam")}</button>}
          />
        )}
      </main>
    );
  }

  return (
    <main className="k-page" data-testid="housekeeping-form-page">
      <h1>{t("Pokojská")}</h1>
      {activeView === 'rooms' ? <HousekeepingRooms canWrite={canWriteRooms} canManageAmenities={['admin', 'recepce'].includes(auth?.activeRole ?? auth?.role ?? '')} /> : (
        <div className="k-card k-card--compact">
          {error ? <p className="k-text-error">{error}</p> : null}
          <div className="k-form-grid">
            <FormField id="housekeeping_room" label={t("Pokoj")}>
              <div className="k-housekeeping-room-grid" role="group" aria-label={t("Výběr pokoje")}>
                {HOUSEKEEPING_ROOMS.map((room) => (
                  <button
                    key={room}
                    className={`k-housekeeping-room-grid__button${selectedRoom === room ? ' k-housekeeping-room-grid__button--active' : ''}`}
                    type="button"
                    onClick={() => setSelectedRoom(room)}
                    aria-pressed={selectedRoom === room}
                  >
                    {room}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField id="housekeeping_description" label={mode === 'issue' ? t('Krátký popis závady') : t('Krátký popis nálezu')}>
              <input id="housekeeping_description" className="k-input" maxLength={160} value={description} onChange={(event) => setDescription(event.target.value)} />
            </FormField>
            <FormField id="housekeeping_photos" label={t("Fotografie (max. 3)")}>
              <>
                <input ref={galleryInputRef} id="housekeeping_photos" type="file" className="k-input" multiple accept="image/*" onChange={onGalleryChange} hidden />
                <input ref={cameraInputRef} id="housekeeping_camera" type="file" className="k-input" accept="image/*" capture="environment" onChange={onCameraChange} hidden />
                <div className="k-toolbar">
                  <button className="k-button secondary" type="button" onClick={() => galleryInputRef.current?.click()} disabled={photos.length >= 3 || saving}>{t("Vybrat fotografie")}{' '}</button>
                  <button className="k-button secondary" type="button" onClick={() => void openNativeCamera()} disabled={photos.length >= 3 || saving}>{t("Otevřít kameru")}{' '}</button>
                  <button className="k-button secondary" type="button" onClick={() => cameraInputRef.current?.click()} disabled={photos.length >= 3 || saving}>{t("Vyfotit systémově")}{' '}</button>
                </div>
                <p className="k-subtle">{draftNotice}</p>
                {cameraError ? <p className="k-text-error">{cameraError}</p> : null}
              </>
            </FormField>
            {cameraOpen ? (
              <div className="k-housekeeping-camera">
                <div className="k-housekeeping-camera__preview">
                  <video ref={cameraVideoRef} autoPlay playsInline muted />
                </div>
                <div className="k-toolbar">
                  <button className="k-button" type="button" onClick={() => void capturePhoto()} disabled={!cameraReady || saving}>{t("Pořídit snímek")}{' '}</button>
                  <button className="k-button secondary" type="button" onClick={stopCamera} disabled={saving}>{t("Zavřít kameru")}{' '}</button>
                </div>
              </div>
            ) : null}
            {photos.length > 0 ? (
              <div className="k-housekeeping-photos">
                <p className="k-subtle">{t("Vybráno fotografií:")}{' '}{photos.length}</p>
                <div className="k-housekeeping-photos__grid">
                  {photoPreviews.map((photo, index) => (
                    <figure key={`${photo.name}-${index}`} className="k-housekeeping-photo-card">
                      <img src={photo.url} alt={tf('Fotografie záznamu {number}', { number: index + 1 })} className="k-housekeeping-photo-card__image" />
                      <figcaption className="k-housekeeping-photo-card__caption">
                        <span>{photo.name || `Fotografie ${index + 1}`}</span>
                        <button className="k-button secondary" type="button" onClick={() => removePhoto(index)} disabled={saving}>{t("Odebrat")}{' '}</button>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="k-toolbar">
            <button className="k-button" type="button" onClick={() => void submit()} disabled={saving}>{t("Odeslat")}{' '}</button>
            <button className="k-button secondary" type="button" onClick={resetForm} disabled={saving}>{t("Vyčistit")}{' '}</button>
          </div>
        </div>
      )}
    </main>
  );
}

function LostFoundList(): JSX.Element {
    const auth = useAuth();
  const activeRole = auth?.activeRole ?? auth?.role ?? null;
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
      .catch(() => setError(t('Nepodařilo se načíst nálezy.')));
  }, [isReception, statusFilter]);

  React.useEffect(() => {
    loadItems();
  }, [loadItems]);

  const markProcessed = async (itemId: number): Promise<void> => {
    try {
      await fetchJson<LostFoundItem>(`/api/v1/lost-found/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'claimed' }),
      });
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch {
      setError(t('Označení nálezu jako zpracovaného selhalo.'));
    }
  };

  return (
    <main className="k-page" data-testid="lost-found-list-page">
      <h1>{isReception ? t('Nálezy pro recepci') : t('Ztráty a nálezy')}</h1>
      {error ? (
        <StateView title={t("Chyba")} description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => void loadItems()}>{t("Obnovit")}</button>} />
      ) : items.length === 0 ? (
        <StateView title={isReception ? t('Čekající nálezy') : t('Prázdný stav')} description={isReception ? t('Žádný čekající nález pro recepci.') : t('Žádný evidovaný nález.')} stateKey="empty" action={<Link className="k-button" to="/ztraty-a-nalezy/novy">{t("Přidat záznam")}</Link>} />
      ) : (
        <>
          <div className="k-toolbar">
            {!isReception ? (
              <select className="k-select" aria-label={t("Filtr stavu")} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | LostFoundStatus)}>
                <option value="all">{t("Všechny stavy")}</option>
                <option value="new">{t("Nezpracováno")}</option>
                <option value="claimed">{t("Zpracováno")}</option>
              </select>
            ) : null}
            <Link className="k-button" to="/ztraty-a-nalezy/novy">{t("Nový záznam")}</Link>
          </div>
          <DataTable
            headers={isReception ? [t('Miniatura'), t('Pokoj'), t('Popis'), t('Vznik'), t('Akce')] : [t('Stav'), t('Pokoj'), t('Popis'), t('Vznik'), t('Akce')]}
            rows={items.map((item) => (isReception
              ? [
                  item.photos && item.photos.length > 0 ? <img key={`thumb-${item.id}`} src={`/api/v1/lost-found/${item.id}/photos/${item.photos[0].id}/thumb`} alt={t("Miniatura nálezu")} className="k-photo-thumb" /> : '-',
                  item.room_number ?? '-',
                  item.description,
                  formatShortDateTime(item.event_at),
                  <div className="k-inline-links" key={`actions-${item.id}`}><Link className="k-nav-link" to={`/ztraty-a-nalezy/${item.id}`}>{t("Detail")}</Link><button className="k-button" type="button" onClick={() => void markProcessed(item.id)}>{t("Zpracováno")}</button></div>,
                ]
              : [
                  lostFoundStatusLabel(item.status),
                  item.room_number ?? '-',
                  item.description,
                  formatShortDateTime(item.event_at),
                  <Link className="k-nav-link" key={item.id} to={`/ztraty-a-nalezy/${item.id}`}>{t("Detail")}</Link>,
                ]))}
          />
        </>
      )}
    </main>
  );
}

function LostFoundForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
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
    if (mode !== 'edit' || !id) {
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
      .catch(() => setError(t('Položku se nepodařilo načíst.')));
  }, [id, mode]);

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
      setError(t('Položku se nepodařilo uložit.'));
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'lost-found-create-page' : 'lost-found-edit-page'}>
      <h1>{mode === 'create' ? t('Nová položka') : t('Upravit položku')}</h1>
      {error ? (
        <StateView title={t("Chyba")} description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>{t("Obnovit")}</button>} />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/ztraty-a-nalezy">{t("Zpět na seznam")}{' '}</Link>
            <button className="k-button" type="button" onClick={() => void save()}>{t("Uložit")}{' '}</button>
          </div>
          <div className="k-form-grid">
            <FormField id="item_type" label={t("Typ záznamu")}>
              <select
                id="item_type"
                className="k-select"
                value={payload.item_type}
                onChange={(event) => setPayload((prev) => ({ ...prev, item_type: event.target.value as LostFoundType }))}
              >
                <option value="found">{t("Nalezeno")}</option>
                <option value="lost">{t("Ztraceno")}</option>
              </select>
            </FormField>
            <FormField id="category" label={t("Kategorie")}>
              <input
                id="category"
                className="k-input"
                value={payload.category}
                onChange={(event) => setPayload((prev) => ({ ...prev, category: event.target.value }))}
              />
            </FormField>
            <FormField id="location" label={t("Místo nálezu/ztráty")}>
              <input
                id="location"
                className="k-input"
                value={payload.location}
                onChange={(event) => setPayload((prev) => ({ ...prev, location: event.target.value }))}
              />
            </FormField>
            <FormField id="room_number" label={t("Číslo pokoje (volitelné)")}>
              <input
                id="room_number"
                className="k-input"
                value={payload.room_number ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, room_number: event.target.value }))}
              />
            </FormField>
            <FormField id="event_at" label={t("Datum a čas")}>
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
            <FormField id="status" label={t("Stav workflow")}>
              <select
                id="status"
                className="k-select"
                value={payload.status}
                onChange={(event) =>
                  setPayload((prev) => ({ ...prev, status: event.target.value as LostFoundStatus }))
                }
              >
                <option value="new">{t("Nový")}</option>
                <option value="stored">{t("Uskladněno")}</option>
                <option value="disposed">{t("Zlikvidovat")}</option>
                <option value="claimed">{t("Nárokováno")}</option>
                <option value="returned">{t("Vráceno")}</option>
              </select>
            </FormField>
            <FormField id="tags" label={t("Tagy")}>
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
            <FormField id="description" label={t("Popis položky")}>
              <textarea
                id="description"
                className="k-textarea"
                rows={3}
                value={payload.description}
                onChange={(event) => setPayload((prev) => ({ ...prev, description: event.target.value }))}
              />
            </FormField>
            <FormField id="claimant_name" label={t("Jméno nálezce/žadatele (volitelné)")}>
              <input
                id="claimant_name"
                className="k-input"
                value={payload.claimant_name ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, claimant_name: event.target.value }))}
              />
            </FormField>
            <FormField id="claimant_contact" label={t("Kontakt (volitelné)")}>
              <input
                id="claimant_contact"
                className="k-input"
                value={payload.claimant_contact ?? ''}
                onChange={(event) => setPayload((prev) => ({ ...prev, claimant_contact: event.target.value }))}
              />
            </FormField>
            <FormField id="handover_note" label={t("Předávací záznam (volitelné)")}>
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
    const { id } = useParams();
  const [item, setItem] = React.useState<LostFoundItem | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const auth = useAuth();
  const activeRole = auth?.activeRole ?? auth?.role ?? null;
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
      .catch(() => setError(t('Položka nebyla nalezena.')));
  }, [id]);

  React.useEffect(() => {
    loadItem();
  }, [loadItem]);

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
      setError(t('Změna stavu nálezu selhala.'));
    }
  };

  const deleteItem = async (): Promise<void> => {
    if (!id) return;
    const confirmed = window.confirm(t('Opravdu chcete smazat tento nález? Záznam zmizí ze seznamu nálezů a operaci nelze vrátit.'));
    if (!confirmed) return;
    try {
      await fetchJson(`/api/v1/lost-found/${id}`, { method: 'DELETE' });
      window.location.assign('/ztraty-a-nalezy');
    } catch {
      setError(t('Smazání položky selhalo.'));
    }
  };

  return (
    <main className="k-page" data-testid="lost-found-detail-page">
      <h1>{t("Detail nálezu")}</h1>
      {error ? <StateView title="404" description={error} /> : item ? (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/ztraty-a-nalezy">{t("Zpět na seznam")}</Link>
            {canProcess ? <button className="k-button" type="button" onClick={() => void setWorkflowStatus('claimed')}>{t("Označit jako zpracováno")}</button> : null}
            <Link className="k-button" to={`/ztraty-a-nalezy/${item.id}/edit`}>{t("Upravit")}</Link>
            {canAdmin && item.status !== 'new' ? <button className="k-button" type="button" onClick={() => void setWorkflowStatus('new')}>{t("Vrátit do nezpracovaných")}</button> : null}
            {canAdmin ? <button className="k-button secondary danger" type="button" onClick={() => void deleteItem()}>{t("Smazat")}</button> : null}
          </div>
          <DataTable
            headers={[t('Položka'), t('Hodnota')]}
            rows={[
              [t('Pokoj'), item.room_number ?? '-'],
              [t('Místo'), item.location],
              [t('Popis'), item.description],
              [t('Vznik'), formatDateTime(item.event_at)],
              [t('Stav'), lostFoundStatusLabel(item.status)],
            ]}
          />
          {item.photos && item.photos.length > 0 ? <div className="k-grid cards-3">{item.photos.map((photo) => <img key={photo.id} src={`/api/v1/lost-found/${item.id}/photos/${photo.id}/thumb`} alt={tf('Fotografie nálezu {id}', { id: photo.id })} className="k-photo-thumb" />)}</div> : null}
        </div>
      ) : <SkeletonPage />}
    </main>
  );
}


function IssuesList(): JSX.Element {
    const auth = useAuth();
  const activeRole = auth?.activeRole ?? auth?.role ?? null;
  const isMaintenance = normalizeRole(activeRole) === normalizeRole('udrzba');
  const isAdmin = activeRole === 'admin';
  const [items, setItems] = React.useState<Issue[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<'all' | IssueStatus>(isMaintenance ? 'new' : 'all');
  const [error, setError] = React.useState<string | null>(null);

  const loadItems = React.useCallback(() => {
    const params = new URLSearchParams();
    if (!isMaintenance && statusFilter !== 'all') {
      params.set('status', statusFilter);
    }
    const query = params.toString();
    fetchJson<Issue[]>(query ? `/api/v1/issues?${query}` : '/api/v1/issues')
      .then((response) => {
        setItems(response.filter((item) => (isMaintenance ? item.status !== 'resolved' && item.status !== 'closed' : true)));
        setError(null);
      })
      .catch(() => setError(t('Nepodařilo se načíst seznam závad.')));
  }, [isMaintenance, statusFilter]);

  React.useEffect(() => {
    loadItems();
  }, [loadItems]);

  const markResolved = async (issueId: number): Promise<void> => {
    try {
      await fetchJson<Issue>(`/api/v1/issues/${issueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      setItems((prev) => prev.filter((item) => item.id !== issueId));
    } catch {
      setError(t('Označení závady jako odstraněné selhalo.'));
    }
  };

  return (
    <main className="k-page" data-testid="issues-list-page">
      <h1>{isMaintenance ? t('Závady pro údržbu') : t('Závady')}</h1>
      {error ? <StateView title={t("Chyba")} description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => void loadItems()}>{t("Obnovit")}</button>} /> : items.length === 0 ? (
        <StateView title={t("Prázdný stav")} description={isMaintenance ? t('Žádná otevřená závada.') : t('Zatím nejsou evidované žádné závady.')} stateKey="empty" action={<Link className="k-button" to="/zavady/nova">{t("Nahlásit závadu")}</Link>} />
      ) : isMaintenance ? (
        <DataTable
          headers={[t('Miniatura'), t('Pokoj'), t('Popis'), t('Zadáno'), t('Hodin'), t('Akce')]}
          rows={items.map((item) => [
            item.photos && item.photos.length > 0
              ? <img key={`issue-thumb-${item.id}`} src={`/api/v1/issues/${item.id}/photos/${item.photos[0].id}/thumb`} alt={t("Miniatura závady")} className="k-photo-thumb k-issue-list-thumb-mobile" />
              : '-',
            item.room_number ?? '-',
            item.description ?? item.title,
            formatDateTime(item.created_at),
            hoursOpenSince(item.created_at),
            <button className="k-button" type="button" key={`issue-actions-${item.id}`} onClick={() => void markResolved(item.id)}>{t("Opraveno")}</button>,
          ])}
        />
      ) : (
        <>
          <div className="k-toolbar">
            <select className="k-select" aria-label={t("Filtr stavu")} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | IssueStatus)}>
              <option value="all">{t("Všechny stavy")}</option>
              <option value="new">{t("Otevřené")}</option>
              <option value="resolved">{t("Odstraněné")}</option>
            </select>
            <Link className="k-button" to="/zavady/nova">{t("Nová závada")}</Link>
          </div>
          <DataTable headers={[t('Stav'), t('Pokoj'), t('Popis'), t('Vznik'), t('Otevřeno'), t('Akce')]} rows={items.map((item) => [
            issueStatusLabel(item.status), item.room_number ?? '-', item.description ?? item.title, formatShortDateTime(item.created_at), hoursOpenSince(item.created_at),
            <Link className="k-nav-link" key={item.id} to={`/zavady/${item.id}`}>{t("Detail")}</Link>,
          ])} />
        </>
      )}
    </main>
  );
}

function IssuesForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
    const { id } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = React.useState<IssuePayload>({
    title: '', description: '', location: '', room_number: '', priority: 'medium', status: 'new', assignee: '',
  });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (mode !== 'edit' || !id) return;
    fetchJson<Issue>(`/api/v1/issues/${id}`).then((item) => setPayload({
      title: item.title, description: item.description ?? '', location: item.location, room_number: item.room_number ?? '', priority: item.priority, status: item.status, assignee: item.assignee ?? '',
    })).catch(() => setError(t('Závadu se nepodařilo načíst.')));
  }, [id, mode]);

  const save = async (): Promise<void> => {
    try {
      const saved = await fetchJson<Issue>(mode === 'create' ? '/api/v1/issues' : `/api/v1/issues/${id}`, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, description: payload.description || null, room_number: payload.room_number || null, assignee: payload.assignee || null }),
      });
      navigate(`/zavady/${saved.id}`);
    } catch { setError(t('Závadu se nepodařilo uložit.')); }
  };

  return <main className="k-page" data-testid={mode === 'create' ? 'issues-create-page' : 'issues-edit-page'}><h1>{mode === 'create' ? t('Nová závada') : t('Upravit závadu')}</h1>{error ? <StateView title={t("Chyba")} description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>{t("Obnovit")}</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">{t("Zpět na seznam")}</Link><button className="k-button" type="button" onClick={() => void save()}>{t("Uložit")}</button></div><div className="k-form-grid">
<FormField id="issue_title" label={t("Název")}><input id="issue_title" className="k-input" value={payload.title} onChange={(e) => setPayload((prev) => ({ ...prev, title: e.target.value }))} /></FormField>
<FormField id="issue_location" label={t("Lokalita")}><input id="issue_location" className="k-input" value={payload.location} onChange={(e) => setPayload((prev) => ({ ...prev, location: e.target.value }))} /></FormField>
<FormField id="issue_room_number" label={t("Pokoj (volitelné)")}><input id="issue_room_number" className="k-input" value={payload.room_number ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, room_number: e.target.value }))} /></FormField>
<FormField id="issue_priority" label={t("Priorita")}><select id="issue_priority" className="k-select" value={payload.priority} onChange={(e) => setPayload((prev) => ({ ...prev, priority: e.target.value as IssuePriority }))}><option value="low">{t("Nízká")}</option><option value="medium">{t("Střední")}</option><option value="high">{t("Vysoká")}</option><option value="critical">{t("Kritická")}</option></select></FormField>
<FormField id="issue_status" label={t("Stav")}><select id="issue_status" className="k-select" value={payload.status} onChange={(e) => setPayload((prev) => ({ ...prev, status: e.target.value as IssueStatus }))}><option value="new">{t("Nová")}</option><option value="in_progress">{t("V řešení")}</option><option value="resolved">{t("Vyřešena")}</option><option value="closed">{t("Uzavřena")}</option></select></FormField>
<FormField id="issue_assignee" label={t("Přiřazeno (volitelné)")}><input id="issue_assignee" className="k-input" value={payload.assignee ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, assignee: e.target.value }))} /></FormField>
<FormField id="issue_description" label={t("Popis")}><textarea id="issue_description" className="k-textarea" rows={3} value={payload.description ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} /></FormField>
</div></div>}</main>;
}

function IssuesDetail(): JSX.Element {
    const { id } = useParams();
  const [item, setItem] = React.useState<Issue | null>(null);
  const [photos, setPhotos] = React.useState<MediaPhoto[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const auth = useAuth();
  const activeRole = auth?.activeRole ?? auth?.role ?? null;
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
      .catch(() => setError(t('Závada nebyla nalezena.')));
  }, [id]);

  React.useEffect(() => {
    loadIssue();
  }, [loadIssue]);

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
      setError(t('Změna stavu závady selhala.'));
    }
  };

  const deleteIssue = async (): Promise<void> => {
    if (!id) return;
    const confirmed = window.confirm(t('Opravdu chcete smazat tuto závadu? Záznam a připojené informace se odstraní a operaci nelze vrátit.'));
    if (!confirmed) return;
    try {
      await fetchJson(`/api/v1/issues/${id}`, { method: 'DELETE' });
      window.location.assign('/zavady');
    } catch {
      setError(t('Smazání závady selhalo.'));
    }
  };

  const timeline = item ? [
    { label: 'Vznik', value: formatDateTime(item.created_at) },
    { label: t('Otevřeno'), value: hoursOpenSince(item.created_at) },
    ...(item.resolved_at ? [{ label: t('Odstraněno'), value: formatDateTime(item.resolved_at) }] : []),
  ] : [];

  return (
    <main className="k-page" data-testid="issues-detail-page">
      <h1>{t("Detail závady")}</h1>
      {error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/zavady">{t("Zpět na seznam")}</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/zavady">{t("Zpět na seznam")}</Link>{canResolve && item.status !== 'resolved' ? <button className="k-button" type="button" onClick={() => void updateStatus('resolved')}>{t("Odstraněno")}</button> : null}{canReopen && item.status === 'resolved' ? <button className="k-button" type="button" onClick={() => void updateStatus('new')}>{t("Znovu otevřít")}</button> : null}{canDelete ? <button className="k-button secondary danger" type="button" onClick={() => void deleteIssue()}>{t("Smazat")}</button> : null}</div><DataTable headers={[t('Položka'), t('Hodnota')]} rows={[[ t('Pokoj'), item.room_number ?? '-'],[ t('Místo'), item.location],[ t('Přiřazeno'), item.assignee ?? '-'],[ t('Popis'), item.description ?? item.title],[ t('Stav'), issueStatusLabel(item.status)],[ t('Vznik'), formatDateTime(item.created_at)],[ t('Otevřeno'), hoursOpenSince(item.created_at)] ]} /><h2>{t("Přehled")}</h2><Timeline entries={timeline} />{photos.length > 0 ? <div className="k-grid cards-3">{photos.map((photo) => <img key={photo.id} src={`/api/v1/issues/${item.id}/photos/${photo.id}/thumb`} alt={tf('Fotografie závady {id}', { id: photo.id })} className="k-photo-thumb" />)}</div> : null}</div> : <SkeletonPage />}
    </main>
  );
}


function InventoryList(): JSX.Element {
    const auth = useAuth();
  const actorRole = auth?.activeRole ?? auth?.role ?? null;
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
  const [savingMovement, setSavingMovement] = React.useState(false);

  const loadItems = React.useCallback(() => {
    fetchJson<InventoryItem[]>('/api/v1/inventory')
      .then((response) => {
        setItems(response);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('Položky skladu se nepodařilo načíst.')));
  }, []);

  React.useEffect(() => {
    loadItems();
  }, [loadItems]);

  React.useEffect(() => {
    if (!movementItemId && items.length > 0) {
      setMovementItemId(String(items[0].id));
    }
  }, [items, movementItemId]);

  const downloadStocktakePdf = (): void => {
    window.open('/api/v1/inventory/stocktake/pdf', '_blank', 'noopener');
  };

  const submitMovement = async (): Promise<void> => {
    const selectedItem = items.find((item) => String(item.id) === movementItemId);
    setMovementInfo(null);
    if (!selectedItem) {
      setError(t('Vyberte položku skladu.'));
      return;
    }
    if (!Number.isInteger(movementQuantity) || movementQuantity <= 0) {
      setError(t('Množství musí být celé číslo větší než nula.'));
      return;
    }
    if (!movementDate) {
      setError(t('Vyplňte datum dokladu.'));
      return;
    }
    if (movementType === 'in' && movementReference.trim().length === 0) {
      setError(t('U příjmu vyplňte číslo dokladu.'));
      return;
    }
    if ((movementType === 'out' || movementType === 'adjust') && movementQuantity > selectedItem.current_stock) {
      setError(t('Množství nelze vydat ani odepsat, protože je vyšší než aktuální skladový stav.'));
      return;
    }
    setSavingMovement(true);
    try {
      const response = await fetchJson<InventoryDetail>(`/api/v1/inventory/${movementItemId}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movement_type: movementType,
          quantity: movementQuantity,
          document_date: movementDate,
          document_reference: movementReference.trim() || null,
          note: movementNote.trim() || null,
        }),
      });
      const latestMovement = [...response.movements].sort((left, right) => right.id - left.id)[0];
      setItems((prev) => prev.map((item) => (item.id === response.id ? { ...item, current_stock: response.current_stock } : item)));
      setMovementInfo(latestMovement?.document_number
        ? tf('Pohyb uložen. Interní číslo {number}.', { number: latestMovement.document_number })
        : t('Pohyb uložen.'));
      setMovementQuantity(1);
      setMovementReference('');
      setMovementNote('');
      loadItems();
      setError(null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('Pohyb skladu se nepodařilo uložit.'));
    } finally {
      setSavingMovement(false);
    }
  };

  const movementCard = items.length > 0 ? (
    <div className="k-card">
      <h2>{t("Nový pohyb skladu")}</h2>
      <div className="k-form-grid">
        <FormField id="inventory_movement_type" label={t("Druh pohybu *")}>
          <select id="inventory_movement_type" className="k-select" value={movementType} onChange={(event) => setMovementType(event.target.value as InventoryMovementType)}>
            <option value="in">{t("Příjem")}</option>
            <option value="out">{t("Výdej")}</option>
            <option value="adjust">{t("Odpis")}</option>
          </select>
        </FormField>
        <FormField id="inventory_movement_item" label={t("Položka *")}>
          <select id="inventory_movement_item" className="k-select" value={movementItemId} onChange={(event) => setMovementItemId(event.target.value)}>
            {items.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </FormField>
        <FormField id="inventory_movement_quantity" label={t("Množství *")}>
          <input id="inventory_movement_quantity" type="number" min={1} step={1} className="k-input" value={movementQuantity} onChange={(event) => setMovementQuantity(Number(event.target.value))} />
        </FormField>
        <FormField id="inventory_movement_date" label={t("Datum dokladu *")}>
          <input id="inventory_movement_date" type="date" className="k-input" value={movementDate} onChange={(event) => setMovementDate(event.target.value)} />
        </FormField>
        <FormField id="inventory_movement_reference" label={movementType === 'in' ? t('Číslo dokladu *') : t('Číslo dokladu (volitelné)')}>
          <input id="inventory_movement_reference" className="k-input" value={movementReference} onChange={(event) => setMovementReference(event.target.value)} />
        </FormField>
        <FormField id="inventory_movement_note" label={t("Poznámka (volitelná)")}>
          <input id="inventory_movement_note" className="k-input" value={movementNote} onChange={(event) => setMovementNote(event.target.value)} />
        </FormField>
      </div>
      <div className="k-toolbar">
        <button className="k-button" type="button" onClick={() => void submitMovement()} disabled={savingMovement}>{savingMovement ? t('Ukládám pohyb…') : t('Potvrdit pohyb')}</button>
      </div>
      {movementInfo ? <p className="k-text-success" aria-live="polite">{movementInfo}</p> : null}
    </div>
  ) : null;

  return (
    <main className="k-page" data-testid="inventory-list-page">
      <h1>{t("Skladové hospodářství")}</h1>
      {error ? (
        <StateView title={t("Chyba")} description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>{t("Obnovit")}</button>} />
      ) : items.length === 0 ? (
        <StateView
          title={t("Prázdný stav")}
          description={t("Ve skladu zatím nejsou položky.")}
          stateKey="empty"
          action={isAdmin ? <Link className="k-button" to="/sklad/nova">{t("Nová položka")}</Link> : undefined}
        />
      ) : (
        <>
          <div className="k-toolbar">
            {isAdmin ? <button className="k-button secondary" type="button" onClick={downloadStocktakePdf}>{t("Inventurní protokol (PDF)")}</button> : null}
            {isAdmin ? <Link className="k-button" to="/sklad/nova">{t("Nová položka")}</Link> : null}
          </div>
          {movementCard}
          <DataTable
            headers={isAdmin ? [t('Položka'), t('Skladem'), t('Minimum'), t('Jednotka'), t('Status'), t('Akce')] : [t('Položka'), t('Jednotka'), t('Akce')]}
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
                  <span key={`inventory-action-${item.id}`} className="k-subtle">{t("Pohyb vytvořte nahoře.")}</span>,
                ];
              }
              return [
                itemLabel,
                item.current_stock,
                item.min_stock,
                item.unit,
                item.current_stock <= item.min_stock
                  ? <Badge key={`low-${item.id}`} tone="danger">{t("Pod minimem")}</Badge>
                  : <Badge key={`ok-${item.id}`} tone="success">{t("OK")}</Badge>,
                <Link className="k-nav-link" key={item.id} to={`/sklad/${item.id}`}>{t("Detail")}</Link>,
              ];
            })}
          />
        </>
      )}
    </main>
  );
}

function InventoryForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
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
    if (mode !== 'edit' || !id) return;
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
      .catch((err) => setError(err instanceof Error ? err.message : t('Položku se nepodařilo načíst.')));
  }, [id, mode]);

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
      ? t('Název položky je povinný.')
      : !Number.isInteger(normalizedPayload.amount_per_piece_base) || (normalizedPayload.amount_per_piece_base ?? 0) < 1
        ? t('Hodnota veličiny v 1 ks musí být alespoň 1.')
        : !Number.isInteger(normalizedPayload.min_stock) || normalizedPayload.min_stock < 0
          ? t('Minimální stav musí být nula nebo vyšší.')
          : !Number.isInteger(normalizedPayload.current_stock) || normalizedPayload.current_stock < 0
            ? t('Počáteční stav musí být nula nebo vyšší.')
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
      setError(err instanceof Error ? err.message : t('Položku se nepodařilo uložit.'));
    }
  };

  return (
    <main className="k-page" data-testid={mode === 'create' ? 'inventory-create-page' : 'inventory-edit-page'}>
      <h1>{mode === 'create' ? t('Nová skladová položka') : t('Upravit skladovou položku')}</h1>
      {error ? (
        <StateView title={t("Chyba")} description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>{t("Obnovit")}</button>} />
      ) : (
        <div className="k-card">
          <div className="k-toolbar">
            <Link className="k-nav-link" to="/sklad">{t("Zpět na seznam")}</Link>
            <button className="k-button" type="button" onClick={() => void save()}>{t("Uložit")}</button>
          </div>
          <div className="k-inventory-form-media">
            {pictogramPreview ? (
              <img className="k-inventory-thumb-preview" src={pictogramPreview} alt={payload.name ? tf('Náhled položky {name}', { name: payload.name }) : t('Náhled položky')} />
            ) : (
              <InventoryThumb item={{ id: Number(id ?? 0), name: payload.name || t('Položka'), pictogram_thumb_path: payload.pictogram_thumb_path }} size="form" />
            )}
          </div>
          <div className="k-form-grid">
            <FormField id="inventory_name" label={t("Název")}>
              <input id="inventory_name" className="k-input" value={payload.name} onChange={(event) => setPayload((prev) => ({ ...prev, name: event.target.value }))} />
            </FormField>
            <FormField id="inventory_unit" label={t("Veličina v 1 ks")}>
              <select id="inventory_unit" className="k-select" value={payload.unit} onChange={(event) => setPayload((prev) => ({ ...prev, unit: event.target.value }))}>
                <option value="g">g</option>
                <option value="l">l</option>
                <option value="ks">{t("ks")}</option>
              </select>
            </FormField>
            <FormField id="inventory_amount_per_piece_base" label={t("Hodnota veličiny v 1 ks")}>
              <input id="inventory_amount_per_piece_base" type="number" min={1} step={1} className="k-input" value={payload.amount_per_piece_base ?? 1} onChange={(event) => setPayload((prev) => ({ ...prev, amount_per_piece_base: Number(event.target.value) }))} />
            </FormField>
            <FormField id="inventory_min_stock" label={t("Minimální stav")}>
              <input id="inventory_min_stock" type="number" min={0} step={1} className="k-input" value={payload.min_stock} onChange={(event) => setPayload((prev) => ({ ...prev, min_stock: Number(event.target.value) }))} />
            </FormField>
            <FormField id="inventory_pictogram" label={t("Miniatura položky")}>
              <input id="inventory_pictogram" type="file" className="k-input" accept="image/*" onChange={(event) => setPictogramFile(event.target.files?.[0] ?? null)} />
            </FormField>
          </div>
        </div>
      )}
    </main>
  );
}

function InventoryDetail(): JSX.Element {
    const auth = useAuth();
    const { id } = useParams();
  const activeRole = auth?.activeRole ?? auth?.role ?? null;
  const isAdmin = activeRole === 'admin';
  const [item, setItem] = React.useState<InventoryDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadDetail = React.useCallback(() => {
    if (!id) return;
    fetchJson<InventoryDetail>(`/api/v1/inventory/${id}`)
      .then((response) => {
        setItem(response);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof HttpError) {
          if (err.status === 404) setError(t('Skladová položka nebyla nalezena. Zkontrolujte seznam skladu nebo se vraťte zpět.'));
          else if (err.status === 403) setError(t('Nemáte oprávnění zobrazit detail skladové položky.'));
          else setError(t('Detail skladové položky se nepodařilo načíst. Technická chyba byla zalogována.'));
        } else {
          setError(t('Detail skladové položky se nepodařilo načíst. Technická chyba byla zalogována.'));
        }
      });
  }, [id]);

  React.useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const deleteMovement = async (movementId: number): Promise<void> => {
    if (!id) return;
    const confirmed = window.confirm(t('Opravdu chcete smazat tento skladový pohyb? Množství položky se přepočítá opačným pohybem a operaci nelze vrátit bez nového zápisu.'));
    if (!confirmed) return;
    const csrf = readCsrfToken();
    try {
      await fetchJson<void>(`/api/v1/inventory/${id}/movements/${movementId}`, {
        method: 'DELETE',
        headers: csrf ? { 'x-csrf-token': csrf } : undefined,
      });
      loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Pohyb se nepodařilo smazat.'));
    }
  };

  return (
    <main className="k-page" data-testid="inventory-detail-page">
      <h1>{item ? tf('Detail skladové položky: {name}', { name: item.name }) : t('Detail skladové položky')}</h1>
      {error ? (
        <StateView title={error.includes('Missing role') || error.includes('Missing actor type') ? t('Přístup odepřen') : '404'} description={error} stateKey={error.includes('Missing role') || error.includes('Missing actor type') ? 'error' : '404'} action={<Link className="k-button secondary" to="/sklad">{t("Zpět na seznam")}</Link>} />
      ) : item ? (
        <>
          <div className="k-card">
            <div className="k-toolbar">
              <Link className="k-nav-link" to="/sklad">{t("Zpět na seznam")}</Link>
              {isAdmin ? <Link className="k-button" to={`/sklad/${item.id}/edit`}>{t("Upravit")}</Link> : null}
            </div>
            <div className="k-inventory-detail-hero">
              <InventoryThumb item={item} size="detail" />
              <div>
                <h2>{item.name}</h2>
                <p className="k-subtle">{isAdmin ? t('Admin může položku upravit a mazat pohyby.') : t('Karta položky a její pohyby jsou dostupné jen ke čtení.')}</p>
              </div>
            </div>
            <DataTable
              headers={[t('Položka'), t('Skladem'), t('Minimum'), t('Veličina v 1 ks'), t('Hodnota veličiny v 1 ks')]}
              rows={[[item.name, item.current_stock, item.min_stock, item.unit, item.amount_per_piece_base ?? 0]]}
            />
          </div>
          <div className="k-card">
            <h2>{t("Pohyby")}</h2>
            <DataTable
               headers={isAdmin ? [t('Interní číslo'), t('Datum'), t('Druh'), t('Množství'), t('Číslo dokladu'), t('Poznámka'), t('Akce')] : [t('Interní číslo'), t('Datum'), t('Druh'), t('Množství'), t('Číslo dokladu'), t('Poznámka')]}
               rows={item.movements.map((movement) => [
                 movement.document_number ?? '-',
                 formatDateTime(movement.document_date ?? movement.created_at),
                 inventoryMovementLabel(movement.movement_type),
                 movement.quantity,
                 movement.document_reference ?? '-',
                 movement.note ?? '-',
                 ...(isAdmin ? [<button className="k-button secondary danger" type="button" key={`delete-movement-${movement.id}`} onClick={() => void deleteMovement(movement.id)}>{t("Smazat")}</button>] : []),
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

function ReportsList(): JSX.Element {
  const auth = useAuth();
  const canManageReports = auth ? canWriteModule(auth.permissions, 'reports') : false;
  const [items, setItems] = React.useState<Report[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchJson<Report[]>('/api/v1/reports')
      .then(setItems)
      .catch(() => setError(t('Hlášení se nepodařilo načíst.')));
  }, []);

  return <main className="k-page" data-testid="reports-list-page"><h1>{t("Hlášení")}</h1>{error ? <StateView title={t("Chyba")} description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>{t("Obnovit")}</button>} /> : items.length === 0 ? <StateView title={t("Prázdný stav")} description={t("Zatím není evidováno žádné hlášení.")} stateKey="empty" action={canManageReports ? <Link className="k-button" to="/hlaseni/nove">{t("Nové hlášení")}</Link> : undefined} /> : <><div className="k-toolbar">{canManageReports ? <Link className="k-button" to="/hlaseni/nove">{t("Nové hlášení")}</Link> : null}</div><DataTable headers={[t('Název'), t('Stav'), t('Vytvořeno'), t('Akce')]} rows={items.map((item) => [item.title, <Badge key={`status-${item.id}`} tone={item.status === 'closed' ? 'success' : item.status === 'in_progress' ? 'warning' : 'neutral'}>{reportStatusLabel(item.status)}</Badge>, formatDateTime(item.created_at), <Link className="k-nav-link" key={item.id} to={`/hlaseni/${item.id}`}>{t("Detail")}</Link>])} /></>}</main>;
}

function ReportsForm({ mode }: { mode: 'create' | 'edit' }): JSX.Element {
    const { id } = useParams();
  const navigate = useNavigate();
  const [error, setError] = React.useState<string | null>(null);
  const [payload, setPayload] = React.useState<ReportPayload>({ title: '', description: '', status: 'open' });

  React.useEffect(() => {
    if (mode !== 'edit' || !id) {
      return;
    }
    fetchJson<Report>(`/api/v1/reports/${id}`)
      .then((item) => setPayload({ title: item.title, description: item.description, status: item.status }))
      .catch(() => setError(t('Detail hlášení se nepodařilo načíst.')));
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
      setError(t('Hlášení se nepodařilo uložit.'));
    }
  }

  return <main className="k-page" data-testid={mode === 'create' ? 'reports-create-page' : 'reports-edit-page'}><h1>{mode === 'create' ? t('Nové hlášení') : t('Upravit hlášení')}</h1>{error ? <StateView title={t("Chyba")} description={error} stateKey="error" action={<button className="k-button" type="button" onClick={() => window.location.reload()}>{t("Obnovit")}</button>} /> : <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/hlaseni">{t("Zpět na seznam")}</Link><button className="k-button" type="button" onClick={() => void save()}>{t("Uložit")}</button></div><div className="k-form-grid"><FormField id="report_title" label={t("Název")}><input id="report_title" className="k-input" value={payload.title} onChange={(e) => setPayload((prev) => ({ ...prev, title: e.target.value }))} /></FormField><FormField id="report_status" label={t("Stav")}><select id="report_status" className="k-select" value={payload.status} onChange={(e) => setPayload((prev) => ({ ...prev, status: e.target.value as ReportStatus }))}><option value="open">{t("Otevřené")}</option><option value="in_progress">{t("V řešení")}</option><option value="closed">{t("Uzavřené")}</option></select></FormField><FormField id="report_description" label={t("Popis (volitelné)")}><textarea id="report_description" className="k-input" value={payload.description ?? ''} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} /></FormField></div></div>}</main>;
}

function ReportsDetail(): JSX.Element {
  const auth = useAuth();
  const canManageReports = auth ? canWriteModule(auth.permissions, 'reports') : false;
  const { id } = useParams();
  const [item, setItem] = React.useState<Report | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id) {
      return;
    }
    fetchJson<Report>(`/api/v1/reports/${id}`)
      .then(setItem)
      .catch(() => setError(t('Hlášení nebylo nalezeno.')));
  }, [id]);

  return <main className="k-page" data-testid="reports-detail-page"><h1>{t("Detail hlášení")}</h1>{error ? <StateView title="404" description={error} stateKey="404" action={<Link className="k-button secondary" to="/hlaseni">{t("Zpět na seznam")}</Link>} /> : item ? <div className="k-card"><div className="k-toolbar"><Link className="k-nav-link" to="/hlaseni">{t("Zpět na seznam")}</Link>{canManageReports ? <Link className="k-button" to={`/hlaseni/${item.id}/edit`}>{t("Upravit")}</Link> : null}</div><DataTable headers={[t('Položka'), t('Hodnota')]} rows={[[ t('Název'), item.title],[ t('Stav'), reportStatusLabel(item.status)],[ t('Popis'), item.description ?? '-' ],[ t('Vytvořeno'), formatDateTime(item.created_at) ],[ t('Aktualizováno'), formatDateTime(item.updated_at) ]]} /></div> : <SkeletonPage />}</main>;
}

function PortalProfilePage(): JSX.Element {
  const navigate = useNavigate();
  const auth = useAuth();
  const [profile, setProfile] = React.useState<{
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    note: string | null;
    roles: string[];
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [changingPassword, setChangingPassword] = React.useState(false);
  const [profileForm, setProfileForm] = React.useState({
    first_name: '',
    last_name: '',
    phone: '',
    note: '',
  });
  const [passwordForm, setPasswordForm] = React.useState({
    current_password: '',
    new_password: '',
  });
  const normalizedPhone = normalizePhoneInput(profileForm.phone);
  const isPhoneValid = !normalizedPhone || e164PhoneRegex.test(normalizedPhone);
  const openWarehouseRoute = async (route: '/sklad' | '/hlaseni'): Promise<void> => {
    try {
      if (auth?.activeRole !== 'sklad') {
        const result = await requestRoleSelection('sklad');
        if (!result.ok) {
          setError(result.detail ?? t('Výběr role selhal.'));
          return;
        }
        window.location.assign(route);
        return;
      }
      await navigate(route);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('Výběr role selhal.'));
    }
  };

  React.useEffect(() => {
    fetchJson('/api/auth/profile')
      .then((response) => {
        const nextProfile = response as {
          email: string;
          first_name: string;
          last_name: string;
          phone: string | null;
          note: string | null;
          roles: string[];
        };
        setProfile(nextProfile);
        setProfileForm({
          first_name: nextProfile.first_name,
          last_name: nextProfile.last_name,
          phone: nextProfile.phone ?? '',
          note: nextProfile.note ?? '',
        });
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('Profil se nepodařilo načíst.')));
  }, []);

  const saveProfile = async (): Promise<void> => {
    setSavingProfile(true);
    setError(null);
    setInfo(null);
    try {
      const nextProfile = await fetchJson<{
        email: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        note: string | null;
        roles: string[];
      }>('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': readCsrfToken(),
        },
        body: JSON.stringify({
          first_name: profileForm.first_name.trim(),
          last_name: profileForm.last_name.trim(),
          phone: normalizedPhone,
          note: profileForm.note.trim() || null,
        }),
      });
      setProfile(nextProfile);
      setProfileForm({
        first_name: nextProfile.first_name,
        last_name: nextProfile.last_name,
        phone: nextProfile.phone ?? '',
        note: nextProfile.note ?? '',
      });
      setInfo(t('Profil byl uložen.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Profil se nepodařilo uložit.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (): Promise<void> => {
    setChangingPassword(true);
    setError(null);
    setInfo(null);
    try {
      await fetchJson('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': readCsrfToken(),
        },
        body: JSON.stringify({
          old_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        }),
      });
      await navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Heslo se nepodařilo změnit.'));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <main className="k-page" data-testid="portal-profile-page">
      <h1>{t("Můj profil")}</h1>
      {error ? <StateView title={t("Chyba")} description={error} stateKey="error" /> : null}
      {info ? <p className="k-text-success">{info}</p> : null}
      {profile ? (
        <>
          {auth?.roles.includes('sklad') ? <div className="k-card"><div className="k-toolbar"><button className="k-button" type="button" onClick={() => void openWarehouseRoute('/sklad')}>{getAuthBundle('portal', getPortalLocale()).roleLabels.sklad}</button><button className="k-button secondary" type="button" onClick={() => void openWarehouseRoute('/hlaseni')}>{getAuthBundle('portal', getPortalLocale()).moduleLabels.reports}</button></div></div> : null}
          <div className="k-card">
            <div className="k-toolbar">
              <strong>{profile.email}</strong>
              <span className="k-text-muted">{profile.roles.map((role) => getAuthBundle('portal', getPortalLocale()).roleLabels[role] ?? role).join(', ') || '-'}</span>
            </div>
            <p className="k-text-muted">{t("Správa kontaktních údajů a provozní poznámky k účtu")}{' '}{profile.email}</p>
            <div className="k-form-grid">
              <FormField id="portal_profile_first_name" label={t("Jméno")}>
                <input
                  id="portal_profile_first_name"
                  className="k-input"
                  value={profileForm.first_name}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, first_name: event.target.value }))}
                />
              </FormField>
              <FormField id="portal_profile_last_name" label={t("Příjmení")}>
                <input
                  id="portal_profile_last_name"
                  className="k-input"
                  value={profileForm.last_name}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, last_name: event.target.value }))}
                />
              </FormField>
              <FormField id="portal_profile_phone" label={t("Telefon (E.164, volitelně)")}>
                <input
                  id="portal_profile_phone"
                  className="k-input"
                  value={profileForm.phone}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </FormField>
              <FormField id="portal_profile_note" label={t("Poznámka")}>
                <textarea
                  id="portal_profile_note"
                  className="k-input"
                  value={profileForm.note}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, note: event.target.value }))}
                />
              </FormField>
            </div>
            <p className="k-text-muted">{t("Telefon zadávej ve formátu E.164, například +420123456789.")}</p>
            {!isPhoneValid ? <p className="k-text-error">{t("Telefon musí být ve formátu E.164.")}</p> : null}
            <div className="k-toolbar">
              <button className="k-button" type="button" disabled={savingProfile || !isPhoneValid || !profileForm.first_name.trim() || !profileForm.last_name.trim()} onClick={() => void saveProfile()}>{t("Uložit profil")}{' '}</button>
            </div>
          </div>
          <div className="k-card">
            <h2>{t("Změna hesla")}</h2>
            <div className="k-form-grid">
              <FormField id="portal_profile_current_password" label={t("Současné heslo")}>
                <input
                  id="portal_profile_current_password"
                  className="k-input"
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(event) => setPasswordForm((prev) => ({ ...prev, current_password: event.target.value }))}
                />
              </FormField>
              <FormField id="portal_profile_new_password" label={t("Nové heslo")}>
                <input
                  id="portal_profile_new_password"
                  className="k-input"
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(event) => setPasswordForm((prev) => ({ ...prev, new_password: event.target.value }))}
                />
              </FormField>
            </div>
            <div className="k-toolbar">
              <button className="k-button" type="button" disabled={changingPassword} onClick={() => void changePassword()}>{t("Potvrdit změnu")}{' '}</button>
            </div>
          </div>
        </>
      ) : !error ? <SkeletonPage /> : null}
    </main>
  );
}

type AuthLoadState =
  | { status: 'loading' }
  | { status: 'authenticated'; profile: AuthProfile }
  | { status: 'error'; message: string }
  | { status: 'unauthenticated' };

function AppRoutes(): JSX.Element {
  const location = useLocation();
  const [authState, setAuthState] = React.useState<AuthLoadState>(() => (
    hasAuthCookieHint() ? { status: 'loading' } : { status: 'unauthenticated' }
  ));

  React.useEffect(() => {
    if (!hasAuthCookieHint()) {
      return;
    }
    void resolveAuthProfile()
      .then((resolved) => {
        if (resolved.status === 'authenticated') {
          setAuthState({ status: 'authenticated', profile: resolved.profile });
          return;
        }
        if (resolved.status === 'error') {
          setAuthState({ status: 'error', message: resolved.message });
          return;
        }
        setAuthState({ status: 'unauthenticated' });
      })
      .catch(() => {
        setAuthState({ status: 'unauthenticated' });
      });
  }, []);

  React.useEffect(() => {
    if (authState.status !== 'authenticated') return;
    return attachWebActivity(() => window.location.assign(authState.profile.actorType === 'admin' ? '/admin/login' : '/login'));
  }, [authState]);

  if (authState.status === 'loading') {
    return (
      <KajovoStartupSplash
        href="/"
        eyebrow={t("Kájovo Hotel")}
        title={t("Provoz hotelu bez zbytečných přepínačů")}
        description={t("Recepce, pokojská, údržba i sklad mají společný pracovní rytmus, jasné stavy a bezpečný přístup k tomu, co právě potřebují.")}
      />
    );
  }

  const loginError = authState.status === 'error' ? authState.message : null;

  if (authState.status !== 'authenticated') {
    return (
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/*" element={<AdminRoutes currentPath={location.pathname} />} />
        <Route path="/login" element={<PortalLoginPage initialError={loginError} />} />
        <Route path="/login/reset" element={<PortalResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const auth = authState.profile;
  const modules = ia.modules;

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/*" element={<AdminRoutes currentPath={location.pathname} />} />
        <Route path="/login" element={<PortalLoginPage />} />
        <Route path="/login/reset" element={<PortalResetPasswordPage />} />
        <Route
          path="*"
          element={
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
