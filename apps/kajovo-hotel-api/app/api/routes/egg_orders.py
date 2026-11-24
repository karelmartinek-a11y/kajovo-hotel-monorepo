import asyncio
import logging
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import InventoryEggOrder
from app.db.session import get_db
from app.security.cml_requests import owner_key
from app.security.rbac import require_permission
from app.services import egg_orders

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api/v1/inventory/egg-orders",
    dependencies=[Depends(require_permission("inventory", "write"))],
)


class OrderClick(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    confirmed_previous_id: UUID | None = None
    confirmed_delivery_date: date | None = None


class OrderStatus(BaseModel):
    id: str
    delivery_date: date
    state: Literal["sent", "unknown", "rejected"]


class RepeatOrder(BaseModel):
    state: Literal["confirm"] = "confirm"
    previous_id: str
    previous_sent_at: datetime
    previous_delivery_date: date
    delivery_date: date


class BusyOrder(BaseModel):
    state: Literal["busy"] = "busy"
    id: str


def cml_owner(request: Request) -> str:
    claims = getattr(request.state, "cml_web_claims", None)
    if not claims:
        raise HTTPException(403, "Objednávka je dostupná ve webovém skladu KájovoHotelu.")
    return owner_key(claims)


def status(row: InventoryEggOrder) -> OrderStatus:
    return OrderStatus(id=row.id, delivery_date=row.delivery_date, state=row.state)


def lookup(db: Session, row: InventoryEggOrder, config: dict, payload: dict) -> OrderStatus:
    if row.state != "unknown":
        return status(row)
    try:
        result = asyncio.run(egg_orders.call_mail(config, payload))
        state, operation = egg_orders.read_result(row, result, sending=payload["kind"] == "send")
    except Exception:
        logger.warning("Egg order Mail receipt unavailable for %s", row.id)
        return status(row)
    if state != "unknown":
        sent_at = None
        if state == "sent":
            try:
                sent_at = datetime.fromisoformat(result["receipt"]["smtp_accepted_at"])
                if sent_at.tzinfo is None:
                    raise ValueError()
            except (TypeError, KeyError, ValueError):
                sent_at = row.created_at
        db.execute(update(InventoryEggOrder).where(
            InventoryEggOrder.id == row.id, InventoryEggOrder.state == "unknown",
        ).values(state=state, mail_operation=operation,
                 sent_at=sent_at))
        db.commit()
        db.refresh(row)
    return status(row)


@router.get("/latest")
def latest(request: Request, db: Session = Depends(get_db)) -> OrderStatus | None:
    return latest_for_owner(cml_owner(request), db)


def latest_for_owner(owner: str, db: Session) -> OrderStatus | None:
    row = db.scalar(select(InventoryEggOrder).where(InventoryEggOrder.owner == owner)
                    .order_by(InventoryEggOrder.created_at.desc()).limit(1))
    if row and row.state == "unknown":
        cutoff = datetime.now(UTC) - timedelta(hours=24)
        if row.created_at.replace(tzinfo=UTC) < cutoff:
            return None
    return status(row) if row else None


@router.post("")
def submit(click: OrderClick, request: Request, db: Session = Depends(get_db)) -> OrderStatus | RepeatOrder | BusyOrder:
    return submit_for_owner(click, cml_owner(request), db)


def submit_for_owner(click: OrderClick, owner: str, db: Session) -> OrderStatus | RepeatOrder | BusyOrder:
    ident = str(click.id)
    # Serialize decisions across warehouse users; release the transaction
    # before calling Mail. The committed unknown row guards that interval.
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(1769080734)"))
    else:
        db.execute(text("BEGIN IMMEDIATE"))
    row = db.get(InventoryEggOrder, ident)
    if row:
        if row.owner != owner:
            raise HTTPException(404)
        return status(row)
    try:
        config = egg_orders.mail_config()
    except (OSError, ValueError, KeyError, TypeError):
        raise HTTPException(503, "Odesílání objednávek vajec není dostupné.") from None
    now = datetime.now(UTC)
    cutoff = now - timedelta(hours=24)
    delivery = egg_orders.delivery_date(now)
    pending = db.scalar(select(InventoryEggOrder.id).where(
        InventoryEggOrder.state == "unknown", InventoryEggOrder.created_at >= cutoff,
    ).order_by(InventoryEggOrder.created_at.desc()).limit(1))
    if pending:
        return BusyOrder(id=pending)
    previous = db.scalar(select(InventoryEggOrder).where(
        InventoryEggOrder.state == "sent", InventoryEggOrder.sent_at >= cutoff,
    ).order_by(InventoryEggOrder.sent_at.desc(), InventoryEggOrder.id.desc()).limit(1))
    if previous and (str(click.confirmed_previous_id) != previous.id or click.confirmed_delivery_date != delivery):
        previous_sent_at = previous.sent_at
        if previous_sent_at.tzinfo is None:  # SQLite fixtures return naive UTC.
            previous_sent_at = previous_sent_at.replace(tzinfo=UTC)
        return RepeatOrder(previous_id=previous.id, previous_sent_at=previous_sent_at,
                           previous_delivery_date=previous.delivery_date, delivery_date=delivery)
    row = InventoryEggOrder(id=ident, owner=owner, created_at=now,
                            delivery_date=delivery,
                            recipient=config["recipient"], state="unknown")
    payload = egg_orders.send_request(row, row.recipient, now)
    row.content_hash = payload["content_hash"]
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        prior = db.get(InventoryEggOrder, ident)
        if prior is None or prior.owner != owner:
            raise HTTPException(404) from None
        return status(prior)
    return lookup(db, row, config, payload)


@router.get("/{order_id}")
def recover(order_id: UUID, request: Request, db: Session = Depends(get_db)) -> OrderStatus:
    cml_owner(request)
    return recover_status(order_id, db)


def recover_status(order_id: UUID, db: Session) -> OrderStatus:
    row = db.get(InventoryEggOrder, str(order_id))
    if row is None:
        raise HTTPException(404, "Objednávka nebyla nalezena.")
    if row.state != "unknown":
        return status(row)
    try:
        config = egg_orders.mail_config()
    except (OSError, ValueError, KeyError, TypeError):
        return status(row)
    return lookup(db, row, config, {
        "kind": "status", "send_intent_id": row.id, "idempotency_key": row.id,
    })
