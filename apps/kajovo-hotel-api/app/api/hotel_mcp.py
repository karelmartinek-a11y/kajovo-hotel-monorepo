"""Official MCP Streamable HTTP transport for scoped Hotel capabilities."""

from collections.abc import Callable
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import date
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
from pydantic import AnyHttpUrl, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import FormData, Headers
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route
from starlette.types import Receive, Scope, Send

from app.db.models import LostFoundItemType, LostFoundStatus
from app.security.hotel_oauth import (
    BREAKFAST_READ,
    CML,
    ISSUER,
    LOST_FOUND_READ,
    ORIGIN,
    OWNER,
    RESOURCE,
    SCOPES,
    HotelOAuth,
)
from app.services import hotel_mcp_reads as reads

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
Identifier = Annotated[int, Field(strict=True, ge=1, le=2**31 - 1)]
After = Annotated[int, Field(strict=True, ge=0, le=2**31 - 1)]
PageSize = Annotated[int, Field(strict=True, ge=1, le=40)]
Category = Annotated[str, Field(min_length=1, max_length=64)]
Room = Annotated[str, Field(min_length=1, max_length=32)]
Result = TypeVar("Result")

TOOL_SCOPES = {
    "breakfast_day_get": BREAKFAST_READ,
    "breakfast_order_get": BREAKFAST_READ,
    "breakfast_daily_export": BREAKFAST_READ,
    "lost_found_list": LOST_FOUND_READ,
    "lost_found_get": LOST_FOUND_READ,
    "lost_found_photo_get": LOST_FOUND_READ,
}


@dataclass(frozen=True)
class Principal:
    permissions: frozenset[str]
    breakfast_manager: bool


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


class HotelTools(FastMCP):
    async def list_tools(self) -> list[Tool]:
        actor = principal.get()
        if actor is None:
            return []
        tools = await super().list_tools()
        return [
            tool.model_copy(
                update={
                    "inputSchema": _strip_schema_titles(tool.inputSchema),
                    "outputSchema": _strip_schema_titles(tool.outputSchema),
                }
            )
            for tool in tools
            if TOOL_SCOPES[tool.name] in actor.permissions
            and (tool.name != "breakfast_daily_export" or actor.breakfast_manager)
        ]


class HotelMCP:
    def __init__(self, sessions: Callable[[], Session]) -> None:
        self.sessions = sessions
        self.provider = HotelOAuth(sessions)
        self.server = HotelTools(
            "KájovoHotel",
            instructions="Snídaně vybírej podle provozního dne. Detail načti podle ID. "
            "Fotografie a PDF mají vlastní odkazy do přihlášeného CML.",
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
        self.transport = self.server.streamable_http_app()

    def routes(self) -> list[Route]:
        registration = ClientRegistrationOptions(
            enabled=True,
            valid_scopes=list(SCOPES),
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
                frozenset(cml_permissions),
                state.get("hotel_mcp_breakfast_manager", False),
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
            actor = Principal(frozenset(authenticated.scopes), True)
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
