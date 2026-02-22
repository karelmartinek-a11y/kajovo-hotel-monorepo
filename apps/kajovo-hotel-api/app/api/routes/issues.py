from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import (
    IssueCreate,
    IssuePriority,
    IssueRead,
    IssueStatus,
    IssueUpdate,
)
from app.db.models import Issue
from app.db.session import get_db
from app.security.rbac import module_access_dependency

router = APIRouter(
    prefix="/api/v1/issues",
    tags=["issues"],
    dependencies=[Depends(module_access_dependency("issues"))],
)


def _apply_status_timestamps(issue: Issue, next_status: str) -> None:
    now = datetime.now(timezone.utc)
    if next_status == IssueStatus.IN_PROGRESS.value and issue.in_progress_at is None:
        issue.in_progress_at = now
    if next_status == IssueStatus.RESOLVED.value and issue.resolved_at is None:
        issue.resolved_at = now
    if next_status == IssueStatus.CLOSED.value and issue.closed_at is None:
        issue.closed_at = now


@router.get("", response_model=list[IssueRead])
def list_issues(
    priority: IssuePriority | None = Query(default=None),
    status_filter: IssueStatus | None = Query(default=None, alias="status"),
    location: str | None = Query(default=None),
    room_number: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[Issue]:
    query = select(Issue).order_by(Issue.created_at.desc(), Issue.id.desc())

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
    issue = db.get(Issue, issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    return issue


@router.post("", response_model=IssueRead, status_code=status.HTTP_201_CREATED)
def create_issue(payload: IssueCreate, db: Session = Depends(get_db)) -> Issue:
    payload_data = payload.model_dump()
    payload_data["priority"] = payload.priority.value
    payload_data["status"] = payload.status.value
    issue = Issue(**payload_data)
    _apply_status_timestamps(issue, payload.status.value)

    db.add(issue)
    db.commit()
    db.refresh(issue)
    return issue


@router.put("/{issue_id}", response_model=IssueRead)
def update_issue(issue_id: int, payload: IssueUpdate, db: Session = Depends(get_db)) -> Issue:
    issue = db.get(Issue, issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    updates = payload.model_dump(exclude_unset=True)
    if "priority" in updates and updates["priority"] is not None:
        updates["priority"] = updates["priority"].value
    if "status" in updates and updates["status"] is not None:
        updates["status"] = updates["status"].value

    for key, value in updates.items():
        setattr(issue, key, value)

    if "status" in updates:
        _apply_status_timestamps(issue, updates["status"])

    db.add(issue)
    db.commit()
    db.refresh(issue)
    return issue


@router.delete("/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issue(issue_id: int, db: Session = Depends(get_db)) -> None:
    issue = db.get(Issue, issue_id)
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    db.delete(issue)
    db.commit()
