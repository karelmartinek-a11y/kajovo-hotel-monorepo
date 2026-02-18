from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import ReportCreate, ReportRead
from app.db.models import Report
from app.db.session import get_db

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


@router.get("", response_model=list[ReportRead])
def list_reports(db: Session = Depends(get_db)) -> list[Report]:
    result = db.scalars(select(Report).order_by(Report.id.desc()))
    return list(result)


@router.post("", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def create_report(payload: ReportCreate, db: Session = Depends(get_db)) -> Report:
    report = Report(title=payload.title, description=payload.description)
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
