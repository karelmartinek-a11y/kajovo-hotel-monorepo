"""Daily Prague schedule and durable, non-replaying WhatsApp delivery intents."""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID, uuid4, uuid5
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.db.models import (
    BreakfastOrder,
    BreakfastWhatsappDelivery as Delivery,
    BreakfastWhatsappRun as Run,
    BreakfastWhatsappSettings as Schedule,
)
from app.db.session import SessionLocal
from app.services.breakfast.sync import BetterHotelBreakfastClient
from app.services.breakfast.whatsapp_client import NotificationClient, NotificationUnavailable
from app.time_utils import utc_now

PRAGUE = ZoneInfo("Europe/Prague")
NAMESPACE = UUID("d3f44174-142b-4d14-8456-810d27483efb")
log = logging.getLogger("kajovo.breakfast.whatsapp")


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def scheduled_time(day: date, send_time: str) -> datetime:
    wall = datetime.combine(day, time.fromisoformat(send_time))
    # fold=0 gives one occurrence on the autumn clock change. For a missing
    # spring time, choose the first existing wall-clock minute after it.
    for minute in range(181):
        local = (wall + timedelta(minutes=minute)).replace(tzinfo=PRAGUE, fold=0)
        result = local.astimezone(timezone.utc)
        if result.astimezone(PRAGUE).replace(tzinfo=None) == local.replace(tzinfo=None):
            return result
    raise ValueError("invalid_local_time")


def next_occurrence(send_time: str, now: datetime) -> datetime:
    today = aware(now).astimezone(PRAGUE).date()
    for offset in range(3):
        candidate = scheduled_time(today + timedelta(days=offset), send_time)
        if candidate > aware(now):
            return candidate
    raise ValueError("invalid_schedule")


def message_text(service_date: date, count: int) -> str:
    return f"KájovoHotel: Na zítra {service_date:%d. %m. %Y} je v plánu {count} snídaní."


def fetch_plan(db, service_date: date) -> int:
    aggregates, _, _ = BetterHotelBreakfastClient(get_settings()).build_aggregates(
        service_start=service_date, service_end=service_date,
    )
    cancelled = set(db.scalars(select(BreakfastOrder.source_key).where(
        BreakfastOrder.service_date == service_date, BreakfastOrder.status == "cancelled",
        BreakfastOrder.source_key.is_not(None),
    )))
    if any(a.service_date != service_date or a.guest_count < 0 for a in aggregates):
        raise ValueError("invalid_breakfast_data")
    return sum(a.guest_count for a in aggregates if a.source_key not in cancelled)


def claim_due(factory, now):
    with factory() as db:
        schedule = db.get(Schedule, 1)
        if not schedule or not schedule.enabled or not schedule.next_run_at:
            return
        due = aware(schedule.next_run_at)
        if due > now:
            return
        day = now.astimezone(PRAGUE).date()
        changed = db.execute(update(Schedule).where(
            Schedule.id == 1, Schedule.revision == schedule.revision,
            Schedule.next_run_at == schedule.next_run_at, Schedule.enabled.is_(True),
        ).values(next_run_at=next_occurrence(schedule.send_time, now)),
            execution_options={"synchronize_session": False})
        if changed.rowcount != 1:
            db.rollback()
            return
        if due.astimezone(PRAGUE).date() == day and not db.scalar(select(Run.id).where(Run.scheduled_date == day)):
            db.add(Run(id=str(uuid4()), scheduled_date=day, service_date=day + timedelta(days=1),
                       settings_revision=schedule.revision, recipients=list(schedule.recipients),
                       state="preparing"))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()  # Another process has already claimed this calendar day.


def prepare_run(factory, ident, now, fetch):
    with factory() as db:
        run = db.get(Run, ident)
        if not run or run.state != "preparing" or run.retry_at and aware(run.retry_at) > now:
            return
        schedule = db.get(Schedule, 1)
        if not schedule or not schedule.enabled or schedule.revision != run.settings_revision:
            run.state, run.error_code = "cancelled", "SETTINGS_CHANGED"
            db.commit()
            return
        if run.scheduled_date != now.astimezone(PRAGUE).date():
            run.state, run.error_code = "failed", "SCHEDULE_EXPIRED"
            db.commit()
            return
        try:
            count = fetch(db, run.service_date)
        except Exception:
            run.error_code, run.retry_at = "BREAKFAST_DATA_UNAVAILABLE", now + timedelta(minutes=1)
            db.commit()
            return
        # Compare-and-set freezes one count and one recipient snapshot even if
        # two API workers complete the same provider read concurrently.
        won = db.execute(update(Run).where(Run.id == ident, Run.state == "preparing").values(
            state="ready", breakfast_count=count, source_checked_at=now, error_code=None,
        ), execution_options={"synchronize_session": False})
        if won.rowcount == 1:
            for recipient in run.recipients:
                db.add(Delivery(id=str(uuid5(NAMESPACE, f"{run.service_date}:{recipient}")),
                                run_id=ident, recipient=recipient, state="pending"))
        db.commit()


def save_receipt(factory, ident, result, now):
    with factory() as db:
        row = db.get(Delivery, ident, with_for_update=True)
        if row is None:
            return
        ranks = {"pending": 0, "submitting": 1, "unknown": 1, "queued": 2, "blocked": 2,
                 "accepted": 3, "delivered": 4, "read": 5, "failed": 6}
        state = "queued" if result["state"] in {"pending", "submitting"} else result["state"]
        if ranks[state] < ranks[row.state]:
            return
        row.state = state
        row.provider_message_id = result.get("provider_message_id")
        error = result.get("error_code")
        row.error_code = error if isinstance(error, str) and error.isascii() and len(error) <= 80 else None
        row.updated_at = now
        db.commit()


async def notification_iteration(*, factory=SessionLocal, now=None, client=None, fetch=fetch_plan):
    current = aware(now or utc_now())
    client = client or NotificationClient()
    await asyncio.to_thread(claim_due, factory, current)
    with factory() as db:
        preparing = list(db.scalars(select(Run.id).where(Run.state == "preparing")))
    for ident in preparing:
        await asyncio.to_thread(prepare_run, factory, ident, current, fetch)

    with factory() as db:
        pending = [(d.id, d.recipient, d.state, r.id, r.scheduled_date, r.settings_revision,
                    r.service_date, r.breakfast_count)
                   for d, r in db.execute(select(Delivery, Run).join(Run).where(
                       Delivery.state.in_(["pending", "submitting", "unknown", "queued", "blocked", "accepted", "delivered"]),
                       Run.scheduled_date >= current.astimezone(PRAGUE).date() - timedelta(days=7),
                   )).all()]
    for ident, recipient, state, run_id, day, revision, service_date, count in pending:
        if state == "pending":
            with factory() as db:
                schedule = db.get(Schedule, 1)
                valid = (schedule and schedule.enabled and schedule.revision == revision
                         and day == aware(now or utc_now()).astimezone(PRAGUE).date())
                if not valid:
                    db.execute(update(Delivery).where(Delivery.id == ident, Delivery.state == "pending")
                               .values(state="cancelled", error_code="SETTINGS_CHANGED_OR_EXPIRED"))
                    db.commit()
                    continue
            try:
                ready = await client.readiness(recipient)
                if ready.get("ready") is not True:
                    raise NotificationUnavailable(ready.get("error_code"))
            except NotificationUnavailable as exc:
                with factory() as db:
                    db.execute(update(Delivery).where(Delivery.id == ident, Delivery.state == "pending")
                               .values(error_code=exc.code, updated_at=current))
                    db.commit()
                continue
            with factory() as db:
                schedule = db.get(Schedule, 1, with_for_update=True)
                if (not schedule or not schedule.enabled or schedule.revision != revision
                        or day != aware(now or utc_now()).astimezone(PRAGUE).date()):
                    continue
                won = db.execute(update(Delivery).where(Delivery.id == ident, Delivery.state == "pending")
                                 .values(state="submitting", updated_at=current))
                db.commit()
                if won.rowcount != 1:
                    continue
            try:
                receipt = await client.send(ident, recipient, message_text(service_date, count))
                save_receipt(factory, ident, receipt, current)
            except Exception:
                # The request may have reached Komunikace. Never replay it.
                with factory() as db:
                    db.execute(update(Delivery).where(Delivery.id == ident, Delivery.state == "submitting")
                               .values(state="unknown", error_code="OUTCOME_UNKNOWN", updated_at=current))
                    db.commit()
        else:
            try:
                receipt = await client.status(ident)
                save_receipt(factory, ident, receipt, current)
            except NotificationUnavailable:
                # A crashed submission is unresolved even when the receiver has
                # no receipt. Never turn that absence into permission to resend.
                with factory() as db:
                    db.execute(update(Delivery).where(Delivery.id == ident, Delivery.state == "submitting")
                               .values(state="unknown", error_code="OUTCOME_UNKNOWN", updated_at=current))
                    db.commit()


async def breakfast_whatsapp_loop():
    while True:
        try:
            await notification_iteration()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.error("Breakfast WhatsApp iteration failed; pending identities preserved")
        await asyncio.sleep(30)
