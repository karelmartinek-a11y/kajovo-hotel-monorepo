from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.routes.auth import router as auth_router
from app.api.routes.breakfast import router as breakfast_router
from app.api.routes.health import router as health_router
from app.api.routes.inventory import router as inventory_router
from app.api.routes.issues import router as issues_router
from app.api.routes.lost_found import router as lost_found_router
from app.api.routes.reports import router as reports_router
from app.api.routes.settings import router as settings_router
from app.api.routes.users import router as users_router
from app.config import get_settings
from app.observability import RequestContextMiddleware, configure_logging
from app.security.auth import ensure_csrf

settings = get_settings()


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title=settings.app_name, version=settings.app_version)
    app.add_middleware(RequestContextMiddleware)

    def _request_id(request: Request) -> str | None:
        return getattr(request.state, "request_id", None) or request.headers.get("x-request-id")

    def _error_response(
        request: Request,
        status_code: int,
        code: str,
        message: str,
        details: object | None = None,
    ) -> JSONResponse:
        request_id = _request_id(request)
        content = {
            "error": {
                "code": code,
                "message": message,
                "request_id": request_id,
                "details": details,
            },
            # backward-compatible top-level detail for older clients
            "detail": message,
            "request_id": request_id,
        }
        return JSONResponse(status_code=status_code, content=content)

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        message = str(exc.detail) if not isinstance(exc.detail, dict) else "Request failed"
        return _error_response(
            request=request,
            status_code=exc.status_code,
            code=f"HTTP_{exc.status_code}",
            message=message,
            details=exc.detail,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return _error_response(
            request=request,
            status_code=422,
            code="REQUEST_VALIDATION_ERROR",
            message="Request validation failed",
            details=exc.errors(),
        )

    @app.middleware("http")
    async def csrf_middleware(request: Request, call_next):
        try:
            ensure_csrf(request)
        except HTTPException as exc:
            return _error_response(
                request=request,
                status_code=exc.status_code,
                code="CSRF_VALIDATION_FAILED",
                message=str(exc.detail),
                details=exc.detail,
            )
        return await call_next(request)

    app.include_router(auth_router)
    app.include_router(health_router)
    app.include_router(reports_router)
    app.include_router(breakfast_router)
    app.include_router(lost_found_router)
    app.include_router(issues_router)
    app.include_router(inventory_router)
    app.include_router(users_router)
    app.include_router(settings_router)
    return app


app = create_app()
