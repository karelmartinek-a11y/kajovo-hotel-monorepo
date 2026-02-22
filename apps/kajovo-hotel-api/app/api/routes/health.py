from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
@router.get("/api/health")
def health(request: Request) -> dict[str, str | None]:
    return {"status": "ok", "request_id": getattr(request.state, "request_id", None)}


@router.get("/ready")
def ready(request: Request, db: Session = Depends(get_db)) -> dict[str, str | None]:
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover - defensive response
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database not ready",
        ) from exc
    return {"status": "ready", "request_id": getattr(request.state, "request_id", None)}
