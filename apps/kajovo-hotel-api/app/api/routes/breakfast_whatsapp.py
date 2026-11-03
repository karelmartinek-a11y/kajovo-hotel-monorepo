from __future__ import annotations

import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import (
    BreakfastWhatsappDelivery as Delivery,
    BreakfastWhatsappRun as Run,
    BreakfastWhatsappSettings as Schedule,
)
from app.db.session import get_db
from app.security.rbac import module_access_dependency, require_actor_type
from app.services.breakfast.whatsapp import PRAGUE, aware, fetch_plan, message_text, next_occurrence
from app.services.breakfast.whatsapp_client import configured
from app.time_utils import utc_now

router = APIRouter(
    prefix="/api/v1/admin/settings/breakfast-whatsapp", tags=["settings"],
    dependencies=[Depends(require_actor_type("admin")), Depends(module_access_dependency("settings"))],
)


class BreakfastWhatsappUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(strict=True)
    send_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    recipients: list[str] = Field(max_length=20)
    revision: int = Field(ge=0, strict=True)

    @field_validator("recipients")
    @classmethod
    def normalize_recipients(cls, values):
        normalized = []
        for value in values:
            if len(value) > 40:
                raise ValueError("Telefonní číslo je příliš dlouhé.")
            number = re.sub(r"[\s().-]", "", value)
            if number.startswith("00"):
                number = "+" + number[2:]
            if not re.fullmatch(r"\+[1-9][0-9]{7,14}", number):
                raise ValueError("Zadejte telefonní čísla v mezinárodním formátu, například +420123456789.")
            if number not in normalized:
                normalized.append(number)
        return normalized

    @model_validator(mode="after")
    def require_recipients(self):
        if self.enabled and not self.recipients:
            raise ValueError("Pro zapnutí zadejte alespoň jedno telefonní číslo.")
        return self


class BreakfastWhatsappDeliveryRead(BaseModel):
    id: str
    recipient: str
    state: str
    error_code: str | None
    updated_at: datetime


class BreakfastWhatsappRunRead(BaseModel):
    service_date: date
    state: str
    breakfast_count: int | None
    source_checked_at: datetime | None
    error_code: str | None
    deliveries: list[BreakfastWhatsappDeliveryRead]


class BreakfastWhatsappRead(BaseModel):
    enabled: bool
    send_time: str
    recipients: list[str]
    revision: int
    timezone: str = "Europe/Prague"
    next_run_at: datetime | None
    transport_configured: bool
    last_run: BreakfastWhatsappRunRead | None


class BreakfastWhatsappPreview(BaseModel):
    service_date: date
    breakfast_count: int
    source_checked_at: datetime
    message: str


def read_settings(db):
    row = db.get(Schedule, 1)
    run = db.scalar(select(Run).order_by(Run.scheduled_date.desc()).limit(1))
    last = None
    if run:
        deliveries = list(db.scalars(select(Delivery).where(Delivery.run_id == run.id).order_by(Delivery.recipient)))
        state = run.state
        if deliveries:
            states = {d.state for d in deliveries}
            state = "cancelled" if states == {"cancelled"} else "delivered" if states <= {"delivered", "read"} else "accepted" if states <= {"accepted", "delivered", "read"} else "needs_attention" if states & {"unknown", "failed", "blocked", "cancelled"} else "pending"
        last = BreakfastWhatsappRunRead(
            service_date=run.service_date, state=state, breakfast_count=run.breakfast_count,
            source_checked_at=aware(run.source_checked_at) if run.source_checked_at else None, error_code=run.error_code,
            deliveries=[BreakfastWhatsappDeliveryRead(
                id=d.id, recipient=d.recipient, state=d.state, error_code=d.error_code,
                updated_at=aware(d.updated_at),
            ) for d in deliveries],
        )
    return BreakfastWhatsappRead(
        enabled=row.enabled if row else False, send_time=row.send_time if row else "18:00",
        recipients=row.recipients if row else [], revision=row.revision if row else 0,
        next_run_at=aware(row.next_run_at) if row and row.next_run_at else None, transport_configured=configured(), last_run=last,
    )


@router.get("", response_model=BreakfastWhatsappRead)
def get_settings(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return read_settings(db)


@router.put("", response_model=BreakfastWhatsappRead)
def put_settings(payload: BreakfastWhatsappUpdate, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    if payload.enabled and not configured():
        raise HTTPException(409, "Připojení WhatsApp není na serveru připravené.")
    values = {
        "enabled": payload.enabled, "send_time": payload.send_time, "recipients": payload.recipients,
        "revision": payload.revision + 1,
        "next_run_at": next_occurrence(payload.send_time, utc_now()) if payload.enabled else None,
    }
    try:
        row = db.get(Schedule, 1, with_for_update=True)
        if row is None and payload.revision == 0:
            db.add(Schedule(id=1, **values))
        elif row is not None:
            changed = db.execute(update(Schedule).where(Schedule.id == 1, Schedule.revision == payload.revision)
                                 .values(**values), execution_options={"synchronize_session": False})
            if changed.rowcount != 1:
                raise HTTPException(409, "Nastavení mezitím změnil jiný uživatel. Obnovte jej.")
        else:
            raise HTTPException(409, "Obnovte aktuální nastavení.")
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Nastavení mezitím změnil jiný uživatel. Obnovte jej.") from None
    db.expire_all()
    return read_settings(db)


@router.get("/preview", response_model=BreakfastWhatsappPreview)
def preview(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    now = utc_now()
    day = now.astimezone(PRAGUE).date() + timedelta(days=1)
    try:
        count = fetch_plan(db, day)
    except Exception:
        raise HTTPException(502, "Aktuální počet snídaní se nepodařilo ověřit v BetterHotelu. Zpráva nebyla odeslána.") from None
    return BreakfastWhatsappPreview(service_date=day, breakfast_count=count,
                                    source_checked_at=utc_now(), message=message_text(day, count))
