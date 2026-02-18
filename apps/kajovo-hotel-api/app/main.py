from fastapi import FastAPI

from app.api.routes.breakfast import router as breakfast_router
from app.api.routes.health import router as health_router
from app.api.routes.reports import router as reports_router
from app.config import get_settings

settings = get_settings()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version=settings.app_version)
    app.include_router(health_router)
    app.include_router(reports_router)
    app.include_router(breakfast_router)
    return app


app = create_app()
