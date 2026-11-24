"""Official MCP Streamable HTTP transport for scoped Hotel capabilities."""

from collections.abc import Callable
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import date, datetime
from typing import Annotated, Any, Literal, TypeVar, cast

from fastapi import HTTPException
from mcp.server.auth.handlers.revoke import RevocationHandler
from mcp.server.auth.handlers.token import TokenHandler
from mcp.server.auth.middleware.client_auth import ClientAuthenticator
from mcp.server.auth.routes import (
    build_metadata,
    cors_middleware,
    create_auth_routes,
    create_protected_resource_routes,
)
from mcp.server.auth.settings import ClientRegistrationOptions, RevocationOptions
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import Tool, ToolAnnotations
from pydantic import UUID4, AnyHttpUrl, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import FormData, Headers
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route
from starlette.types import Receive, Scope, Send

from app.api.routes import breakfast, egg_orders, inventory, issues
from app.api.schemas import (
    BreakfastDietUpdate,
    BreakfastOrderCreate,
    BreakfastStatus,
    HousekeepingRoomStatus,
    HousekeepingRoomStatusUpdate,
    InventoryCardCreate,
    InventoryMovementCreate,
    InventoryMovementRead,
    IssueCreate,
    IssueUpdate,
    LostFoundItemCreate,
    LostFoundItemUpdate,
    ReservationAmenityKind,
    ReservationAmenityState,
    ReservationRequirementConfirm,
)
from app.db.models import (
    InventoryCardType,
    IssuePriority,
    IssueStatus,
    LostFoundItemType,
    LostFoundStatus,
)
from app.db.warehouse import Warehouse
from app.security.cml_requests import ReceiptFault, WebRequests, owner_key
from app.security.hotel_oauth import (
    BREAKFAST_READ,
    BREAKFAST_WRITE,
    CML,
    HOUSEKEEPING_READ,
    HOUSEKEEPING_WRITE,
    ISSUER,
    ISSUES_READ,
    ISSUES_WRITE,
    LOST_FOUND_READ,
    LOST_FOUND_WRITE,
    ORIGIN,
    OWNER,
    RESOURCE,
    SCOPES,
    WAREHOUSE_READ_SCOPES,
    WAREHOUSE_WRITE_SCOPES,
    HotelOAuth,
    access_digest,
)
from app.services import hotel_mcp_inventory as stock
from app.services import hotel_mcp_operations as ops
from app.services import hotel_mcp_reads as reads
from app.services import hotel_mcp_rooms as rooms
from app.services import hotel_mcp_writes as writes
from app.services.hotel_mcp_file import ChatFile

ISSUER_PATH = "/hotel-oauth"
AUTH_METADATA = "/.well-known/oauth-authorization-server" + ISSUER_PATH
RESOURCE_METADATA = "/.well-known/oauth-protected-resource/mcp"
ALLOWED_ORIGINS = {ORIGIN, CML, "https://chatgpt.com"}
READ = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)
READ_EXTERNAL = READ.model_copy(update={"openWorldHint": True})
CREATE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)
CHANGE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=True,
    idempotentHint=True,
    openWorldHint=False,
)
WRITE_SCOPES = frozenset(
    {
        BREAKFAST_WRITE,
        HOUSEKEEPING_WRITE,
        ISSUES_WRITE,
        LOST_FOUND_WRITE,
        *WAREHOUSE_WRITE_SCOPES,
    }
)
Guest = Annotated[str, Field(min_length=1, max_length=255)]
GuestCount = Annotated[int, Field(strict=True, ge=1, le=20)]
Reservation = Annotated[str, Field(min_length=1, max_length=128)]
Identifier = Annotated[int, Field(strict=True, ge=1, le=2**31 - 1)]
After = Annotated[int, Field(strict=True, ge=0, le=2**31 - 1)]
PageSize = Annotated[int, Field(strict=True, ge=1, le=40)]
Category = Annotated[str, Field(min_length=1, max_length=64)]
Room = Annotated[str, Field(min_length=1, max_length=32)]
Result = TypeVar("Result")
EGG_ORDER_SCOPE = f"inventory_{Warehouse.BREAKFAST}:write"

TOOL_SCOPES = {
    "breakfast_day_get": BREAKFAST_READ,
    "breakfast_order_get": BREAKFAST_READ,
    "breakfast_daily_export": BREAKFAST_READ,
    "lost_found_list": LOST_FOUND_READ,
    "lost_found_get": LOST_FOUND_READ,
    "lost_found_photo_get": LOST_FOUND_READ,
    "issue_list": ISSUES_READ,
    "issue_get": ISSUES_READ,
    "issue_photo_get": ISSUES_READ,
    "issue_create": ISSUES_WRITE,
    "issue_update": ISSUES_WRITE,
    "issue_delete": ISSUES_WRITE,
    "issue_photo_add": ISSUES_WRITE,
    "housekeeping_rooms_list": HOUSEKEEPING_READ,
    "housekeeping_room_get": HOUSEKEEPING_READ,
    "housekeeping_room_status_set": HOUSEKEEPING_WRITE,
    "housekeeping_requirement_confirm": HOUSEKEEPING_WRITE,
    "housekeeping_amenity_set": HOUSEKEEPING_WRITE,
    "inventory_egg_order_latest": EGG_ORDER_SCOPE,
    "inventory_egg_order_status": EGG_ORDER_SCOPE,
    "inventory_egg_order_submit": EGG_ORDER_SCOPE,
    "breakfast_order_create": BREAKFAST_WRITE,
    "breakfast_order_update": BREAKFAST_WRITE,
    "breakfast_order_delete": BREAKFAST_WRITE,
    "breakfast_diet_set": BREAKFAST_WRITE,
    "breakfast_orders_reactivate": BREAKFAST_WRITE,
    "breakfast_orders_delete": BREAKFAST_WRITE,
    "lost_found_create": LOST_FOUND_WRITE,
    "lost_found_update": LOST_FOUND_WRITE,
    "lost_found_delete": LOST_FOUND_WRITE,
    "lost_found_photo_add": LOST_FOUND_WRITE,
}
WAREHOUSE_READ_TOOLS = frozenset(
    {
        "inventory_items_list",
        "inventory_item_get",
        "inventory_movements_list",
        "inventory_movement_get",
        "inventory_item_activity",
        "inventory_cards_list",
        "inventory_card_get",
        "inventory_pictogram_get",
        "inventory_stocktake_pdf",
    }
)
WAREHOUSE_WRITE_TOOLS = frozenset(
    {
        "inventory_item_create",
        "inventory_item_update",
        "inventory_item_delete",
        "inventory_movement_add",
        "inventory_movement_delete",
        "inventory_card_create",
        "inventory_card_delete",
        "inventory_pictogram_set",
    }
)


@dataclass(frozen=True)
class Principal(ops.Actor):
    breakfast_manager: bool = False


principal: ContextVar[Principal | None] = ContextVar("hotel_mcp_principal", default=None)


def _strip_schema_titles(value: Any) -> Any:
    if isinstance(value, list):
        return [_strip_schema_titles(item) for item in value]
    if isinstance(value, dict):
        return {
            key: item
            if key in {"default", "const", "enum", "examples"}
            else _strip_schema_titles(item)
            for key, item in value.items()
            if key != "title" or not isinstance(item, str)
        }
    return value


def _available(name: str, actor: Principal) -> bool:
    if name == "hotel_operation_get":
        return bool(WRITE_SCOPES & actor.permissions)
    if name in WAREHOUSE_READ_TOOLS:
        return not actor.permissions.isdisjoint(WAREHOUSE_READ_SCOPES)
    if name in WAREHOUSE_WRITE_TOOLS:
        return not actor.permissions.isdisjoint(WAREHOUSE_WRITE_SCOPES)
    return TOOL_SCOPES[name] in actor.permissions and (
        name != "breakfast_daily_export" or actor.breakfast_manager
    )


class HotelTools(FastMCP):
    async def list_tools(self) -> list[Tool]:
        actor = principal.get()
        if actor is None:
            return []
        tools = await super().list_tools()
        result = []
        for tool in tools:
            if not _available(tool.name, actor):
                continue
            inputs = _strip_schema_titles(tool.inputSchema)
            warehouse = inputs.get("$defs", {}).get("Warehouse")
            if warehouse is not None:
                mode = "write" if tool.name in WAREHOUSE_WRITE_TOOLS else "read"
                warehouse["enum"] = [
                    value
                    for value in warehouse["enum"]
                    if f"inventory_{value}:{mode}" in actor.permissions
                ]
            result.append(
                tool.model_copy(
                    update={
                        "inputSchema": inputs,
                        "outputSchema": _strip_schema_titles(tool.outputSchema),
                    }
                )
            )
        return result


class HotelMCP:
    def __init__(self, sessions: Callable[[], Session]) -> None:
        self.sessions = sessions
        self.provider = HotelOAuth(sessions)
        self.journal = WebRequests(sessions)
        self.server = HotelTools(
            "KájovoHotel",
            instructions="Přehled načti pro zvolený provozní den nebo sklad. Detail vyber podle ID. "
            "Po nejasném zápisu čti hotel_operation_get s původním operation_id.",
            stateless_http=True,
            json_response=True,
            max_request_body_size=65_536,
            transport_security=TransportSecuritySettings(
                enable_dns_rebinding_protection=True,
                allowed_hosts=["hotel.hcasc.cz", "testserver", "localhost:*", "127.0.0.1:*"],
                allowed_origins=sorted(ALLOWED_ORIGINS),
            ),
        )
        self._register()
        self._register_stock_reads()
        self._register_writes()
        self._register_stock_writes()
        self._register_egg_orders()
        self.transport = self.server.streamable_http_app()

    def routes(self) -> list[Route]:
        registration = ClientRegistrationOptions(
            enabled=True,
            valid_scopes=list(SCOPES),
            # Dynamic clients can omit scope during registration. An authorization
            # request still needs to explicitly ask for any scope above the read default.
            default_scopes=list(SCOPES),
        )
        revocation = RevocationOptions(enabled=True)
        issuer = AnyHttpUrl(ISSUER)
        sdk_routes = create_auth_routes(
            self.provider,
            issuer,
            client_registration_options=registration,
            revocation_options=revocation,
        )
        authenticator = ClientAuthenticator(self.provider)
        token_handler = TokenHandler(self.provider, authenticator)
        revoke_handler = RevocationHandler(self.provider, authenticator)

        async def token(request: Request) -> Response:
            if request.method == "POST":
                resources = (await request.form()).getlist("resource")
                if resources and resources != [RESOURCE]:
                    return JSONResponse({"error": "invalid_target"}, status_code=400)
            return cast(Response, await token_handler.handle(request))

        async def revoke(request: Request) -> Response:
            form = await request.form()
            client = await self.provider.get_client(str(form.get("client_id", "")))
            if (
                client is not None
                and client.token_endpoint_auth_method == "none"
                and "client_secret" not in form
            ):
                request._form = FormData([*form.multi_items(), ("client_secret", "")])
            return await revoke_handler.handle(request)

        async def auth_metadata(_request: Request) -> JSONResponse:
            data = build_metadata(issuer, None, registration, revocation).model_dump(
                mode="json",
                exclude_none=True,
            )
            data.update(
                token_endpoint_auth_methods_supported=["none"],
                revocation_endpoint_auth_methods_supported=["none"],
                authorization_response_iss_parameter_supported=True,
            )
            return JSONResponse(data, headers={"Cache-Control": "no-store"})

        oauth_routes = [
            Route(ISSUER_PATH + route.path, route.app, methods=route.methods)
            for route in sdk_routes
            if route.path not in ("/.well-known/oauth-authorization-server", "/token", "/revoke")
        ]
        oauth_routes.extend(
            [
                Route(
                    ISSUER_PATH + "/token",
                    cors_middleware(token, ["POST", "OPTIONS"]),
                    methods=["POST", "OPTIONS"],
                ),
                Route(
                    ISSUER_PATH + "/revoke",
                    cors_middleware(revoke, ["POST", "OPTIONS"]),
                    methods=["POST", "OPTIONS"],
                ),
            ]
        )
        return [
            Route("/mcp", self, methods=["GET", "POST", "DELETE"], name="hotel_mcp"),
            Route(
                AUTH_METADATA,
                cors_middleware(auth_metadata, ["GET", "OPTIONS"]),
                methods=["GET", "OPTIONS"],
            ),
            *create_protected_resource_routes(
                AnyHttpUrl(RESOURCE),
                [issuer],
                scopes_supported=list(SCOPES),
                resource_name="KájovoHotel",
            ),
            *oauth_routes,
        ]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        headers = Headers(scope=scope)
        origins = headers.getlist("origin")
        if origins and (len(origins) != 1 or origins[0] not in ALLOWED_ORIGINS):
            await JSONResponse({"error": "invalid_origin"}, status_code=403)(scope, receive, send)
            return
        state = scope.get("state", {})
        cml_permissions = state.get("hotel_mcp_permissions")
        if cml_permissions is not None and state.get("cml_web_claims"):
            actor = Principal(
                key=owner_key(state["cml_web_claims"]),
                permissions=frozenset(cml_permissions).intersection(SCOPES),
                session=state["_kajovo_auth_session"],
                breakfast_manager=state.get("hotel_mcp_breakfast_manager", False),
            )
        else:
            values = headers.getlist("authorization")
            authenticated = (
                await self.provider.load_access_token(values[0][7:])
                if len(values) == 1
                and values[0].startswith("Bearer ")
                and not scope.get("query_string")
                else None
            )
            if (
                authenticated is None
                or authenticated.resource != RESOURCE
                or authenticated.subject != OWNER
                or not set(authenticated.scopes).intersection(SCOPES)
            ):
                challenge = f'Bearer resource_metadata="{ORIGIN}{RESOURCE_METADATA}"'
                await JSONResponse(
                    {"error": "invalid_token"},
                    status_code=401,
                    headers={"WWW-Authenticate": challenge, "Cache-Control": "no-store"},
                )(scope, receive, send)
                return
            actor = Principal(
                key=OWNER + ":owner",
                permissions=frozenset(authenticated.scopes).intersection(SCOPES),
                session={
                    "email": OWNER,
                    "active_role": "admin",
                    "role": "admin",
                    "actor_type": "admin",
                    "cml_permissions": authenticated.scopes,
                },
                oauth_digest=access_digest(authenticated),
                breakfast_manager=True,
            )
        bound = principal.set(actor)
        try:
            await self.transport(scope, receive, send)
        finally:
            principal.reset(bound)

    def _read(
        self,
        permission: str,
        operation: Callable[[Session], Result],
        *,
        breakfast_manager: bool = False,
    ) -> Result:
        actor = principal.get()
        if (
            actor is None
            or permission not in actor.permissions
            or (breakfast_manager and not actor.breakfast_manager)
        ):
            raise ToolError("hotel_scope_denied")
        with self.sessions() as db:
            try:
                return operation(db)
            except HTTPException as error:
                raise ToolError(str(error.detail)) from None

    def _register(self) -> None:
        @self.server.tool(annotations=READ)
        async def breakfast_day_get(
            day: date, after: After = 0, limit: PageSize = 10
        ) -> reads.BreakfastDay:
            """Přečti součty snídaní a stránku objednávek dne. Pokračuj pomocí next_after."""
            return await run_in_threadpool(
                self._read,
                BREAKFAST_READ,
                lambda db: reads.breakfast_day(db, day, after, limit),
            )

        @self.server.tool(annotations=READ)
        async def breakfast_order_get(
            order_id: Identifier,
            include_reservations: bool = False,
        ) -> reads.BreakfastOrderDetail:
            """Přečti objednávku. Volba include_reservations přidá rezervace a jejich diety."""
            return await run_in_threadpool(
                self._read,
                BREAKFAST_READ,
                lambda db: reads.breakfast_order(db, order_id, include_reservations),
            )

        @self.server.tool(annotations=READ)
        async def breakfast_daily_export(day: date) -> reads.FileLink:
            """Vrať odkaz na aktuální denní PDF snídaní v přihlášeném CML."""
            return await run_in_threadpool(
                self._read,
                BREAKFAST_READ,
                lambda _db: reads.breakfast_export(day),
                breakfast_manager=True,
            )

        @self.server.tool(annotations=READ)
        async def lost_found_list(
            item_type: LostFoundItemType | None = None,
            status: LostFoundStatus | None = None,
            category: Category | None = None,
            room_number: Room | None = None,
            before_id: Identifier | None = None,
            limit: PageSize = 10,
            start_day: date | None = None,
            end_day: date | None = None,
        ) -> reads.LostFoundPage:
            """Najdi ztráty nebo nálezy. Pokračuj pomocí next_before_id."""
            return await run_in_threadpool(
                self._read,
                LOST_FOUND_READ,
                lambda db: reads.lost_found_list(
                    db,
                    item_type=item_type,
                    status=status,
                    category=category,
                    room_number=room_number,
                    before_id=before_id,
                    limit=limit,
                    start_day=start_day,
                    end_day=end_day,
                ),
            )

        @self.server.tool(annotations=READ)
        async def lost_found_get(
            item_id: Identifier,
            include_handover: bool = False,
        ) -> reads.LostFoundDetail:
            """Přečti popis, stav a fotografie. include_handover přidá údaje o převzetí."""
            return await run_in_threadpool(
                self._read,
                LOST_FOUND_READ,
                lambda db: reads.lost_found_detail(db, item_id, include_handover),
            )

        @self.server.tool(annotations=READ)
        async def lost_found_photo_get(
            item_id: Identifier,
            photo_id: Identifier,
            kind: Literal["thumb", "original"] = "thumb",
        ) -> reads.FileLink:
            """Vrať odkaz na vybraný náhled nebo původní fotografii v přihlášeném CML."""
            return await run_in_threadpool(
                self._read,
                LOST_FOUND_READ,
                lambda db: reads.lost_found_photo(db, item_id, photo_id, kind),
            )

        @self.server.tool(annotations=READ)
        async def issue_list(
            priority: IssuePriority | None = None,
            status: IssueStatus | None = None,
            location: Guest | None = None,
            room_number: Room | None = None,
            before_id: Identifier | None = None,
            limit: PageSize = 10,
        ) -> reads.IssuePage:
            """Najdi hlášené závady podle pokoje, stavu nebo priority. Pokračuj pomocí next_before_id."""
            return await run_in_threadpool(
                self._read,
                ISSUES_READ,
                lambda db: reads.issue_list(
                    db,
                    priority=priority,
                    status=status,
                    location=location,
                    room_number=room_number,
                    before_id=before_id,
                    limit=limit,
                ),
            )

        @self.server.tool(annotations=READ)
        async def issue_get(issue_id: Identifier) -> reads.IssueDetail:
            """Přečti popis závady, přiřazení, průběh a seznam fotografií."""
            return await run_in_threadpool(
                self._read, ISSUES_READ, lambda db: reads.issue_detail(db, issue_id)
            )

        @self.server.tool(annotations=READ)
        async def issue_photo_get(
            issue_id: Identifier,
            photo_id: Identifier,
            kind: Literal["thumb", "original"] = "thumb",
        ) -> reads.FileLink:
            """Vrať odkaz na náhled nebo původní fotografii závady v přihlášeném CML."""
            return await run_in_threadpool(
                self._read, ISSUES_READ, lambda db: reads.issue_photo(db, issue_id, photo_id, kind)
            )

        @self.server.tool(annotations=READ_EXTERNAL)
        async def housekeeping_rooms_list(
            day: date,
            floor: Room | None = None,
            room_number: Room | None = None,
            after_room_id: Reservation | None = None,
            limit: PageSize = 10,
        ) -> rooms.RoomPage:
            """Přečti stavy pokojů a součty pobytů. Pokračuj pomocí next_after_room_id."""
            return await run_in_threadpool(
                self._read,
                HOUSEKEEPING_READ,
                lambda db: rooms.list_rooms(db, day, floor, room_number, after_room_id, limit),
            )

        @self.server.tool(annotations=READ_EXTERNAL)
        async def housekeeping_room_get(
            day: date, room_id: Reservation, include_reservations: bool = False
        ) -> rooms.RoomDetail:
            """Přečti stav a blokace pokoje. include_reservations přidá podklady k pobytům."""
            return await run_in_threadpool(
                self._read,
                HOUSEKEEPING_READ,
                lambda db: rooms.detail(db, day, room_id, include_reservations),
            )

    def _stock_read(self, warehouse: Warehouse, operation: Callable[[Session], Result]) -> Result:
        def read(db: Session) -> Result:
            with stock.warehouse_session(db, warehouse) as stock_db:
                return operation(stock_db)

        return self._read(f"inventory_{warehouse}:read", read)

    def _register_stock_reads(self) -> None:
        @self.server.tool(annotations=READ)
        async def inventory_items_list(
            warehouse: Warehouse,
            search: Guest | None = None,
            low_stock: bool = False,
            after_id: Identifier | None = None,
            limit: PageSize = 10,
        ) -> stock.Page[stock.ItemSummary]:
            """Najdi skladové položky podle názvu nebo minima. Pokračuj pomocí next_id."""
            return await run_in_threadpool(
                self._stock_read,
                warehouse,
                lambda db: stock.list_items(db, search, low_stock, after_id, limit),
            )

        @self.server.tool(annotations=READ)
        async def inventory_item_get(warehouse: Warehouse, item_id: Identifier) -> stock.ItemDetail:
            """Přečti přesný stav, jednotku a minimum jedné skladové položky."""
            return await run_in_threadpool(
                self._stock_read, warehouse, lambda db: stock.item_detail(db, item_id)
            )

        @self.server.tool(annotations=READ)
        async def inventory_movements_list(
            warehouse: Warehouse,
            item_id: Identifier | None = None,
            before_id: Identifier | None = None,
            limit: PageSize = 10,
        ) -> stock.Page[stock.MovementSummary]:
            """Najdi pohyby skladu nebo vybrané položky. Pokračuj pomocí next_id."""
            return await run_in_threadpool(
                self._stock_read,
                warehouse,
                lambda db: stock.list_movements(db, item_id, before_id, limit),
            )

        @self.server.tool(annotations=READ)
        async def inventory_movement_get(
            warehouse: Warehouse,
            movement_id: Identifier,
        ) -> InventoryMovementRead:
            """Přečti skladový pohyb, označení dokladu a poznámku."""
            return await run_in_threadpool(
                self._stock_read, warehouse, lambda db: stock.movement_detail(db, movement_id)
            )

        @self.server.tool(annotations=READ)
        async def inventory_item_activity(
            warehouse: Warehouse,
            item_id: Identifier,
            before_id: Identifier | None = None,
            limit: PageSize = 10,
        ) -> stock.Page[stock.AuditEntry]:
            """Přečti historii změn skladové položky. Pokračuj pomocí next_id."""
            return await run_in_threadpool(
                self._stock_read,
                warehouse,
                lambda db: stock.item_activity(db, item_id, before_id, limit),
            )

        @self.server.tool(annotations=READ)
        async def inventory_cards_list(
            warehouse: Warehouse,
            card_type: InventoryCardType | None = None,
            before_id: Identifier | None = None,
            limit: PageSize = 10,
        ) -> stock.Page[stock.CardSummary]:
            """Najdi skladové doklady, případně jen zvolený typ. Pokračuj pomocí next_id."""
            return await run_in_threadpool(
                self._stock_read,
                warehouse,
                lambda db: stock.list_cards(db, card_type, before_id, limit),
            )

        @self.server.tool(annotations=READ)
        async def inventory_card_get(
            warehouse: Warehouse,
            card_id: Identifier,
            after_id: Identifier | None = None,
            limit: PageSize = 10,
        ) -> stock.CardDetail:
            """Přečti skladový doklad a stránku řádků. Pokračuj pomocí lines.next_id."""
            return await run_in_threadpool(
                self._stock_read,
                warehouse,
                lambda db: stock.card_detail(db, card_id, after_id, limit),
            )

        @self.server.tool(annotations=READ)
        async def inventory_pictogram_get(
            warehouse: Warehouse,
            item_id: Identifier,
            kind: Literal["thumb", "original"] = "thumb",
        ) -> reads.FileLink:
            """Vrať odkaz na náhled nebo originál piktogramu v přihlášeném CML."""
            return await run_in_threadpool(
                self._stock_read,
                warehouse,
                lambda db: stock.pictogram(db, warehouse, item_id, kind),
            )

        @self.server.tool(annotations=READ)
        async def inventory_stocktake_pdf(warehouse: Warehouse) -> reads.FileLink:
            """Vrať odkaz na aktuální inventurní PDF vybraného skladu v přihlášeném CML."""
            return await run_in_threadpool(
                self._read, f"inventory_{warehouse}:read", lambda _db: stock.stocktake(warehouse)
            )

    def _egg_order(self, action: Callable[[str, Session], Result]) -> Result:
        actor = principal.get()
        if actor is None:
            raise ToolError("hotel_scope_denied")
        with self.sessions() as db:
            try:
                ops.require_current(db, actor, EGG_ORDER_SCOPE)
                return action(actor.key, db)
            except HTTPException as error:
                raise ToolError(str(error.detail or "Objednávka nebyla nalezena.")) from None

    def _register_egg_orders(self) -> None:
        @self.server.tool(annotations=READ)
        async def inventory_egg_order_latest() -> stock.EggLatest:
            """Přečti poslední vlastní objednávku vajec ze Skladu Snídaně."""
            return await run_in_threadpool(
                self._egg_order,
                lambda owner, db: stock.EggLatest(order=egg_orders.latest_for_owner(owner, db)),
            )

        @self.server.tool(annotations=READ_EXTERNAL)
        async def inventory_egg_order_status(order_id: UUID4) -> egg_orders.OrderStatus:
            """Ověř odeslání podle původního ID objednávky vajec. Nový e-mail nevytvoří."""
            return await run_in_threadpool(
                self._egg_order, lambda _owner, db: egg_orders.recover_status(order_id, db)
            )

        @self.server.tool(
            annotations=ToolAnnotations(
                readOnlyHint=False,
                destructiveHint=True,
                idempotentHint=True,
                openWorldHint=True,
            )
        )
        async def inventory_egg_order_submit(
            operation_id: UUID4,
            confirmed_previous_id: UUID4 | None = None,
            confirmed_delivery_date: date | None = None,
        ) -> stock.EggSubmission:
            """Odešli objednávku 180 vajec. Při opakované objednávce potvrď předchozí ID a nový den."""
            click = egg_orders.OrderClick(
                id=operation_id,
                confirmed_previous_id=confirmed_previous_id,
                confirmed_delivery_date=confirmed_delivery_date,
            )
            return await run_in_threadpool(
                self._egg_order,
                lambda owner, db: stock.EggSubmission(
                    outcome=egg_orders.submit_for_owner(click, owner, db)
                ),
            )

    def _operation_get(self, operation_id: UUID4) -> ops.OperationOut:
        actor = principal.get()
        if actor is None:
            raise ToolError("hotel_scope_denied")
        with self.sessions() as db:
            try:
                return ops.lookup(db, self.journal, actor, str(operation_id))
            except (ReceiptFault, HTTPException) as error:
                raise ToolError(getattr(error, "code", "hotel_scope_denied")) from None

    def _write(
        self,
        operation_id: UUID4,
        tool: str,
        method: str,
        path: str,
        arguments: dict[str, Any],
        effect: Callable[[Request, Session], dict[str, Any]],
        *,
        success_status: int | None = None,
        permission: str | None = None,
    ) -> ops.OperationOut:
        actor = principal.get()
        if actor is None:
            raise ToolError("hotel_scope_denied")
        with self.sessions() as db:
            try:
                return ops.execute(
                    db,
                    self.journal,
                    actor,
                    operation_id=str(operation_id),
                    tool=tool,
                    permission=permission or TOOL_SCOPES[tool],
                    method=method,
                    path=path,
                    arguments=arguments,
                    change=effect,
                    success_status=(
                        success_status
                        if success_status is not None
                        else {"POST": 201, "DELETE": 204}.get(method, 200)
                    ),
                )
            except ReceiptFault as error:
                raise ToolError(error.code) from None
            except HTTPException as error:
                raise ToolError(str(error.detail)) from None

    def _stock_write(
        self,
        warehouse: Warehouse,
        operation_id: UUID4,
        tool: str,
        method: str,
        suffix: str,
        arguments: dict[str, Any],
        operation: Callable[[Request, Session], dict[str, Any]],
        *,
        success_status: int | None = None,
    ) -> ops.OperationOut:
        def apply(request: Request, db: Session) -> dict:
            with stock.warehouse_session(db, warehouse) as stock_db:
                return operation(request, stock_db)

        return self._write(
            operation_id,
            tool,
            method,
            f"/api/v1/inventory{suffix}?warehouse={warehouse}",
            {"warehouse": warehouse.value, **arguments},
            apply,
            permission=f"inventory_{warehouse}:write",
            success_status=success_status,
        )

    def _register_stock_writes(self) -> None:
        @self.server.tool(annotations=CREATE)
        async def inventory_item_create(
            warehouse: Warehouse,
            operation_id: UUID4,
            item: stock.ItemCreate,
        ) -> ops.OperationOut:
            """Založ skladovou položku s jednotkou, počátečním stavem a minimem."""
            return await run_in_threadpool(
                self._stock_write,
                warehouse,
                operation_id,
                "inventory_item_create",
                "POST",
                "",
                item.model_dump(mode="json"),
                lambda _request, db: stock.item_receipt(inventory.create_item(item.native(), db)),
            )

        @self.server.tool(annotations=CHANGE)
        async def inventory_item_update(
            warehouse: Warehouse,
            operation_id: UUID4,
            item_id: Identifier,
            expected_updated_at: datetime,
            changes: stock.ItemPatch,
        ) -> ops.OperationOut:
            """Uprav údaje položky podle updated_at. Změnu množství zaeviduj jako pohyb."""
            return await run_in_threadpool(
                self._stock_write,
                warehouse,
                operation_id,
                "inventory_item_update",
                "PUT",
                f"/{item_id}",
                {
                    "item_id": item_id,
                    "expected_updated_at": expected_updated_at.isoformat(),
                    "changes": changes.model_dump(mode="json", exclude_none=True),
                },
                lambda _request, db: stock.update_item(db, item_id, changes, expected_updated_at),
            )

        @self.server.tool(annotations=CHANGE)
        async def inventory_item_delete(
            warehouse: Warehouse,
            operation_id: UUID4,
            item_id: Identifier,
        ) -> ops.OperationOut:
            """Smaž skladovou položku bez historie pohybů nebo dokladů."""
            return await run_in_threadpool(
                self._stock_write,
                warehouse,
                operation_id,
                "inventory_item_delete",
                "DELETE",
                f"/{item_id}",
                {"item_id": item_id},
                lambda request, db: stock.delete_item(db, request, item_id),
            )

        @self.server.tool(annotations=CHANGE)
        async def inventory_movement_add(
            warehouse: Warehouse,
            operation_id: UUID4,
            item_id: Identifier,
            movement: InventoryMovementCreate,
        ) -> ops.OperationOut:
            """Zaúčtuj příjem, výdej nebo odpis jedné položky. Příjem vyžaduje číslo dokladu."""
            return await run_in_threadpool(
                self._stock_write,
                warehouse,
                operation_id,
                "inventory_movement_add",
                "POST",
                f"/{item_id}/movements",
                {"item_id": item_id, **movement.model_dump(mode="json")},
                lambda _request, db: {
                    "record_id": inventory.record_movement(item_id, movement, db)
                },
                success_status=200,
            )

        @self.server.tool(annotations=CHANGE)
        async def inventory_movement_delete(
            warehouse: Warehouse,
            operation_id: UUID4,
            item_id: Identifier,
            movement_id: Identifier,
        ) -> ops.OperationOut:
            """Vrať samostatný skladový pohyb. Pro pohyb z dokladu použij smazání dokladu."""
            return await run_in_threadpool(
                self._stock_write,
                warehouse,
                operation_id,
                "inventory_movement_delete",
                "DELETE",
                f"/{item_id}/movements/{movement_id}",
                {"item_id": item_id, "movement_id": movement_id},
                lambda request, db: stock.delete_movement(db, request, item_id, movement_id),
            )

        @self.server.tool(annotations=CHANGE)
        async def inventory_card_create(
            warehouse: Warehouse,
            operation_id: UUID4,
            card: InventoryCardCreate,
        ) -> ops.OperationOut:
            """Ulož příjemku, výdejku nebo odpis s vybranými položkami v jednom dokladu."""
            return await run_in_threadpool(
                self._stock_write,
                warehouse,
                operation_id,
                "inventory_card_create",
                "POST",
                "/cards",
                card.model_dump(mode="json"),
                lambda _request, db: {"record_id": inventory.create_card(card, db).id},
            )

        @self.server.tool(annotations=CHANGE)
        async def inventory_card_delete(
            warehouse: Warehouse,
            operation_id: UUID4,
            card_id: Identifier,
        ) -> ops.OperationOut:
            """Smaž skladový doklad podle ID a vrať jeho pohyby."""
            return await run_in_threadpool(
                self._stock_write,
                warehouse,
                operation_id,
                "inventory_card_delete",
                "DELETE",
                f"/cards/{card_id}",
                {"card_id": card_id},
                lambda request, db: stock.delete_card(db, request, card_id),
            )

        @self.server.tool(
            annotations=ToolAnnotations(
                readOnlyHint=False,
                destructiveHint=True,
                idempotentHint=True,
                openWorldHint=True,
            ),
            meta={"openai/fileParams": ["file"]},
        )
        async def inventory_pictogram_set(
            warehouse: Warehouse,
            operation_id: UUID4,
            item_id: Identifier,
            file: ChatFile,
        ) -> ops.OperationOut:
            """Nahraj nebo nahraď piktogram vybrané skladové položky."""
            return await run_in_threadpool(
                self._stock_write,
                warehouse,
                operation_id,
                "inventory_pictogram_set",
                "POST",
                f"/{item_id}/pictogram",
                {"item_id": item_id, "file_id": file.file_id},
                lambda _request, db: stock.upload_pictogram(db, warehouse, item_id, file),
                success_status=200,
            )

    def _register_writes(self) -> None:
        @self.server.tool(annotations=READ)
        async def hotel_operation_get(operation_id: UUID4) -> ops.OperationOut:
            """Ověř účtenku vlastního zápisu. Nejistý účinek neopakuj pod novým ID."""
            return await run_in_threadpool(self._operation_get, operation_id)

        @self.server.tool(annotations=CREATE)
        async def issue_create(operation_id: UUID4, issue: IssueCreate) -> ops.OperationOut:
            """Založ závadu s názvem a místem. Popis a fotografie lze doplnit."""
            return await run_in_threadpool(
                self._write,
                operation_id,
                "issue_create",
                "POST",
                "/api/v1/issues",
                issue.model_dump(mode="json"),
                lambda request, db: writes.receipt(issues.create_issue(issue, request, db)),
            )

        @self.server.tool(annotations=CHANGE)
        async def issue_update(
            operation_id: UUID4,
            issue_id: Identifier,
            expected_updated_at: datetime,
            changes: IssueUpdate,
        ) -> ops.OperationOut:
            """Uprav údaje nebo stav závady podle updated_at z detailu."""
            return await run_in_threadpool(
                self._write,
                operation_id,
                "issue_update",
                "PUT",
                f"/api/v1/issues/{issue_id}",
                {
                    "issue_id": issue_id,
                    "expected_updated_at": expected_updated_at.isoformat(),
                    "changes": changes.model_dump(mode="json", exclude_unset=True),
                },
                lambda request, db: writes.update_issue(
                    db, request, issue_id, changes, expected_updated_at
                ),
            )

        @self.server.tool(annotations=CHANGE)
        async def issue_delete(operation_id: UUID4, issue_id: Identifier) -> ops.OperationOut:
            """Smaž záznam závady podle ID."""
            return await run_in_threadpool(
                self._write,
                operation_id,
                "issue_delete",
                "DELETE",
                f"/api/v1/issues/{issue_id}",
                {"issue_id": issue_id},
                lambda request, db: writes.delete_issue(db, request, issue_id),
            )

        @self.server.tool(
            annotations=ToolAnnotations(
                readOnlyHint=False,
                destructiveHint=False,
                idempotentHint=True,
                openWorldHint=True,
            ),
            meta={"openai/fileParams": ["file"]},
        )
        async def issue_photo_add(
            operation_id: UUID4,
            issue_id: Identifier,
            file: ChatFile,
        ) -> ops.OperationOut:
            """Připoj fotografii k vybrané závadě. Limit jsou tři fotografie."""
            return await run_in_threadpool(
                self._write,
                operation_id,
                "issue_photo_add",
                "POST",
                f"/api/v1/issues/{issue_id}/photos",
                {"issue_id": issue_id, "file_id": file.file_id},
                lambda request, db: writes.add_issue_photo(db, request, issue_id, file),
            )

        @self.server.tool(
            annotations=ToolAnnotations(
                readOnlyHint=False,
                destructiveHint=True,
                idempotentHint=True,
                openWorldHint=True,
            )
        )
        async def housekeeping_room_status_set(
            operation_id: UUID4,
            day: date,
            room_id: Reservation,
            status: HousekeepingRoomStatus,
            expected_status: HousekeepingRoomStatus,
            note: Annotated[str | None, Field(max_length=500)] = None,
        ) -> ops.OperationOut:
            """Změň stav úklidu pokoje. Použij aktuální housekeeping_status_key."""
            payload = HousekeepingRoomStatusUpdate(
                status=status, expected_status=expected_status, note=note
            )
            return await run_in_threadpool(
                self._write,
                operation_id,
                "housekeeping_room_status_set",
                "PATCH",
                f"/api/v1/housekeeping/rooms/{room_id}",
                {"day": day.isoformat(), "room_id": room_id, **payload.model_dump(mode="json")},
                lambda _request, db: rooms.set_status(db, day, room_id, payload),
            )

        @self.server.tool(
            annotations=ToolAnnotations(
                readOnlyHint=False,
                destructiveHint=False,
                idempotentHint=True,
                openWorldHint=True,
            )
        )
        async def housekeeping_requirement_confirm(
            operation_id: UUID4,
            day: date,
            room_id: Reservation,
            reservation_id: Reservation,
            kind: ReservationAmenityKind,
            quantity: Identifier,
            version: After,
        ) -> ops.OperationOut:
            """Potvrď připravenou postýlku nebo psy u konkrétní rezervace a verze."""
            payload = ReservationRequirementConfirm(quantity=quantity, version=version)
            return await run_in_threadpool(
                self._write,
                operation_id,
                "housekeeping_requirement_confirm",
                "POST",
                f"/api/v1/housekeeping/reservations/{reservation_id}/requirements/{kind}/confirm",
                {
                    "day": day.isoformat(),
                    "room_id": room_id,
                    "reservation_id": reservation_id,
                    "kind": kind.value,
                    **payload.model_dump(mode="json"),
                },
                lambda request, db: rooms.confirm_requirement(
                    db,
                    request,
                    day,
                    room_id,
                    reservation_id,
                    kind,
                    payload,
                ),
                success_status=200,
            )

        @self.server.tool(
            annotations=ToolAnnotations(
                readOnlyHint=False,
                destructiveHint=True,
                idempotentHint=True,
                openWorldHint=True,
            )
        )
        async def housekeeping_amenity_set(
            operation_id: UUID4,
            day: date,
            room_id: Reservation,
            reservation_id: Reservation,
            kind: ReservationAmenityKind,
            action: Literal["add", "set_state", "remove"],
            version: After,
            state: ReservationAmenityState | None = None,
        ) -> ops.OperationOut:
            """Přidej, označ nebo odeber ruční ikonu psa či postýlky. state patří k set_state."""
            return await run_in_threadpool(
                self._write,
                operation_id,
                "housekeeping_amenity_set",
                {"add": "POST", "set_state": "PATCH", "remove": "DELETE"}[action],
                f"/api/v1/housekeeping/reservations/{reservation_id}/amenities/{kind}",
                {
                    "day": day.isoformat(),
                    "room_id": room_id,
                    "reservation_id": reservation_id,
                    "kind": kind.value,
                    "action": action,
                    "version": version,
                    "state": state.value if state is not None else None,
                },
                lambda request, db: rooms.set_amenity(
                    db,
                    request,
                    day,
                    room_id,
                    reservation_id,
                    kind,
                    action,
                    version,
                    state,
                ),
                success_status=200,
            )

        @self.server.tool(annotations=CREATE)
        async def breakfast_order_create(
            operation_id: UUID4,
            day: date,
            room_number: Room,
            guest_name: Guest,
            guest_count: GuestCount,
            status: BreakfastStatus = BreakfastStatus.PENDING,
        ) -> ops.OperationOut:
            """Založ ruční objednávku snídaně pro den a pokoj."""
            payload = BreakfastOrderCreate(
                service_date=day,
                room_number=room_number,
                guest_name=guest_name,
                guest_count=guest_count,
                status=status,
            )
            return await run_in_threadpool(
                self._write,
                operation_id,
                "breakfast_order_create",
                "POST",
                "/api/v1/breakfast",
                payload.model_dump(mode="json"),
                lambda request, db: writes.receipt(
                    breakfast.create_breakfast_order(payload, request, db)
                ),
            )

        @self.server.tool(annotations=CHANGE)
        async def breakfast_order_update(
            operation_id: UUID4,
            order_id: Identifier,
            expected_updated_at: datetime,
            changes: writes.BreakfastPatch,
        ) -> ops.OperationOut:
            """Změň objednávku. Použij updated_at z detailu. Diety mají vlastní nástroj."""
            path = f"/api/v1/breakfast/{order_id}"
            return await run_in_threadpool(
                self._write,
                operation_id,
                "breakfast_order_update",
                "PUT",
                path,
                {
                    "order_id": order_id,
                    "expected_updated_at": expected_updated_at.isoformat(),
                    "changes": changes.model_dump(mode="json", exclude_none=True),
                },
                lambda request, db: writes.update_breakfast(
                    db,
                    request,
                    order_id,
                    changes,
                    expected_updated_at,
                ),
            )

        @self.server.tool(annotations=CHANGE)
        async def breakfast_order_delete(
            operation_id: UUID4,
            order_id: Identifier,
        ) -> ops.OperationOut:
            """Smaž jednu objednávku podle ID z hotelového přehledu."""
            return await run_in_threadpool(
                self._write,
                operation_id,
                "breakfast_order_delete",
                "DELETE",
                f"/api/v1/breakfast/{order_id}",
                {"order_id": order_id},
                lambda request, db: writes.delete_breakfast(db, request, order_id),
            )

        @self.server.tool(annotations=CHANGE)
        async def breakfast_diet_set(
            operation_id: UUID4,
            order_id: Identifier,
            reservation_id: Reservation,
            version: Identifier,
            kind: Literal["diet_no_gluten", "diet_no_milk", "diet_no_pork"],
            enabled: bool,
        ) -> ops.OperationOut:
            """Nastav dietu ověřené rezervace. Její ID a verzi zjisti v detailu objednávky."""
            payload = BreakfastDietUpdate(kind=kind, enabled=enabled, version=version)
            return await run_in_threadpool(
                self._write,
                operation_id,
                "breakfast_diet_set",
                "PATCH",
                f"/api/v1/breakfast/{order_id}/reservations/{reservation_id}/diet",
                {
                    "order_id": order_id,
                    "reservation_id": reservation_id,
                    **payload.model_dump(mode="json"),
                },
                lambda request, db: writes.receipt(
                    breakfast.update_reservation_diet(
                        order_id, reservation_id, payload, request, db
                    )
                ),
            )

        @self.server.tool(annotations=CREATE)
        async def lost_found_create(
            operation_id: UUID4,
            item: LostFoundItemCreate,
        ) -> ops.OperationOut:
            """Založ ztrátu nebo nález. U nálezu může vzniknout oznámení ve frontě."""
            return await run_in_threadpool(
                self._write,
                operation_id,
                "lost_found_create",
                "POST",
                "/api/v1/lost-found",
                item.model_dump(mode="json"),
                lambda _request, db: writes.create_lost_found(db, item),
            )

        @self.server.tool(annotations=CHANGE)
        async def lost_found_update(
            operation_id: UUID4,
            item_id: Identifier,
            expected_updated_at: datetime,
            changes: LostFoundItemUpdate,
        ) -> ops.OperationOut:
            """Změň údaje záznamu. Použij aktuální updated_at z detailu."""
            return await run_in_threadpool(
                self._write,
                operation_id,
                "lost_found_update",
                "PUT",
                f"/api/v1/lost-found/{item_id}",
                {
                    "item_id": item_id,
                    "expected_updated_at": expected_updated_at.isoformat(),
                    "changes": changes.model_dump(mode="json", exclude_unset=True),
                },
                lambda request, db: writes.update_lost_found(
                    db,
                    request,
                    item_id,
                    changes,
                    expected_updated_at,
                ),
            )

        @self.server.tool(annotations=CHANGE)
        async def lost_found_delete(
            operation_id: UUID4,
            item_id: Identifier,
        ) -> ops.OperationOut:
            """Smaž jeden záznam a ukonči jeho čekající oznámení podle pravidel Hotelu."""
            return await run_in_threadpool(
                self._write,
                operation_id,
                "lost_found_delete",
                "DELETE",
                f"/api/v1/lost-found/{item_id}",
                {"item_id": item_id},
                lambda request, db: writes.delete_lost_found(db, request, item_id),
            )

        @self.server.tool(
            annotations=ToolAnnotations(
                readOnlyHint=False,
                destructiveHint=False,
                idempotentHint=True,
                openWorldHint=True,
            ),
            meta={"openai/fileParams": ["file"]},
        )
        async def lost_found_photo_add(
            operation_id: UUID4,
            item_id: Identifier,
            file: ChatFile,
        ) -> ops.OperationOut:
            """Připoj nahranou fotografii k vybranému nálezu nebo ztrátě."""
            return await run_in_threadpool(
                self._write,
                operation_id,
                "lost_found_photo_add",
                "POST",
                f"/api/v1/lost-found/{item_id}/photos",
                {"item_id": item_id, "file_id": file.file_id},
                lambda _request, db: writes.add_lost_found_photo(db, item_id, file),
            )

        @self.server.tool(annotations=CHANGE)
        async def breakfast_orders_reactivate(
            operation_id: UUID4,
            day: date,
        ) -> ops.OperationOut:
            """Přepni vydané snídaně zadaného dne zpět na čekající."""
            return await run_in_threadpool(
                self._write,
                operation_id,
                "breakfast_orders_reactivate",
                "POST",
                "/api/v1/breakfast/reactivate-all",
                {"day": day.isoformat()},
                lambda request, db: writes.reactivate_breakfast_day(request, db, day),
                success_status=204,
            )

        @self.server.tool(annotations=CHANGE)
        async def breakfast_orders_delete(
            operation_id: UUID4,
            start_day: date,
            end_day: date | None = None,
        ) -> ops.OperationOut:
            """Smaž objednávky snídaní za den nebo uzavřený interval."""
            return await run_in_threadpool(
                self._write,
                operation_id,
                "breakfast_orders_delete",
                "DELETE",
                "/api/v1/breakfast/day/delete"
                if end_day is None
                else "/api/v1/breakfast/period/delete",
                {
                    "start_day": start_day.isoformat(),
                    "end_day": end_day.isoformat() if end_day else None,
                },
                lambda request, db: writes.delete_breakfast_days(request, db, start_day, end_day),
            )
