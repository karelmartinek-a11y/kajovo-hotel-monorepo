/* eslint-disable */
// Generated from apps/kajovo-hotel-api/openapi.json. Do not edit manually.

export type AdminLoginRequest = {
  "email": string;
  "password": string;
};
export type AdminProfileRead = {
  "display_name": string;
  "email": string;
  "password_changed_at": string | null;
  "updated_at": string | null;
};
export type AdminProfileUpdate = {
  "display_name": string;
};
export type AndroidAppReleaseRead = {
  "download_url": string;
  "message": string;
  "required"?: boolean;
  "sha256": string;
  "title": string;
  "version": string;
  "version_code": number;
};
export type AuthIdentityResponse = {
  "active_role"?: string | null;
  "actor_type": string;
  "email": string;
  "permissions": Array<string>;
  "role": string;
  "roles"?: Array<string>;
};
export type AuthProfileRead = {
  "actor_type": string;
  "email": string;
  "first_name": string;
  "last_name": string;
  "note"?: string | null;
  "phone"?: string | null;
  "roles"?: Array<string>;
};
export type AuthProfileUpdate = {
  "first_name": string;
  "last_name": string;
  "note"?: string | null;
  "phone"?: string | null;
};
export type Body_import_breakfast_pdf_api_v1_breakfast_import_post = {
  "file": string;
  "overrides"?: string | null;
  "save"?: boolean;
};
export type Body_upload_issue_photos_api_v1_issues__issue_id__photos_post = {
  "photos": Array<string>;
};
export type Body_upload_item_pictogram_api_v1_inventory__item_id__pictogram_post = {
  "file": string;
};
export type Body_upload_lost_found_photos_api_v1_lost_found__item_id__photos_post = {
  "photos": Array<string>;
};
export type Body_upload_report_photos_api_v1_reports__report_id__photos_post = {
  "photos": Array<string>;
};
export type BreakfastDailySummary = {
  "service_date": string;
  "status_counts": Record<string, unknown>;
  "total_guests": number;
  "total_orders": number;
};
export type BreakfastImportItem = {
  "count": number;
  "diet_no_gluten"?: boolean;
  "diet_no_milk"?: boolean;
  "diet_no_pork"?: boolean;
  "guest_name"?: string | null;
  "room": number;
};
export type BreakfastImportResponse = {
  "date": string;
  "items": Array<BreakfastImportItem>;
  "ok"?: boolean;
  "saved"?: boolean;
  "status": string;
};
export type BreakfastOrderCreate = {
  "diet_no_gluten"?: boolean;
  "diet_no_milk"?: boolean;
  "diet_no_pork"?: boolean;
  "guest_count": number;
  "guest_name": string;
  "note"?: string | null;
  "room_number": string;
  "service_date": string;
  "status"?: BreakfastStatus;
};
export type BreakfastOrderRead = {
  "created_at": string | null;
  "diet_no_gluten"?: boolean;
  "diet_no_milk"?: boolean;
  "diet_no_pork"?: boolean;
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
  "diet_no_gluten"?: boolean | null;
  "diet_no_milk"?: boolean | null;
  "diet_no_pork"?: boolean | null;
  "guest_count"?: number | null;
  "guest_name"?: string | null;
  "note"?: string | null;
  "room_number"?: string | null;
  "service_date"?: string | null;
  "status"?: BreakfastStatus | null;
};
export type BreakfastStatus = "pending" | "preparing" | "served" | "cancelled";
export type DeviceChallengeRequest = {
  "device_id": string;
  "device_secret": string;
};
export type DeviceChallengeResponse = {
  "challenge": string;
  "challenge_id": string;
  "expires_at": string;
};
export type DeviceRegisterRequest = {
  "bootstrap_key": string;
  "device_id": string;
  "display_name"?: string | null;
};
export type DeviceRegisterResponse = {
  "device_id": string;
  "device_secret": string;
  "display_name": string;
  "registered_at": string;
  "status": string;
};
export type DeviceStatusResponse = {
  "device_id": string;
  "display_name": string;
  "last_seen_at": string | null;
  "registered_at": string;
  "status": string;
  "token_expires_at"?: string | null;
};
export type DeviceVerifyRequest = {
  "challenge_id": string;
  "device_id": string;
  "device_secret": string;
  "signature": string;
};
export type DeviceVerifyResponse = {
  "expires_at": string;
  "token": string;
  "token_type"?: string;
};
export type HTTPValidationError = {
  "detail"?: Array<ValidationError>;
};
export type HintRequest = {
  "email": string;
};
export type InventoryAuditLogRead = {
  "action": string;
  "created_at": string | null;
  "detail": string;
  "entity": string;
  "id": number;
  "resource_id": number;
};
export type InventoryCardCreate = {
  "card_date": string;
  "card_type": InventoryCardType;
  "items": Array<InventoryCardItemCreate>;
  "note"?: string | null;
  "reference"?: string | null;
  "supplier"?: string | null;
};
export type InventoryCardDetailRead = {
  "card_date": string;
  "card_type": InventoryCardType;
  "created_at": string | null;
  "id": number;
  "items": Array<InventoryCardItemRead>;
  "note"?: string | null;
  "number": string;
  "reference"?: string | null;
  "supplier"?: string | null;
  "updated_at": string | null;
};
export type InventoryCardItemCreate = {
  "ingredient_id": number;
  "note"?: string | null;
  "quantity_base": number;
  "quantity_pieces"?: number;
};
export type InventoryCardItemRead = {
  "card_id": number;
  "created_at": string | null;
  "id": number;
  "ingredient_id": number;
  "ingredient_name"?: string | null;
  "note"?: string | null;
  "quantity_base": number;
  "quantity_pieces"?: number;
  "unit"?: string | null;
};
export type InventoryCardRead = {
  "card_date": string;
  "card_type": InventoryCardType;
  "created_at": string | null;
  "id": number;
  "note"?: string | null;
  "number": string;
  "reference"?: string | null;
  "supplier"?: string | null;
  "updated_at": string | null;
};
export type InventoryCardType = "in" | "out" | "adjust";
export type InventoryItemCreate = {
  "amount_per_piece_base"?: number;
  "current_stock": number;
  "min_stock": number;
  "name": string;
  "pictogram_path"?: string | null;
  "pictogram_thumb_path"?: string | null;
  "unit": string;
};
export type InventoryItemDetailRead = {
  "amount_per_piece_base"?: number;
  "created_at": string | null;
  "current_stock": number;
  "id": number;
  "min_stock": number;
  "movements": Array<InventoryMovementRead>;
  "name": string;
  "pictogram_path"?: string | null;
  "pictogram_thumb_path"?: string | null;
  "unit": string;
  "updated_at": string | null;
};
export type InventoryItemRead = {
  "amount_per_piece_base"?: number;
  "created_at": string | null;
  "current_stock": number;
  "id": number;
  "min_stock": number;
  "name": string;
  "pictogram_path"?: string | null;
  "pictogram_thumb_path"?: string | null;
  "unit": string;
  "updated_at": string | null;
};
export type InventoryItemUpdate = {
  "amount_per_piece_base"?: number | null;
  "current_stock"?: number | null;
  "min_stock"?: number | null;
  "name"?: string | null;
  "pictogram_path"?: string | null;
  "pictogram_thumb_path"?: string | null;
  "unit"?: string | null;
};
export type InventoryItemWithAuditRead = {
  "amount_per_piece_base"?: number;
  "audit_logs": Array<InventoryAuditLogRead>;
  "created_at": string | null;
  "current_stock": number;
  "id": number;
  "min_stock": number;
  "movements": Array<InventoryMovementRead>;
  "name": string;
  "pictogram_path"?: string | null;
  "pictogram_thumb_path"?: string | null;
  "unit": string;
  "updated_at": string | null;
};
export type InventoryMovementCreate = {
  "document_date": string;
  "document_reference"?: string | null;
  "movement_type": InventoryMovementType;
  "note"?: string | null;
  "quantity": number;
  "quantity_pieces"?: number;
};
export type InventoryMovementRead = {
  "card_id"?: number | null;
  "card_item_id"?: number | null;
  "card_number"?: string | null;
  "created_at": string | null;
  "document_date"?: string | null;
  "document_number": string | null;
  "document_reference"?: string | null;
  "id": number;
  "item_id": number;
  "item_name"?: string | null;
  "movement_type": InventoryMovementType;
  "note"?: string | null;
  "quantity": number;
  "quantity_pieces"?: number;
  "unit"?: string | null;
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
  "photos"?: Array<MediaPhotoRead>;
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
export type LogoutResponse = {
  "ok"?: boolean;
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
  "room_number"?: string | null;
  "status"?: LostFoundStatus;
  "tags"?: Array<string>;
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
  "photos"?: Array<MediaPhotoRead>;
  "returned_at"?: string | null;
  "room_number"?: string | null;
  "status"?: LostFoundStatus;
  "tags"?: Array<string>;
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
  "room_number"?: string | null;
  "status"?: LostFoundStatus | null;
  "tags"?: Array<string> | null;
};
export type LostFoundStatus = "new" | "stored" | "disposed" | "claimed" | "returned";
export type MailDispatchResponse = {
  "connected": boolean;
  "message": string;
  "ok": boolean;
  "send_attempted": boolean;
};
export type MediaPhotoRead = {
  "created_at": string | null;
  "file_path": string;
  "id": number;
  "mime_type": string;
  "size_bytes": number;
  "sort_order": number;
  "thumb_path": string;
};
export type PortalLoginRequest = {
  "email": string;
  "password": string;
  "remember_me"?: boolean;
};
export type PortalPasswordChangeRequest = {
  "new_password": string;
  "old_password": string;
};
export type PortalPasswordResetRequest = {
  "new_password": string;
  "token": string;
};
export type PortalUserCreate = {
  "email": string;
  "first_name"?: string;
  "last_name"?: string;
  "note"?: string | null;
  "password"?: string | null;
  "phone"?: string | null;
  "roles": Array<string>;
};
export type PortalUserRead = {
  "admin_locked_until"?: string | null;
  "created_at": string | null;
  "email": string;
  "first_name": string;
  "id": number;
  "is_active": boolean;
  "is_locked"?: boolean;
  "last_login_at": string | null;
  "last_name": string;
  "note": string | null;
  "phone": string | null;
  "portal_locked_until"?: string | null;
  "role": string | null;
  "roles": Array<string>;
  "updated_at": string | null;
};
export type PortalUserStatusUpdate = {
  "is_active": boolean;
};
export type PortalUserUpdate = {
  "email": string;
  "first_name": string;
  "last_name": string;
  "note"?: string | null;
  "phone"?: string | null;
  "roles": Array<string>;
};
export type ReportCreate = {
  "description"?: string | null;
  "status"?: string;
  "title": string;
};
export type ReportRead = {
  "created_at": string | null;
  "description": string | null;
  "id": number;
  "photos"?: Array<MediaPhotoRead>;
  "status": string;
  "title": string;
  "updated_at": string | null;
};
export type ReportUpdate = {
  "description"?: string | null;
  "status"?: string | null;
  "title"?: string | null;
};
export type SelectRoleRequest = {
  "role": string;
};
export type SmtpOperationalStatusRead = {
  "can_send_real_email": boolean;
  "configured": boolean;
  "delivery_mode": string;
  "last_test_connected"?: boolean | null;
  "last_test_error"?: string | null;
  "last_test_recipient"?: string | null;
  "last_test_send_attempted"?: boolean | null;
  "last_test_success"?: boolean | null;
  "last_tested_at"?: string | null;
  "smtp_enabled": boolean;
};
export type SmtpSettingsRead = {
  "from_email": string;
  "host": string;
  "password_masked": string;
  "port": number;
  "use_ssl": boolean;
  "use_tls": boolean;
  "username": string;
};
export type SmtpSettingsUpsert = {
  "from_email": string;
  "host": string;
  "password"?: string | null;
  "port": number;
  "use_ssl"?: boolean;
  "use_tls"?: boolean;
  "username": string;
};
export type SmtpTestEmailRequest = {
  "recipient": string;
};
export type SmtpTestEmailResponse = {
  "connected": boolean;
  "delivery_mode": string;
  "message": string;
  "ok"?: boolean;
  "send_attempted": boolean;
};
export type UserPasswordResetLinkResponse = {
  "connected": boolean;
  "message": string;
  "ok": boolean;
  "send_attempted": boolean;
};
export type ValidationError = {
  "loc": Array<string | number>;
  "msg": string;
  "type": string;
};

type QueryValue = string | number | boolean | null | undefined;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function csrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const token = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('kajovo_csrf='));
  if (!token) return null;
  return decodeURIComponent(token.slice('kajovo_csrf='.length));
}

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

async function request<T>(method: string, path: string, query?: Record<string, QueryValue>, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (WRITE_METHODS.has(method)) {
    const csrf = csrfTokenFromCookie();
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  const response = await fetch(`${path}${buildQuery(query)}`, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error('API request failed');
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const apiClient = {
  async getAndroidReleaseApiAppAndroidReleaseGet(): Promise<AndroidAppReleaseRead> {
    return request<AndroidAppReleaseRead>('GET', `/api/app/android-release`, undefined, undefined);
  },
  async adminHintApiAuthAdminHintPost(body: HintRequest): Promise<MailDispatchResponse> {
    return request<MailDispatchResponse>('POST', `/api/auth/admin/hint`, undefined, body);
  },
  async adminLoginApiAuthAdminLoginPost(body: AdminLoginRequest): Promise<AuthIdentityResponse> {
    return request<AuthIdentityResponse>('POST', `/api/auth/admin/login`, undefined, body);
  },
  async adminLogoutApiAuthAdminLogoutPost(): Promise<LogoutResponse> {
    return request<LogoutResponse>('POST', `/api/auth/admin/logout`, undefined, undefined);
  },
  async changeOwnPasswordApiAuthChangePasswordPost(body: PortalPasswordChangeRequest): Promise<LogoutResponse> {
    return request<LogoutResponse>('POST', `/api/auth/change-password`, undefined, body);
  },
  async portalLoginApiAuthLoginPost(body: PortalLoginRequest): Promise<AuthIdentityResponse> {
    return request<AuthIdentityResponse>('POST', `/api/auth/login`, undefined, body);
  },
  async portalLogoutApiAuthLogoutPost(): Promise<LogoutResponse> {
    return request<LogoutResponse>('POST', `/api/auth/logout`, undefined, undefined);
  },
  async authMeApiAuthMeGet(): Promise<AuthIdentityResponse> {
    return request<AuthIdentityResponse>('GET', `/api/auth/me`, undefined, undefined);
  },
  async authProfileApiAuthProfileGet(): Promise<AuthProfileRead> {
    return request<AuthProfileRead>('GET', `/api/auth/profile`, undefined, undefined);
  },
  async updateAuthProfileApiAuthProfilePatch(body: AuthProfileUpdate): Promise<AuthProfileRead> {
    return request<AuthProfileRead>('PATCH', `/api/auth/profile`, undefined, body);
  },
  async resetPasswordApiAuthResetPasswordPost(body: PortalPasswordResetRequest): Promise<LogoutResponse> {
    return request<LogoutResponse>('POST', `/api/auth/reset-password`, undefined, body);
  },
  async selectPortalRoleApiAuthSelectRolePost(body: SelectRoleRequest): Promise<AuthIdentityResponse> {
    return request<AuthIdentityResponse>('POST', `/api/auth/select-role`, undefined, body);
  },
  async unlockAccountApiAuthUnlockGet(query: { "token": string; "actor_type"?: string | null; }): Promise<LogoutResponse> {
    return request<LogoutResponse>('GET', `/api/auth/unlock`, query, undefined);
  },
  async getAdminProfileApiV1AdminProfileGet(): Promise<AdminProfileRead> {
    return request<AdminProfileRead>('GET', `/api/v1/admin/profile`, undefined, undefined);
  },
  async updateAdminProfileApiV1AdminProfilePut(body: AdminProfileUpdate): Promise<AdminProfileRead> {
    return request<AdminProfileRead>('PUT', `/api/v1/admin/profile`, undefined, body);
  },
  async getSmtpSettingsApiV1AdminSettingsSmtpGet(): Promise<SmtpSettingsRead> {
    return request<SmtpSettingsRead>('GET', `/api/v1/admin/settings/smtp`, undefined, undefined);
  },
  async putSmtpSettingsApiV1AdminSettingsSmtpPut(body: SmtpSettingsUpsert): Promise<SmtpSettingsRead> {
    return request<SmtpSettingsRead>('PUT', `/api/v1/admin/settings/smtp`, undefined, body);
  },
  async getSmtpStatusApiV1AdminSettingsSmtpStatusGet(): Promise<SmtpOperationalStatusRead> {
    return request<SmtpOperationalStatusRead>('GET', `/api/v1/admin/settings/smtp/status`, undefined, undefined);
  },
  async testSmtpEmailApiV1AdminSettingsSmtpTestEmailPost(body: SmtpTestEmailRequest): Promise<SmtpTestEmailResponse> {
    return request<SmtpTestEmailResponse>('POST', `/api/v1/admin/settings/smtp/test-email`, undefined, body);
  },
  async listBreakfastOrdersApiV1BreakfastGet(query: { "service_date"?: string | null; "status"?: BreakfastStatus | null; }): Promise<Array<BreakfastOrderRead>> {
    return request<Array<BreakfastOrderRead>>('GET', `/api/v1/breakfast`, query, undefined);
  },
  async createBreakfastOrderApiV1BreakfastPost(body: BreakfastOrderCreate): Promise<BreakfastOrderRead> {
    return request<BreakfastOrderRead>('POST', `/api/v1/breakfast`, undefined, body);
  },
  async getDailySummaryApiV1BreakfastDailySummaryGet(query: { "service_date": string; }): Promise<BreakfastDailySummary> {
    return request<BreakfastDailySummary>('GET', `/api/v1/breakfast/daily-summary`, query, undefined);
  },
  async deleteBreakfastOrdersForDayApiV1BreakfastDayDeleteDelete(query: { "service_date": string; }): Promise<void> {
    return request<void>('DELETE', `/api/v1/breakfast/day/delete`, query, undefined);
  },
  async exportBreakfastDailyPdfApiV1BreakfastExportDailyGet(query: { "service_date": string; }): Promise<unknown> {
    return request<unknown>('GET', `/api/v1/breakfast/export/daily`, query, undefined);
  },
  async importBreakfastPdfApiV1BreakfastImportPost(): Promise<BreakfastImportResponse> {
    return request<BreakfastImportResponse>('POST', `/api/v1/breakfast/import`, undefined, undefined);
  },
  async deleteBreakfastOrdersForPeriodApiV1BreakfastPeriodDeleteDelete(query: { "date_from": string; "date_to": string; }): Promise<void> {
    return request<void>('DELETE', `/api/v1/breakfast/period/delete`, query, undefined);
  },
  async reactivateAllBreakfastOrdersApiV1BreakfastReactivateAllPost(query: { "service_date": string; }): Promise<void> {
    return request<void>('POST', `/api/v1/breakfast/reactivate-all`, query, undefined);
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
  async issueChallengeApiV1DeviceChallengePost(body: DeviceChallengeRequest): Promise<DeviceChallengeResponse> {
    return request<DeviceChallengeResponse>('POST', `/api/v1/device/challenge`, undefined, body);
  },
  async registerDeviceApiV1DeviceRegisterPost(body: DeviceRegisterRequest): Promise<DeviceRegisterResponse> {
    return request<DeviceRegisterResponse>('POST', `/api/v1/device/register`, undefined, body);
  },
  async deviceStatusApiV1DeviceStatusGet(query: { "device_id"?: string | null; }): Promise<DeviceStatusResponse> {
    return request<DeviceStatusResponse>('GET', `/api/v1/device/status`, query, undefined);
  },
  async verifyChallengeApiV1DeviceVerifyPost(body: DeviceVerifyRequest): Promise<DeviceVerifyResponse> {
    return request<DeviceVerifyResponse>('POST', `/api/v1/device/verify`, undefined, body);
  },
  async listItemsApiV1InventoryGet(query: { "low_stock"?: boolean; }): Promise<Array<InventoryItemRead>> {
    return request<Array<InventoryItemRead>>('GET', `/api/v1/inventory`, query, undefined);
  },
  async createItemApiV1InventoryPost(body: InventoryItemCreate): Promise<InventoryItemRead> {
    return request<InventoryItemRead>('POST', `/api/v1/inventory`, undefined, body);
  },
  async listCardsApiV1InventoryCardsGet(): Promise<Array<InventoryCardRead>> {
    return request<Array<InventoryCardRead>>('GET', `/api/v1/inventory/cards`, undefined, undefined);
  },
  async createCardApiV1InventoryCardsPost(body: InventoryCardCreate): Promise<InventoryCardDetailRead> {
    return request<InventoryCardDetailRead>('POST', `/api/v1/inventory/cards`, undefined, body);
  },
  async deleteCardApiV1InventoryCardsCardIdDelete(card_id: number): Promise<void> {
    return request<void>('DELETE', `/api/v1/inventory/cards/${card_id}`, undefined, undefined);
  },
  async getCardApiV1InventoryCardsCardIdGet(card_id: number): Promise<InventoryCardDetailRead> {
    return request<InventoryCardDetailRead>('GET', `/api/v1/inventory/cards/${card_id}`, undefined, undefined);
  },
  async listItemsApiV1InventoryIngredientsGet(query: { "low_stock"?: boolean; }): Promise<Array<InventoryItemRead>> {
    return request<Array<InventoryItemRead>>('GET', `/api/v1/inventory/ingredients`, query, undefined);
  },
  async listMovementsApiV1InventoryMovementsGet(): Promise<Array<InventoryMovementRead>> {
    return request<Array<InventoryMovementRead>>('GET', `/api/v1/inventory/movements`, undefined, undefined);
  },
  async exportStocktakePdfApiV1InventoryStocktakePdfGet(): Promise<unknown> {
    return request<unknown>('GET', `/api/v1/inventory/stocktake/pdf`, undefined, undefined);
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
  async deleteMovementApiV1InventoryItemIdMovementsMovementIdDelete(item_id: number, movement_id: number): Promise<void> {
    return request<void>('DELETE', `/api/v1/inventory/${item_id}/movements/${movement_id}`, undefined, undefined);
  },
  async uploadItemPictogramApiV1InventoryItemIdPictogramPost(item_id: number): Promise<InventoryItemRead> {
    return request<InventoryItemRead>('POST', `/api/v1/inventory/${item_id}/pictogram`, undefined, undefined);
  },
  async getItemPictogramApiV1InventoryItemIdPictogramKindGet(item_id: number, kind: string): Promise<unknown> {
    return request<unknown>('GET', `/api/v1/inventory/${item_id}/pictogram/${kind}`, undefined, undefined);
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
  async listIssuePhotosApiV1IssuesIssueIdPhotosGet(issue_id: number): Promise<Array<MediaPhotoRead>> {
    return request<Array<MediaPhotoRead>>('GET', `/api/v1/issues/${issue_id}/photos`, undefined, undefined);
  },
  async uploadIssuePhotosApiV1IssuesIssueIdPhotosPost(issue_id: number): Promise<Array<MediaPhotoRead>> {
    return request<Array<MediaPhotoRead>>('POST', `/api/v1/issues/${issue_id}/photos`, undefined, undefined);
  },
  async getIssuePhotoApiV1IssuesIssueIdPhotosPhotoIdKindGet(issue_id: number, photo_id: number, kind: string): Promise<unknown> {
    return request<unknown>('GET', `/api/v1/issues/${issue_id}/photos/${photo_id}/${kind}`, undefined, undefined);
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
  async listLostFoundPhotosApiV1LostFoundItemIdPhotosGet(item_id: number): Promise<Array<MediaPhotoRead>> {
    return request<Array<MediaPhotoRead>>('GET', `/api/v1/lost-found/${item_id}/photos`, undefined, undefined);
  },
  async uploadLostFoundPhotosApiV1LostFoundItemIdPhotosPost(item_id: number): Promise<Array<MediaPhotoRead>> {
    return request<Array<MediaPhotoRead>>('POST', `/api/v1/lost-found/${item_id}/photos`, undefined, undefined);
  },
  async getLostFoundPhotoApiV1LostFoundItemIdPhotosPhotoIdKindGet(item_id: number, photo_id: number, kind: string): Promise<unknown> {
    return request<unknown>('GET', `/api/v1/lost-found/${item_id}/photos/${photo_id}/${kind}`, undefined, undefined);
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
  async listReportPhotosApiV1ReportsReportIdPhotosGet(report_id: number): Promise<Array<MediaPhotoRead>> {
    return request<Array<MediaPhotoRead>>('GET', `/api/v1/reports/${report_id}/photos`, undefined, undefined);
  },
  async uploadReportPhotosApiV1ReportsReportIdPhotosPost(report_id: number): Promise<Array<MediaPhotoRead>> {
    return request<Array<MediaPhotoRead>>('POST', `/api/v1/reports/${report_id}/photos`, undefined, undefined);
  },
  async getReportPhotoApiV1ReportsReportIdPhotosPhotoIdKindGet(report_id: number, photo_id: number, kind: string): Promise<unknown> {
    return request<unknown>('GET', `/api/v1/reports/${report_id}/photos/${photo_id}/${kind}`, undefined, undefined);
  },
  async listUsersApiV1UsersGet(): Promise<Array<PortalUserRead>> {
    return request<Array<PortalUserRead>>('GET', `/api/v1/users`, undefined, undefined);
  },
  async createUserApiV1UsersPost(body: PortalUserCreate): Promise<PortalUserRead> {
    return request<PortalUserRead>('POST', `/api/v1/users`, undefined, body);
  },
  async deleteUserApiV1UsersUserIdDelete(user_id: number): Promise<void> {
    return request<void>('DELETE', `/api/v1/users/${user_id}`, undefined, undefined);
  },
  async getUserApiV1UsersUserIdGet(user_id: number): Promise<PortalUserRead> {
    return request<PortalUserRead>('GET', `/api/v1/users/${user_id}`, undefined, undefined);
  },
  async updateUserApiV1UsersUserIdPatch(user_id: number, body: PortalUserUpdate): Promise<PortalUserRead> {
    return request<PortalUserRead>('PATCH', `/api/v1/users/${user_id}`, undefined, body);
  },
  async setUserActiveApiV1UsersUserIdActivePatch(user_id: number, body: PortalUserStatusUpdate): Promise<PortalUserRead> {
    return request<PortalUserRead>('PATCH', `/api/v1/users/${user_id}/active`, undefined, body);
  },
  async sendUserResetLinkApiV1UsersUserIdPasswordResetLinkPost(user_id: number): Promise<UserPasswordResetLinkResponse> {
    return request<UserPasswordResetLinkResponse>('POST', `/api/v1/users/${user_id}/password/reset-link`, undefined, undefined);
  },
  async unlockUserAccountApiV1UsersUserIdUnlockPost(user_id: number): Promise<PortalUserRead> {
    return request<PortalUserRead>('POST', `/api/v1/users/${user_id}/unlock`, undefined, undefined);
  },
  async healthHealthGet(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>('GET', `/health`, undefined, undefined);
  },
  async readyReadyGet(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>('GET', `/ready`, undefined, undefined);
  },
};
