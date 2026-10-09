"""Dagmar public Smart MCP contract; secrets and transport remain backend-only."""

import asyncio
import time
from pathlib import Path
import base64
import hashlib
import json
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from pydantic import BaseModel, ConfigDict, Field, model_validator

MCP_URL = "https://apimcpkajavoiceha.hcasc.cz/mcp"


class SmartError(Exception):
    """Public category only; never expose SDK exceptions."""


class Control(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    row: int = Field(ge=1)
    function: str = Field(min_length=1, max_length=256, description="Exact function from current describe for this global row. Function codes such as cNN have no universal meaning; select by the described action and capabilities.")
    parameters: dict = Field(default_factory=dict, description="Only parameters supported by this function in current describe, with its exact names, types, ranges and units. Color/brightness/white temperature are settings, never power toggle.")


class Filters(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str | None = None
    location: str | None = None
    room_ref: str | None = Field(default=None, min_length=1, max_length=256, description="Exact current membership of the room returned by rooms_list; combined with other filters as AND.")
    kind: str | None = None
    function: str | None = None
    capabilities: list[Literal["barva", "jas", "teplota_bile", "fotografie", "zapnout", "vypnout"]] | None = None
    state: Literal["zapnuto", "vypnuto"] | None = None


class RegistryChange(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    action: Literal["create_room", "rename_room", "delete_room", "assign_devices", "remove_devices", "rename_devices"]
    rows: list[int] | None = Field(default=None, min_length=1)
    selection_id: str | None = Field(default=None, min_length=1, max_length=256)
    room_refs: list[str] | None = Field(default=None, min_length=1)
    room_selection_id: str | None = Field(default=None, min_length=1, max_length=256)
    destination_room_ref: str | None = Field(default=None, min_length=1, max_length=256)
    new_name: str | None = Field(default=None, min_length=1, max_length=160)
    name_template: str | None = Field(default=None, min_length=1, max_length=200)
    start_index: int | None = Field(default=None, ge=1)
    index_width: int | None = Field(default=None, ge=0, le=6)

    @model_validator(mode="after")
    def shape(self):
        import re
        device = self.action in {"assign_devices", "remove_devices", "rename_devices"}
        naming = self.action in {"create_room", "rename_room", "rename_devices"}
        if self.action == "create_room":
            allowed = {"action", "new_name"}
        else:
            allowed = {"action"} | ({"rows", "selection_id"} if device else {"room_refs", "room_selection_id"})
            if naming:
                allowed |= {"new_name", "name_template", "start_index", "index_width"}
            if self.action == "assign_devices":
                allowed.add("destination_room_ref")
            if sum(bool(v) for v in ((self.rows, self.selection_id) if device else (self.room_refs, self.room_selection_id))) != 1:
                raise ValueError("exactly_one_registry_target_required")
        if any(k not in allowed and getattr(self, k) is not None for k in self.model_fields_set):
            raise ValueError("unexpected_registry_fields")
        if naming and sum(bool(v) for v in (self.new_name, self.name_template)) != 1:
            raise ValueError("exactly_one_name_required")
        if not self.name_template and (self.start_index is not None or self.index_width is not None):
            raise ValueError("template_required")
        if self.name_template and re.sub(r"\{(?:name|room|index)\}", "", self.name_template).count("{") + re.sub(r"\{(?:name|room|index)\}", "", self.name_template).count("}"):
            raise ValueError("invalid_name_template")
        if self.action == "assign_devices" and not self.destination_room_ref:
            raise ValueError("destination_required")
        if self.new_name is not None and not self.new_name.strip():
            raise ValueError("empty_name")
        for values in (self.rows, self.room_refs):
            if values and (len(set(values)) != len(values) or any(not v for v in values)):
                raise ValueError("invalid_registry_targets")
        if self.rows and any(type(v) is not int or v < 1 for v in self.rows):
            raise ValueError("invalid_rows")
        return self


class SmartArguments(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    response_mode: Literal["complete"] | None = Field(default=None, description="Whole search/describe/read selection; never combine offset/limit. Host negotiates MCP support.")
    operation: Literal["catalog", "search", "describe", "read", "control", "operation_status", "camera_view", "rooms_list", "registry_prepare", "registry_apply"]
    changes: list[RegistryChange] | None = Field(default=None, min_length=1, max_length=200)
    plan_id: str | None = Field(default=None, min_length=1, max_length=256)
    catalog_revision: str | None = Field(default=None, min_length=1)
    selection_id: str | None = Field(default=None, min_length=1, description="Entire saved search selection. Mutually exclusive with rows and controls; omit this field when choosing a specific global row.")
    query: str | None = Field(default=None, max_length=200)
    filters: Filters | None = None
    offset: int | None = Field(default=None, ge=0)
    limit: int | None = Field(default=None, ge=1, le=200, description="Search: up to 200 names; describe/read: up to 8 device details.")
    rows: list[int] | None = Field(default=None, min_length=1, description="Explicit global row identities with catalog_revision. Omit selection_id and controls. Camera_view requires exactly one row.")
    controls: list[Control] | None = Field(default=None, min_length=1)
    action: Literal["zapnout", "vypnout", "prepnout", "nastavit"] | None = Field(default=None, description='Main-component intent: zapnout = turn on; vypnout = turn off; prepnout = legacy only, AI must never use it; nastavit = change color, brightness or white temperature using current describe parameters. "přepni světla na červenou", "změň barvu", "nastav červenou" and "dej jas na 50 %" mean nastavit, even when the verb is přepni. For explicit groups retain the entire selection_id.')
    parameters: dict | None = Field(default=None, description="Settings for action nastavit only. Use exact parameter names, types, ranges and units from current describe; never invent a color/brightness/white-temperature parameter or put settings on zapnout, vypnout or prepnout.")
    request_id: str | None = Field(default=None, min_length=1, max_length=128)

    @model_validator(mode="after")
    def operation_fields(self):
        targets = {"catalog_revision", "selection_id", "rows"}
        allowed = {
            "catalog": set(),
            "search": {"query", "filters", "offset", "limit", "response_mode"},
            "describe": targets | {"offset", "limit", "response_mode"},
            "read": targets | {"offset", "limit", "response_mode"},
            "camera_view": targets,
            "control": targets | {"controls", "action", "parameters", "request_id"},
            "operation_status": {"request_id"},
            "rooms_list": {"query", "offset", "limit"},
            "registry_prepare": {"changes"},
            "registry_apply": {"plan_id"},
        }[self.operation] | {"operation", "catalog_revision"}
        if any(key not in allowed and getattr(self, key) is not None for key in self.model_fields_set):
            raise ValueError("unexpected_operation_fields")
        if self.response_mode and self.model_fields_set & {"offset", "limit"}:
            raise ValueError("complete_pagination_conflict")
        if self.rows and (any(type(row) is not int or row < 1 for row in self.rows) or len(set(self.rows)) != len(self.rows)):
            raise ValueError("invalid_rows")
        if self.operation in {"describe", "read", "control", "camera_view"}:
            if sum(bool(v) for v in (self.selection_id, self.rows, self.controls)) != 1:
                raise ValueError("exactly_one_target_required")
            if not self.selection_id and not self.catalog_revision:
                raise ValueError("catalog_revision_required")
        if self.operation == "control":
            if bool(self.controls) == bool(self.action):
                raise ValueError("exactly_one_control_mode_required")
            if self.action == "nastavit" and not self.parameters:
                raise ValueError("parameters_required")
            if self.action in {"zapnout", "vypnout", "prepnout"} and self.parameters:
                raise ValueError("settings_require_nastavit")
            if self.controls and self.parameters is not None:
                raise ValueError("parameters_belong_to_controls")
        if self.operation == "operation_status" and not self.request_id:
            raise ValueError("request_id_required")
        if self.operation == "registry_prepare" and (not self.changes or not self.catalog_revision):
            raise ValueError("registry_changes_and_revision_required")
        if self.operation == "registry_apply" and not self.plan_id:
            raise ValueError("plan_id_required")
        if self.operation == "camera_view" and self.rows and len(self.rows) != 1:
            raise ValueError("one_camera_required")
        if self.operation in {"describe", "read"} and self.limit and self.limit > 8:
            raise ValueError("detail_page_limit")
        return self


def _inline_schema(schema):
    definitions = schema.pop("$defs", {})
    def expand(value):
        if isinstance(value, dict):
            if "$ref" in value:
                return expand(definitions[value["$ref"].split("/")[-1]])
            return {key: expand(item) for key, item in value.items() if key != "title"}
        if isinstance(value, list):
            return [expand(item) for item in value]
        return value
    return expand(schema)


SMART_TOOL = {
    "type": "function",
    "name": "smart_technologie",
    "description": "Vyhledej schválené technologie, stav na dotaz, odešli povel, získej fotografii nebo spravuj místnosti a názvy. Zapnout/vypnout mění napájení, prepnout výhradně přepíná zapnuto/vypnuto; barva, jas a teplota bílé patří nastavit s parametry z aktuálního describe. Celý katalog zůstává na serveru.",
    "parameters": _inline_schema(SmartArguments.model_json_schema()),
}

_SHARED_INSTRUCTIONS = json.loads(Path(__file__).with_name("smart_instructions.json").read_text())
SMART_TOOL["description"] = _SHARED_INSTRUCTIONS["mandatory"]
SMART_INSTRUCTIONS = _SHARED_INSTRUCTIONS["guide"] + "\n\n" + _SHARED_INSTRUCTIONS["mandatory"] + "\n\n" + 'Room, location, location type, area and zone (místnost, umístění, typ umístění, oblast, zóna) mean the SAME registered room. kind means device kind. Actual room names remain distinct.\n"Jaké mám typy umístění?" ALWAYS rooms_list including empty rooms, never overview.locations.\n"Vytvoř umístění Sklad" means create_room; "přejmenuj typ umístění Lobby na Recepce" means rename_room.\n"Změň typ umístění zařízení LobbyPas na Lobby" means assign_devices; "odeber LobbyPas z místnosti" means remove_devices; "přejmenuj zařízení LobbyPas" means rename_devices; "smaž umístění X" means delete_room.\nFor all matching devices in THIS room resolve the exact room_ref then filters.room_ref plus capabilities. If the server reports room_ref unsupported, explain unavailability; never substitute a broader location substring group write. (bez umístění) is absence of assignment, not a deletable room.\nRooms use rooms_list and room_ref/room_selection_id, NEVER device selection_id. Keep last_room_selection separate from last_selection and last_target. Rooms paginate at most 200 per page; total counts every matching room, not the current page. For full enumeration keep requesting offsets until every match is listed; room_selection covers every match even across pages.\nRegistry changes use registry_prepare with catalog_revision and changes. Use only returned public references and approved global device rows. Templates support {name}, {room}, {index}; final names come from the server plan. A target can change only once per plan; compound create-and-assign requires successive plans using the newly returned room_ref.\nregistry_apply accepts only plan_id. Backend owns identity and confirmation. Never invent confirmed or confirmation_id. If requires_confirmation=false and the user clearly requested the change, finish prepare then apply without another question.\nIf requires_confirmation=true, the backend reads the EXACT plan and verifies the following real audio confirmation. Do not paraphrase, confirm on the user\'s behalf or call apply before backend confirmation. A text message cannot confirm. When confirmed, call registry_apply with that exact plan_id. After refusal, ambiguity, new target, interruption or expiry require a fresh preparation and voice confirmation.\nDo not remove devices from integrations. Deleting a room unassigns ALL members, never deletes devices. detached_devices counts approved devices only. A legacy protected_members rejection must be reported accurately; never reveal hidden members. Physical unavailability alone does not forbid registry changes.\nFor registry results report created/updated/deleted/unchanged and all errors. plan_changed, plan_expired, selection_expired require fresh preparation, never reuse confirmation. uncertain requires operation_status ORIGINAL request_id, never replay a write. Never claim atomic create-and-assign.\nThe host supplies api_version, authenticated session and write identity. Preserve unresolved_request_ids, original status recovery and durable delivery identities. Interruption of speech never cancels or repeats a sent write. Only validation explicitly marked not_sent permits repair before network submission. Devices use GLOBAL rows[i], never page index i+1; read omits controls and describe retains approved schemas. Exact component values, units and ranges come from this device. Never substitute power for unsupported settings. Camera image retrieval is not capture-time proof. Continue ordinary conversation when technologies are unavailable. Legacy MCP pagination is resolved inside the host. Main ON/OFF and child-lock actions remain separate.\n'


def request_id(session_id: str, call_id: str) -> str:
    return "voice-" + hashlib.sha256(f"{session_id}:{call_id}".encode()).hexdigest()


def decode_result(result) -> tuple[dict, list[dict]]:
    texts = [block.text for block in result.content if block.type == "text"]
    if len(texts) != 1:
        raise SmartError("invalid_mcp_response")
    try:
        value = json.loads(texts[0])
    except (ValueError, TypeError):
        raise SmartError("invalid_mcp_response") from None
    if not isinstance(value, dict):
        raise SmartError("invalid_mcp_response")
    images = []
    for block in result.content:
        if block.type == "image":
            try:
                raw = base64.b64decode(block.data, validate=True)
            except (ValueError, TypeError):
                raise SmartError("invalid_image") from None
            if len(raw) > 10 * 1024 * 1024 or not (
                (block.mimeType == "image/jpeg" and raw.startswith(b"\xff\xd8\xff"))
                or (block.mimeType == "image/png" and raw.startswith(b"\x89PNG\r\n\x1a\n"))
            ):
                raise SmartError("invalid_image")
            images.append({"mime": block.mimeType, "data": block.data})
        elif block.type != "text":
            raise SmartError("invalid_mcp_response")
    if result.isError:
        value["error"] = "mcp_operation_rejected"
    return value, images


def validate_public(value: dict) -> None:
    """Validate v2 compact data without inventing row identities or loading the full catalog."""
    if not isinstance(value.get("catalog_revision"), str) or not value["catalog_revision"]:
        raise SmartError("invalid_mcp_response")
    if "devices" in value:
        devices, rows, fields = value.get("devices"), value.get("rows"), value.get("fields")
        if (not isinstance(devices, list) or not isinstance(rows, list)
            or len(rows) != len(devices) or len(set(rows)) != len(rows)
            or any(type(row) is not int or row < 1 for row in rows)
            or not isinstance(fields, list) or len(fields) != 8
            or any(not isinstance(device, list) or len(device) != 8 for device in devices)):
            raise SmartError("invalid_partial_catalog")
        if [field.get("key") for field in fields] != ["name", "location", "kind", "controls", "readings", "current_state", "possible_states", "availability"]:
            raise SmartError("invalid_partial_catalog")
    if "matches" in value and (not isinstance(value["matches"], list)):
        raise SmartError("invalid_search_page")
    if "rooms" in value:
        if not isinstance(value["rooms"], list) or len(value["rooms"]) > 200 or type(value.get("total")) is not int or value["total"] < len(value["rooms"]):
            raise SmartError("invalid_rooms_page")
        for room in value["rooms"]:
            if not isinstance(room, dict) or set(room) != {"room_ref", "name", "device_count", "delete_allowed"} or not isinstance(room["room_ref"], str) or not room["room_ref"] or not isinstance(room["name"], str) or type(room["device_count"]) is not int or room["device_count"] < 0 or type(room["delete_allowed"]) is not bool:
                raise SmartError("invalid_rooms_page")
    if "room_selection" in value:
        selection = value["room_selection"]
        if not isinstance(selection, dict) or set(selection) != {"id", "count", "expires_at"} or not isinstance(selection["id"], str) or not selection["id"] or type(selection["count"]) is not int or selection["count"] < 0 or not isinstance(selection["expires_at"], str):
            raise SmartError("invalid_room_selection")
    normalize_public(value)
    if "plan" in value:
        from .registry_contract import PublicPlan
        try:
            PublicPlan.model_validate(value["plan"])
        except ValueError:
            raise SmartError("invalid_registry_plan") from None


@asynccontextmanager
async def mcp_connection(token: str):
    if not token or any(char.isspace() for char in token):
        raise SmartError("mcp_not_configured")
    # No redirects: an Authorization header must never reach another origin.
    async with httpx.AsyncClient(
        headers={"Authorization": f"Bearer {token}"}, timeout=40, follow_redirects=False
    ) as http:
        async with streamable_http_client(MCP_URL, http_client=http) as (read, write, _):
            async with ClientSession(read, write) as client:
                await client.initialize()
                listed = await client.list_tools()
                if [tool.name for tool in listed.tools] != ["smart_technologie"]:
                    raise SmartError("unexpected_mcp_tools")
                mode = listed.tools[0].inputSchema.get("properties", {}).get("response_mode", {})
                client.complete_supported = "complete" in mode.get("enum", [])
                filters = listed.tools[0].inputSchema.get("properties", {}).get("filters", {})
                client.room_ref_supported = "room_ref" in filters.get("properties", {})
                yield client


def normalize_public(value):
    """Accept the old non-executable preview without turning it into a plan."""
    from .registry_contract import PublicChange
    legacy = value.get("plan")
    if isinstance(legacy, dict) and legacy.get("id") == "" and legacy.get("expires_at") == "":
        if set(legacy) != {"id", "expires_at", "requires_confirmation", "changes"} or type(legacy["requires_confirmation"]) is not bool:
            raise SmartError("invalid_registry_plan")
        try:
            changes = [PublicChange.model_validate(c) for c in legacy["changes"]]
        except (ValueError, TypeError):
            raise SmartError("invalid_registry_plan") from None
        if not changes or any(c.status == "planned" for c in changes):
            raise SmartError("invalid_registry_plan")
        value.pop("plan")
        value["results"] = [c.model_dump(exclude_none=True) for c in changes]
        value["summary"] = {status: sum(c.status == status for c in changes) for status in {c.status for c in changes}}
        if all(c.status == "unchanged" for c in changes):
            value.pop("error", None)
    for selection, page in (("selection", "matches"), ("room_selection", "rooms")):
        item = value.get(selection)
        if isinstance(item, dict) and item.get("count") == 0:
            value.setdefault(page, [])
            value.setdefault("total", 0)
            value.setdefault("has_more", False)


async def call_smart(client, request):
    """Negotiate read-only transport, never retry or rewrite a mutation."""
    request = dict(request)
    op = request.get("operation")
    whole = op in {"search", "describe", "read"} and not ({"offset", "limit"} & request.keys())
    if whole and getattr(client, "complete_supported", False):
        request["response_mode"] = "complete"
    elif whole:
        request.pop("response_mode", None)
        return await _legacy_complete(client, request)
    deadline = time.monotonic() + 30
    if op == "operation_status":
        result = await asyncio.wait_for(client.call_tool("smart_technologie", request), timeout=30)
    else:
        result = await client.call_tool("smart_technologie", request)
    if whole and not result.isError:
        value, _ = decode_result(result)
        validate_public(value)
        key = "matches" if op == "search" else "devices"
        total = value.get("total")
        if type(total) is not int or value.get("has_more") is not False or total != len(value.get(key, [])):
            raise SmartError("invalid_complete_response")
        if op == "search" and (value.get("selection") or {}).get("count") != total:
            raise SmartError("invalid_complete_response")
        if len(result.content[0].text.encode()) > 4*1024*1024:
            raise SmartError("response_too_large")
    if op != "operation_status":
        return result
    delay = 0.5
    while True:
        value, _ = decode_result(result)
        if result.isError or (value.get("operation") or {}).get("status") not in {"running", "pending", "queued", "recording"}:
            return result
        remaining = deadline - time.monotonic()
        if remaining <= delay:
            return result
        await asyncio.sleep(delay)
        remaining = deadline - time.monotonic()
        try:
            result = await asyncio.wait_for(client.call_tool("smart_technologie", request), timeout=remaining)
        except asyncio.TimeoutError:
            return result
        delay = min(2.0, delay * 2)


def _namespace_page(value, index):
    """Page dictionaries have local references; preserve every tuple binding."""
    fields = value.get("fields")
    if not fields:
        return
    prefix = f"page{index}-"
    dictionaries = ((3,"component_names"),(3,"action_names"),(3,"parameter_definitions"),(4,"reading_names"),(6,"state_definitions"))
    for i, key in dictionaries:
        if key in fields[i]:
            fields[i][key] = {prefix + ref: item for ref, item in fields[i][key].items()}
    for device in value.get("devices", []):
        for item in device[3]:
            for pos in (1,2,3):
                if item[pos]:
                    item[pos] = prefix + item[pos]
        for item in device[4]:
            for pos in (1,2):
                if item[pos]:
                    item[pos] = prefix + item[pos]
        for item in device[6]:
            for pos in (0,1):
                if item[pos]:
                    item[pos] = prefix + item[pos]


async def _legacy_complete(client, request):
    """Read-only compatibility pagination is internal, with complete-count checks."""
    from mcp.types import TextContent
    op = request["operation"]
    limit = 200 if op == "search" else 8
    offset = 0
    merged = None
    while True:
        result = await client.call_tool("smart_technologie", {**request, "offset": offset, "limit": limit})
        if result.isError:
            return result
        value, images = decode_result(result)
        validate_public(value)
        if images:
            raise SmartError("unexpected_image")
        key = "matches" if op == "search" else "devices"
        items = value.get(key)
        total = value.get("total")
        if not isinstance(items,list) or type(total) is not int or total < 0:
            raise SmartError("invalid_complete_response")
        _namespace_page(value, offset)
        if merged is None:
            merged = value
        else:
            if total != merged["total"] or value.get("catalog_revision") != merged.get("catalog_revision"):
                raise SmartError("catalog_changed")
            for k in (key,"rows","results"):
                if k in value:
                    merged.setdefault(k,[]).extend(value[k])
            for status,count in value.get("summary",{}).items():
                merged.setdefault("summary",{})[status] = merged.get("summary",{}).get(status,0) + count
            for i,field in enumerate(value.get("fields",[])):
                for k in ("component_names","action_names","parameter_definitions","reading_names","state_definitions"):
                    if k in field:
                        merged["fields"][i].setdefault(k,{}).update(field[k])
        offset += len(items)
        if offset > total or (offset < total and not items):
            raise SmartError("invalid_complete_response")
        if offset == total:
            merged["has_more"] = False
            rows = merged.get("rows",[])
            identities = rows if op != "search" else [m["row"] for m in merged["matches"]]
            if len(identities)!=len(set(identities)):
                raise SmartError("invalid_complete_response")
            text = json.dumps(merged,ensure_ascii=False,separators=(",",":"))
            if len(text.encode()) > 4*1024*1024:
                raise SmartError("response_too_large")
            return result.model_copy(update={"content":[TextContent(type="text",text=text)]})
        if len(json.dumps(merged).encode()) > 4*1024*1024:
            raise SmartError("response_too_large")
