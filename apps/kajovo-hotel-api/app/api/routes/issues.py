from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.schemas import (
    IssueCreate,
    IssuePriority,
    IssueRead,
    IssueStatus,
    IssueUpdate,
    MediaPhotoRead,
)
from app.config import get_settings
from app.db.models import Issue, IssuePhoto
from app.db.session import get_db
from app.media.storage import MediaStorage
from app.security.rbac import module_access_dependency, parse_identity, require_actor_type

router = APIRouter(
    prefix="/api/v1/issues",
    tags=["issues"],
    dependencies=[Depends(module_access_dependency("issues"))],
)

ADMIN_ROLE = normalize_role("admin")
HOUSEKEEPING_ROLE = normalize_role("pokojska")
MAINTENANCE_ROLE = normalize_role("udrzba")


def _actor_role(request: Request) -> str:
    return normalize_role(getattr(request.state, "actor_role", None))


def _is_admin(role: str) -> bool:
    return normalize_role(role) == ADMIN_ROLE


def _is_housekeeping(role: str) -> bool:
    return normalize_role(role) == HOUSEKEEPING_ROLE


def _is_maintenance(role: str) -> bool:
    return normalize_role(role) == MAINTENANCE_ROLE


def _apply_status_timestamps(issue: Issue, next_status: str) -> None:
    now = datetime.now(timezone.utc)
    if next_status == IssueStatus.NEW.value:
        issue.in_progress_at = None
        issue.resolved_at = None
        issue.closed_at = None
        return
    if next_status == IssueStatus.IN_PROGRESS.value:
        issue.resolved_at = None
        issue.closed_at = None
    if next_status == IssueStatus.IN_PROGRESS.value and issue.in_progress_at is None:
        issue.in_progress_at = now
    if next_status == IssueStatus.RESOLVED.value and issue.resolved_at is None:
        issue.resolved_at = now
        issue.closed_at = None
    if next_status == IssueStatus.CLOSED.value and issue.closed_at is None:
        issue.closed_at = now


def _guard_issue_create(actor_role: str) -> None:
    if _is_admin(actor_role) or _is_housekeeping(actor_role):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Issue create requires housekeeping/admin role",
    )


def _guard_issue_photo_upload(actor_role: str) -> None:
    if _is_admin(actor_role) or _is_housekeeping(actor_role):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Issue photo upload requires housekeeping/admin role",
    )


def _guard_issue_update(actor_role: str, issue: Issue, updates: dict[str, object]) -> dict[str, object]:
    if _is_admin(actor_role):
        return updates

    if _is_maintenance(actor_role):
        disallowed = set(updates) - {"status"}
        if disallowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Maintenance can only change issue status",
            )
        next_status = updates.get("status")
        if next_status is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Maintenance can only change issue status",
            )
        if next_status not in {IssueStatus.IN_PROGRESS.value, IssueStatus.RESOLVED.value}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Maintenance can only move issues to in_progress or resolved",
            )
        if issue.status in {IssueStatus.RESOLVED.value, IssueStatus.CLOSED.value}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Maintenance cannot reopen completed issues",
            )
        return {"status": next_status}

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Issue update requires maintenance/admin role",
    )


@router.get("", response_model=list[IssueRead])
def list_issues(
    request: Request,
    priority: IssuePriority | None = Query(default=None),
    status_filter: IssueStatus | None = Query(default=None, alias="status"),
    location: str | None = Query(default=None),
    room_number: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[Issue]:
    query = (
        select(Issue)
        .options(selectinload(Issue.photos))
        .order_by(Issue.created_at.desc(), Issue.id.desc())
    )
    actor_role = getattr(request.state, "actor_role", "") or parse_identity(request)[2]
    if actor_role == "údržba" and status_filter is None:
        query = query.where(
            Issue.status.in_(
                [IssueStatus.NEW.value, IssueStatus.IN_PROGRESS.value]
            )
        )

    if priority:
        query = query.where(Issue.priority == priority.value)
    if status_filter:
        query = query.where(Issue.status == status_filter.value)
    if location:
        query = query.where(Issue.location == location)
    if room_number:
        query = query.where(Issue.room_number == room_number)

    return list(db.scalars(query))


@router.get("/{issue_id}", response_model=IssueRead)
def get_issue(issue_id: int, db: Session = Depends(get_db)) -> Issue:
    issue = db.scalar(select(Issue).where(Issue.id == issue_id).options(selectinload(Issue.photos)))
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    return issue


@router.post("", response_model=IssueRead, status_code=status.HTTP_201_CREATED)
def create_issue(
    payload: IssueCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> Issue:
    actor_role = _actor_role(request)
    _guard_issue_create(actor_role)

    payload_data = payload.model_dump()
    payload_data["priority"] = payload.priority.value
    payload_data["status"] = payload.status.value
    issue = Issue(**payload_data)
    _apply_status_timestamps(issue, payload.status.value)

    db.add(issue)
    db.commit()
    db.refresh(issue)
    return db.scalar(select(Issue).where(Issue.id == issue.id).options(selectinload(Issue.photos))) or issue


@router.put("/{issue_id}", response_model=IssueRead)
def update_issue(
    issue_id: int,
    payload: IssueUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> Issue:
    issue = db.get(Issue, issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    updates = payload.model_dump(exclude_unset=True)
    actor_role = getattr(request.state, "actor_role", "") or parse_identity(request)[2]

    if actor_role == "údržba":
        allowed_fields = {"status"}
        if set(updates) - allowed_fields:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Maintenance can only change issue status",
            )
        if updates.get("status") not in {IssueStatus.RESOLVED, IssueStatus.RESOLVED.value}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Maintenance can only mark issues as resolved",
            )

    if "priority" in updates and updates["priority"] is not None:
        updates["priority"] = updates["priority"].value
    if "status" in updates and updates["status"] is not None:
        updates["status"] = updates["status"].value

    actor_role = _actor_role(request)
    allowed_updates = _guard_issue_update(actor_role, issue, updates)

    for key, value in allowed_updates.items():
        setattr(issue, key, value)

    if "status" in allowed_updates:
        _apply_status_timestamps(issue, str(allowed_updates["status"]))

    db.add(issue)
    db.commit()
    refreshed = db.scalar(select(Issue).where(Issue.id == issue.id).options(selectinload(Issue.photos)))
    if not refreshed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    return refreshed


@router.delete("/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_actor_type("admin")),
) -> None:
    issue = db.get(Issue, issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    db.delete(issue)
    db.commit()


@router.get("/{issue_id}/photos", response_model=list[MediaPhotoRead])
def list_issue_photos(issue_id: int, db: Session = Depends(get_db)) -> list[IssuePhoto]:
    issue = db.scalar(select(Issue).where(Issue.id == issue_id).options(selectinload(Issue.photos)))
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    return list(issue.photos)


@router.post("/{issue_id}/photos", response_model=list[MediaPhotoRead])
def upload_issue_photos(
    issue_id: int,
    request: Request,
    photos: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
) -> list[IssuePhoto]:
    actor_role = _actor_role(request)
    _guard_issue_photo_upload(actor_role)

    issue = db.scalar(select(Issue).where(Issue.id == issue_id).options(selectinload(Issue.photos)))
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    if len(issue.photos) + len(photos) > 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximum 3 photos")

    storage = MediaStorage(get_settings().media_root)
    start_idx = len(issue.photos)
    for offset, upload in enumerate(photos):
        stored = storage.store_image(
            category="issues",
            resource_id=issue.id,
            src_file=upload.file,
            src_filename=upload.filename or f"photo-{offset + 1}.jpg",
        )
        db.add(
            IssuePhoto(
                issue_id=issue.id,
                sort_order=start_idx + offset,
                file_path=stored.original_relpath,
                thumb_path=stored.thumb_relpath,
                mime_type=upload.content_type or "image/jpeg",
                size_bytes=stored.bytes,
            )
        )
    db.commit()
    return list(
        db.scalars(
            select(IssuePhoto).where(IssuePhoto.issue_id == issue.id).order_by(IssuePhoto.sort_order.asc())
        )
    )


@router.get("/{issue_id}/photos/{photo_id}/{kind}")
def get_issue_photo(
    issue_id: int,
    photo_id: int,
    kind: str,
    db: Session = Depends(get_db),
):
    photo = db.scalar(select(IssuePhoto).where(IssuePhoto.id == photo_id, IssuePhoto.issue_id == issue_id))
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    if kind not in {"thumb", "original"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported kind")
    rel = photo.thumb_path if kind == "thumb" else photo.file_path
    storage = MediaStorage(get_settings().media_root)
    path = storage.resolve(rel)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media file not found")
    return FileResponse(path, media_type=photo.mime_type)
