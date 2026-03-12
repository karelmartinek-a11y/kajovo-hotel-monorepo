from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.schemas import MediaPhotoRead, ReportCreate, ReportRead, ReportUpdate
from app.config import get_settings
from app.db.models import Report, ReportPhoto
from app.db.session import get_db
from app.media.storage import MediaStorage
from app.security.rbac import module_access_dependency

router = APIRouter(
    prefix="/api/v1/reports",
    tags=["reports"],
    dependencies=[Depends(module_access_dependency("reports"))],
)


@router.get("", response_model=list[ReportRead])
def list_reports(
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
) -> list[Report]:
    query = select(Report).options(selectinload(Report.photos)).order_by(Report.id.desc())
    if status_filter:
        query = query.where(Report.status == status_filter)
    result = db.scalars(query)
    return list(result)


@router.get("/{report_id}", response_model=ReportRead)
def get_report(report_id: int, db: Session = Depends(get_db)) -> Report:
    report = db.scalar(
        select(Report).where(Report.id == report_id).options(selectinload(Report.photos))
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return report


@router.post("", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def create_report(payload: ReportCreate, db: Session = Depends(get_db)) -> Report:
    report = Report(title=payload.title, description=payload.description, status=payload.status)
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.put("/{report_id}", response_model=ReportRead)
def update_report(report_id: int, payload: ReportUpdate, db: Session = Depends(get_db)) -> Report:
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(report, key, value)

    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(report_id: int, db: Session = Depends(get_db)) -> None:
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    db.delete(report)
    db.commit()


@router.get("/{report_id}/photos", response_model=list[MediaPhotoRead])
def list_report_photos(report_id: int, db: Session = Depends(get_db)) -> list[ReportPhoto]:
    report = db.scalar(select(Report).where(Report.id == report_id).options(selectinload(Report.photos)))
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return list(report.photos)


@router.post("/{report_id}/photos", response_model=list[MediaPhotoRead])
def upload_report_photos(
    report_id: int,
    photos: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
) -> list[ReportPhoto]:
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if len(photos) > 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximum 3 photos")

    storage = MediaStorage(get_settings().media_root)
    start_idx = len(report.photos)
    for offset, upload in enumerate(photos):
        stored = storage.store_image(
            category="reports",
            resource_id=report.id,
            src_file=upload.file,
            src_filename=upload.filename or f"photo-{offset + 1}.jpg",
        )
        db.add(
            ReportPhoto(
                report_id=report.id,
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
            select(ReportPhoto)
            .where(ReportPhoto.report_id == report.id)
            .order_by(ReportPhoto.sort_order.asc())
        )
    )


@router.get("/{report_id}/photos/{photo_id}/{kind}")
def get_report_photo(
    report_id: int,
    photo_id: int,
    kind: str,
    db: Session = Depends(get_db),
):
    photo = db.scalar(
        select(ReportPhoto).where(ReportPhoto.id == photo_id, ReportPhoto.report_id == report_id)
    )
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
