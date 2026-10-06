// Generated from Dagmar own strict API; no host schemas.
export type Forget = {
  "id": string;
  "operation": "memory_forget";
  "revision": number;
};
export type ItemAdd = {
  "content": string;
  "id": string;
  "operation": "note_item_add";
  "position": number | null;
  "revision": number;
};
export type ItemMove = {
  "id": string;
  "item_id": string;
  "operation": "note_item_move";
  "position": number;
  "revision": number;
};
export type ItemRemove = {
  "id": string;
  "item_id": string;
  "operation": "note_item_remove";
  "revision": number;
};
export type ItemUpdate = {
  "content": string;
  "id": string;
  "item_id": string;
  "operation": "note_item_update";
  "revision": number;
};
export type MemoryList = {
  "limit": number;
  "offset": number;
  "operation": "memory_list";
  "status": "active" | "inactive" | "superseded" | null;
};
export type MemoryRead = {
  "content": string;
  "created_at": string;
  "id": string;
  "importance": number;
  "kind": "preference" | "fact" | "project" | "decision" | "open_point";
  "last_used_at": string | null;
  "origin": "explicit" | "automatic";
  "pinned": boolean;
  "revision": number;
  "source_session_id": string | null;
  "status": "active" | "inactive" | "superseded";
  "subject": string;
  "tags": Array<string>;
  "updated_at": string;
};
export type MemoryRequest = {
  "request": Remember | Search | ReadMemory | MemoryList | UpdateMemory | Forget | NoteCreate | NoteList | NoteRead | NoteRename | NoteState | ItemAdd | ItemUpdate | ItemRemove | ItemMove | NoteText | SummaryRead;
};
export type MemoryResult = {
  "api_version"?: 1;
  "code": "ok" | "ambiguous" | "not_found" | "revision_conflict" | "invalid_arguments" | "unavailable" | "identity_conflict" | "sensitive_content_rejected" | "profile_protected" | "human_intent_required" | "unauthorized";
  "has_more"?: boolean;
  "intent_reason"?: "missing_audio" | "transcript_pending" | "untrusted_context" | "scope_mismatch" | "revoked" | "expired" | null;
  "memories"?: Array<MemoryRead>;
  "memory"?: MemoryRead | null;
  "note"?: NoteRecord | null;
  "notes"?: Array<NoteRecord>;
  "operation": "unknown" | "memory_remember" | "memory_search" | "memory_read" | "memory_list" | "memory_update" | "memory_forget" | "note_create" | "note_list" | "note_read" | "note_rename" | "note_archive" | "note_delete" | "note_clear" | "note_item_add" | "note_item_update" | "note_item_remove" | "note_item_move" | "note_text_update" | "summary_read";
  "replayed"?: boolean;
  "summaries"?: Array<SummaryRecord>;
  "summary"?: SummaryRecord | null;
};
export type NoteCreate = {
  "content": string | null;
  "items": Array<string>;
  "kind": "list" | "text";
  "operation": "note_create";
  "title": string;
};
export type NoteItemRead = {
  "content": string;
  "id": string;
  "position": number;
};
export type NoteList = {
  "archived": boolean;
  "limit": number;
  "offset": number;
  "operation": "note_list";
  "query": string;
};
export type NoteRead = {
  "id": string;
  "operation": "note_read";
};
export type NoteRecord = {
  "content": string | null;
  "created_at": string;
  "id": string;
  "item_count": number;
  "items": Array<NoteItemRead>;
  "kind": "list" | "text";
  "revision": number;
  "status": "active" | "archived";
  "title": string;
  "updated_at": string;
};
export type NoteRename = {
  "id": string;
  "operation": "note_rename";
  "revision": number;
  "title": string;
};
export type NoteState = {
  "id": string;
  "operation": "note_archive" | "note_delete" | "note_clear";
  "revision": number;
};
export type NoteText = {
  "content": string;
  "id": string;
  "operation": "note_text_update";
  "revision": number;
};
export type PublicChange = {
  "action": "create_room" | "rename_room" | "delete_room" | "assign_devices" | "remove_devices" | "rename_devices";
  "detached_devices"?: number | null;
  "name"?: string | null;
  "new_location"?: string | null;
  "new_name"?: string | null;
  "old_location"?: string | null;
  "old_name"?: string | null;
  "room_ref"?: string | null;
  "row"?: number | null;
  "status": string;
};
export type PublicPlan = {
  "changes": Array<PublicChange>;
  "expires_at": string;
  "id": string;
  "requires_confirmation": boolean;
};
export type PublicRegistryResult = {
  "action"?: string | null;
  "detached_devices"?: number | null;
  "function"?: string | null;
  "location"?: string | null;
  "message"?: string | null;
  "name"?: string | null;
  "new_location"?: string | null;
  "new_name"?: string | null;
  "old_location"?: string | null;
  "old_name"?: string | null;
  "room_ref"?: string | null;
  "row"?: number | null;
  "status": string;
};
export type ReadMemory = {
  "id": string;
  "operation": "memory_read";
};
export type RegistryView = {
  "attempts"?: number;
  "plan"?: PublicPlan | null;
  "results"?: Array<PublicRegistryResult>;
  "state"?: string;
};
export type Remember = {
  "content": string;
  "kind": "preference" | "fact" | "project" | "decision" | "open_point";
  "operation": "memory_remember";
  "subject": string;
  "tags": Array<string>;
};
export type Search = {
  "date_from": string | null;
  "date_to": string | null;
  "limit": number;
  "operation": "memory_search";
  "query": string;
  "scope": "memories" | "summaries" | "notes" | "all";
  "tags": Array<string>;
};
export type SettingsRead = {
  "automatic": boolean;
  "revision": number;
};
export type SummaryRead = {
  "id": string;
  "operation": "summary_read";
};
export type SummaryRecord = {
  "content": string;
  "continuation": string;
  "created_at": string;
  "decisions": Array<string>;
  "id": string;
  "open_points": Array<string>;
  "revision": number;
  "topics": Array<string>;
  "updated_at": string;
};
export type UpdateMemory = {
  "content": string;
  "id": string;
  "importance": number;
  "operation": "memory_update";
  "pinned": boolean;
  "revision": number;
  "status": "active" | "inactive" | "superseded";
  "subject": string;
  "tags": Array<string>;
};
export type VoiceSessionRead = {
  "closed"?: boolean;
  "connection_state"?: "connecting" | "ready" | "waiting";
  "logical_call_id"?: string | null;
  "mail"?: "disabled" | "loading" | "ready" | "unavailable" | "incompatible";
  "managed_functions"?: Array<string>;
  "managed_mcp_servers"?: Array<string>;
  "managed_mcp_status"?: Record<string, string>;
  "memory"?: "connecting" | "ready" | "unavailable";
  "model": string;
  "renew"?: boolean;
  "sdp": string;
  "session_id"?: string | null;
  "technologies"?: string;
};
export type VoiceSessionStatus = {
  "closed": boolean;
  "connection_state"?: "connecting" | "ready" | "waiting";
  "logical_call_id"?: string | null;
  "mail"?: "disabled" | "loading" | "ready" | "unavailable" | "incompatible";
  "managed_mcp_servers"?: Array<string>;
  "managed_mcp_status"?: Record<string, string>;
  "memory"?: "connecting" | "ready" | "unavailable";
  "renew": boolean;
  "session_id": string;
  "technologies": string;
};
