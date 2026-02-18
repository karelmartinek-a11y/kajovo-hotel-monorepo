from fastapi import FastAPI

from app.api.routes.breakfast import router as breakfast_router
from app.api.routes.health import router as health_router
from app.api.routes.inventory import router as inventory_router
from app.api.routes.issues import router as issues_router
from app.api.routes.lost_found import router as lost_found_router
from app.api.routes.reports import router as reports_router
from app.config import get_settings
from app.observability import RequestContextMiddleware, configure_logging

settings = get_settings()


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title=settings.app_name, version=settings.app_version)
    app.add_middleware(RequestContextMiddleware)
    app.include_router(health_router)
    app.include_router(reports_router)
    app.include_router(breakfast_router)
    app.include_router(lost_found_router)
    app.include_router(issues_router)
    app.include_router(inventory_router)
    return app


app = create_app()
