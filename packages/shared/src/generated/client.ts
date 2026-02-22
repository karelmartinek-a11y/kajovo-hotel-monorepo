/* eslint-disable */
// Generated from apps/kajovo-hotel-api/openapi.json. Do not edit manually.

export type BreakfastDailySummary = {
  "service_date": string;
  "status_counts": Record<string, unknown>;
  "total_guests": number;
  "total_orders": number;
};
export type BreakfastOrderCreate = {
  "guest_count": number;
  "guest_name": string;
  "note"?: string | null;
  "room_number": string;
  "service_date": string;
  "status"?: BreakfastStatus;
};
export type BreakfastOrderRead = {
  "created_at": string | null;
  "guest_count": number;
  "guest_name": string;
  "id": number;
  "note"?: string | null;
  "room_number": string;
  "service_date": string;
  "status"?: BreakfastStatus;
  "updated_at": string | null;
};
export type BreakfastOrderUpdate = {
  "guest_count"?: number | null;
  "guest_name"?: string | null;
  "note"?: string | null;
  "room_number"?: string | null;
  "service_date"?: string | null;
  "status"?: BreakfastStatus | null;
};
export type BreakfastStatus = "pending" | "preparing" | "served" | "cancelled";
export type HTTPValidationError = {
  "detail"?: Array<ValidationError>;
};
export type InventoryAuditLogRead = {
  "action": string;
  "created_at": string | null;
  "detail": string;
  "entity": string;
  "entity_id": number;
  "id": number;
};
export type InventoryItemCreate = {
  "current_stock": number;
  "min_stock": number;
  "name": string;
  "supplier"?: string | null;
  "unit": string;
};
export type InventoryItemDetailRead = {
  "created_at": string | null;
  "current_stock": number;
  "id": number;
  "min_stock": number;
  "movements": Array<InventoryMovementRead>;
  "name": string;
  "supplier"?: string | null;
  "unit": string;
  "updated_at": string | null;
};
export type InventoryItemRead = {
  "created_at": string | null;
  "current_stock": number;
  "id": number;
  "min_stock": number;
  "name": string;
  "supplier"?: string | null;
  "unit": string;
  "updated_at": string | null;
};
export type InventoryItemUpdate = {
  "current_stock"?: number | null;
  "min_stock"?: number | null;
  "name"?: string | null;
  "supplier"?: string | null;
  "unit"?: string | null;
};
export type InventoryItemWithAuditRead = {
  "audit_logs": Array<InventoryAuditLogRead>;
  "created_at": string | null;
  "current_stock": number;
  "id": number;
  "min_stock": number;
  "movements": Array<InventoryMovementRead>;
  "name": string;
  "supplier"?: string | null;
  "unit": string;
  "updated_at": string | null;
};
export type InventoryMovementCreate = {
  "movement_type": InventoryMovementType;
  "note"?: string | null;
  "quantity": number;
};
export type InventoryMovementRead = {
  "created_at": string | null;
  "id": number;
  "item_id": number;
  "movement_type": InventoryMovementType;
  "note"?: string | null;
  "quantity": number;
};
export type InventoryMovementType = "in" | "out" | "adjust";
export type IssueCreate = {
  "assignee"?: string | null;
  "description"?: string | null;
  "location": string;
  "priority"?: IssuePriority;
  "room_number"?: string | null;
  "status"?: IssueStatus;
  "title": string;
};
export type IssuePriority = "low" | "medium" | "high" | "critical";
export type IssueRead = {
  "assignee"?: string | null;
  "closed_at": string | null;
  "created_at": string | null;
  "description"?: string | null;
  "id": number;
  "in_progress_at": string | null;
  "location": string;
  "priority"?: IssuePriority;
  "resolved_at": string | null;
  "room_number"?: string | null;
  "status"?: IssueStatus;
  "title": string;
  "updated_at": string | null;
};
export type IssueStatus = "new" | "in_progress" | "resolved" | "closed";
export type IssueUpdate = {
  "assignee"?: string | null;
  "description"?: string | null;
  "location"?: string | null;
  "priority"?: IssuePriority | null;
  "room_number"?: string | null;
  "status"?: IssueStatus | null;
  "title"?: string | null;
};
export type LostFoundItemCreate = {
  "category": string;
  "claimant_contact"?: string | null;
  "claimant_name"?: string | null;
  "claimed_at"?: string | null;
  "description": string;
  "event_at": string;
  "handover_note"?: string | null;
  "item_type"?: LostFoundItemType;
  "location": string;
  "returned_at"?: string | null;
  "status"?: LostFoundStatus;
};
export type LostFoundItemRead = {
  "category": string;
  "claimant_contact"?: string | null;
  "claimant_name"?: string | null;
  "claimed_at"?: string | null;
  "created_at": string | null;
  "description": string;
  "event_at": string;
  "handover_note"?: string | null;
  "id": number;
  "item_type"?: LostFoundItemType;
  "location": string;
  "returned_at"?: string | null;
  "status"?: LostFoundStatus;
  "updated_at": string | null;
};
export type LostFoundItemType = "lost" | "found";
export type LostFoundItemUpdate = {
  "category"?: string | null;
  "claimant_contact"?: string | null;
  "claimant_name"?: string | null;
  "claimed_at"?: string | null;
  "description"?: string | null;
  "event_at"?: string | null;
  "handover_note"?: string | null;
  "item_type"?: LostFoundItemType | null;
  "location"?: string | null;
  "returned_at"?: string | null;
  "status"?: LostFoundStatus | null;
};
export type LostFoundStatus = "stored" | "claimed" | "returned" | "disposed";
export type ReportCreate = {
  "description"?: string | null;
  "status"?: string;
  "title": string;
};
export type ReportRead = {
  "created_at": string | null;
  "description": string | null;
  "id": number;
  "status": string;
  "title": string;
  "updated_at": string | null;
};
export type ReportUpdate = {
  "description"?: string | null;
  "status"?: string | null;
  "title"?: string | null;
};
export type ValidationError = {
  "ctx"?: Record<string, unknown>;
  "input"?: unknown;
  "loc": Array<string | number>;
  "msg": string;
  "type": string;
};

type QueryValue = string | number | boolean | null | undefined;

function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const found = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.split('=')[1]) : null;
}

async function request<T>(method: string, path: string, query?: Record<string, QueryValue>, body?: unknown): Promise<T> {
  const csrfToken = readCookie('kajovo_csrf');
  const isWrite = method !== 'GET' && method !== 'HEAD';
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (isWrite && csrfToken) headers['x-csrf-token'] = csrfToken;
  const response = await fetch(`${path}${buildQuery(query)}`, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  if (!response.ok) throw new Error('API request failed');
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const apiClient = {
  async listBreakfastOrdersApiV1BreakfastGet(query: { "service_date"?: string | null; "status"?: BreakfastStatus | null; }): Promise<Array<BreakfastOrderRead>> {
    return request<Array<BreakfastOrderRead>>('GET', `/api/v1/breakfast`, query, undefined);
  },
  async createBreakfastOrderApiV1BreakfastPost(body: BreakfastOrderCreate): Promise<BreakfastOrderRead> {
    return request<BreakfastOrderRead>('POST', `/api/v1/breakfast`, undefined, body);
  },
  async getDailySummaryApiV1BreakfastDailySummaryGet(query: { "service_date": string; }): Promise<BreakfastDailySummary> {
    return request<BreakfastDailySummary>('GET', `/api/v1/breakfast/daily-summary`, query, undefined);
  },
  async deleteBreakfastOrderApiV1BreakfastOrderIdDelete(order_id: number): Promise<void> {
    return request<void>('DELETE', `/api/v1/breakfast/${order_id}`, undefined, undefined);
  },
  async getBreakfastOrderApiV1BreakfastOrderIdGet(order_id: number): Promise<BreakfastOrderRead> {
    return request<BreakfastOrderRead>('GET', `/api/v1/breakfast/${order_id}`, undefined, undefined);
  },
  async updateBreakfastOrderApiV1BreakfastOrderIdPut(order_id: number, body: BreakfastOrderUpdate): Promise<BreakfastOrderRead> {
    return request<BreakfastOrderRead>('PUT', `/api/v1/breakfast/${order_id}`, undefined, body);
  },
  async listItemsApiV1InventoryGet(query: { "low_stock"?: boolean; }): Promise<Array<InventoryItemRead>> {
    return request<Array<InventoryItemRead>>('GET', `/api/v1/inventory`, query, undefined);
  },
  async createItemApiV1InventoryPost(body: InventoryItemCreate): Promise<InventoryItemRead> {
    return request<InventoryItemRead>('POST', `/api/v1/inventory`, undefined, body);
  },
  async deleteItemApiV1InventoryItemIdDelete(item_id: number): Promise<void> {
    return request<void>('DELETE', `/api/v1/inventory/${item_id}`, undefined, undefined);
  },
  async getItemApiV1InventoryItemIdGet(item_id: number): Promise<InventoryItemWithAuditRead> {
    return request<InventoryItemWithAuditRead>('GET', `/api/v1/inventory/${item_id}`, undefined, undefined);
  },
  async updateItemApiV1InventoryItemIdPut(item_id: number, body: InventoryItemUpdate): Promise<InventoryItemRead> {
    return request<InventoryItemRead>('PUT', `/api/v1/inventory/${item_id}`, undefined, body);
  },
  async addMovementApiV1InventoryItemIdMovementsPost(item_id: number, body: InventoryMovementCreate): Promise<InventoryItemDetailRead> {
    return request<InventoryItemDetailRead>('POST', `/api/v1/inventory/${item_id}/movements`, undefined, body);
  },
  async listIssuesApiV1IssuesGet(query: { "priority"?: IssuePriority | null; "status"?: IssueStatus | null; "location"?: string | null; "room_number"?: string | null; }): Promise<Array<IssueRead>> {
    return request<Array<IssueRead>>('GET', `/api/v1/issues`, query, undefined);
  },
  async createIssueApiV1IssuesPost(body: IssueCreate): Promise<IssueRead> {
    return request<IssueRead>('POST', `/api/v1/issues`, undefined, body);
  },
  async deleteIssueApiV1IssuesIssueIdDelete(issue_id: number): Promise<void> {
    return request<void>('DELETE', `/api/v1/issues/${issue_id}`, undefined, undefined);
  },
  async getIssueApiV1IssuesIssueIdGet(issue_id: number): Promise<IssueRead> {
    return request<IssueRead>('GET', `/api/v1/issues/${issue_id}`, undefined, undefined);
  },
  async updateIssueApiV1IssuesIssueIdPut(issue_id: number, body: IssueUpdate): Promise<IssueRead> {
    return request<IssueRead>('PUT', `/api/v1/issues/${issue_id}`, undefined, body);
  },
  async listLostFoundItemsApiV1LostFoundGet(query: { "type"?: LostFoundItemType | null; "status"?: LostFoundStatus | null; "category"?: string | null; }): Promise<Array<LostFoundItemRead>> {
    return request<Array<LostFoundItemRead>>('GET', `/api/v1/lost-found`, query, undefined);
  },
  async createLostFoundItemApiV1LostFoundPost(body: LostFoundItemCreate): Promise<LostFoundItemRead> {
    return request<LostFoundItemRead>('POST', `/api/v1/lost-found`, undefined, body);
  },
  async deleteLostFoundItemApiV1LostFoundItemIdDelete(item_id: number): Promise<void> {
    return request<void>('DELETE', `/api/v1/lost-found/${item_id}`, undefined, undefined);
  },
  async getLostFoundItemApiV1LostFoundItemIdGet(item_id: number): Promise<LostFoundItemRead> {
    return request<LostFoundItemRead>('GET', `/api/v1/lost-found/${item_id}`, undefined, undefined);
  },
  async updateLostFoundItemApiV1LostFoundItemIdPut(item_id: number, body: LostFoundItemUpdate): Promise<LostFoundItemRead> {
    return request<LostFoundItemRead>('PUT', `/api/v1/lost-found/${item_id}`, undefined, body);
  },
  async listReportsApiV1ReportsGet(query: { "status"?: string | null; }): Promise<Array<ReportRead>> {
    return request<Array<ReportRead>>('GET', `/api/v1/reports`, query, undefined);
  },
  async createReportApiV1ReportsPost(body: ReportCreate): Promise<ReportRead> {
    return request<ReportRead>('POST', `/api/v1/reports`, undefined, body);
  },
  async deleteReportApiV1ReportsReportIdDelete(report_id: number): Promise<void> {
    return request<void>('DELETE', `/api/v1/reports/${report_id}`, undefined, undefined);
  },
  async getReportApiV1ReportsReportIdGet(report_id: number): Promise<ReportRead> {
    return request<ReportRead>('GET', `/api/v1/reports/${report_id}`, undefined, undefined);
  },
  async updateReportApiV1ReportsReportIdPut(report_id: number, body: ReportUpdate): Promise<ReportRead> {
    return request<ReportRead>('PUT', `/api/v1/reports/${report_id}`, undefined, body);
  },
  async healthHealthGet(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>('GET', `/health`, undefined, undefined);
  },
  async readyReadyGet(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>('GET', `/ready`, undefined, undefined);
  },
};
