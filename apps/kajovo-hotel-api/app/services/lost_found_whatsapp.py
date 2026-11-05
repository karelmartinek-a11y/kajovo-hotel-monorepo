"""Durable notifications for new finds; the communication service owns WhatsApp."""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import re
import stat
from datetime import timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import LostFoundItem, LostFoundPhoto, LostFoundWhatsappPart
from app.db.session import SessionLocal
from app.media.storage import MediaStorage
from app.time_utils import utc_now

ENDPOINT = "https://kajovokomunikace-mcp-ai-agent.hcasc.cz/mcp"
PREFIX = "KájovoHotel – nález #"
TERMINAL = {"delivered", "read", "failed", "cancelled"}
LABELS = {
    "new": "Nové",
    "stored": "Uloženo",
    "claimed": "Přihlásil se majitel",
    "returned": "Vráceno",
    "disposed": "Vyřazeno",
}
TAGS = {
    "kontaktova": "Kontaktován",
    "nezastizen": "Nezastižen",
    "vyzvedne": "Vyzvedne",
    "odesleme": "Odešleme",
}


def enqueue_find(db: Session, item: LostFoundItem) -> None:
    if item.item_type != "found" or item.whatsapp_event_id:
        return
    item.whatsapp_event_id = str(uuid4())
    event = (
        item.event_at.replace(tzinfo=timezone.utc)
        if item.event_at.tzinfo is None
        else item.event_at
    )
    text = "\n".join(
        [
            f"{PREFIX}{item.id}",
            f"Otevřít nález: https://kajovocml.hcasc.cz/#hotel?view=lostfound-detail&id={item.id}",
            "Typ: Nález",
            f"Popis: {item.description}",
            f"Kategorie: {item.category}",
            f"Umístění: {item.location}",
            f"Pokoj: {item.room_number or '—'}",
            f"Datum a čas: {event.astimezone(ZoneInfo('Europe/Prague')).strftime('%d. %m. %Y %H:%M:%S')}",
            f"Stav: {LABELS.get(item.status, item.status)}",
            f"Štítky: {', '.join(TAGS.get(tag, tag) for tag in item.tags) or '—'}",
            f"Majitel: {item.claimant_name or '—'}",
            f"Kontakt: {item.claimant_contact or '—'}",
            f"Poznámka k předání: {item.handover_note or '—'}",
        ]
    )
    # Leave room for a stable find/part label in every template. Never truncate content.
    chunks, chunk, units = [], "", 0
    for character in text:
        width = 2 if ord(character) > 65535 else 1
        if units + width > 780:
            chunks.append(chunk)
            chunk, units = "", 0
        chunk += character
        units += width
    if chunk:
        chunks.append(chunk)
    for index, chunk in enumerate(chunks):
        label = "" if len(chunks) == 1 else f"{PREFIX}{item.id} · část {index + 1}/{len(chunks)}\n"
        db.add(
            LostFoundWhatsappPart(
                id=str(uuid4()),
                item_id=item.id,
                event_id=item.whatsapp_event_id,
                part_key=f"0:text:{index:04d}",
                text=label + chunk,
                recipient=get_settings().lost_found_whatsapp_recipient,
                state="pending",
            )
        )


def enqueue_photo(db: Session, item: LostFoundItem, photo: LostFoundPhoto) -> None:
    # Historical finds and lost-item records are never retrospectively broadcast.
    if item.item_type != "found" or not item.whatsapp_event_id:
        return
    db.add(
        LostFoundWhatsappPart(
            id=str(uuid4()),
            item_id=item.id,
            event_id=item.whatsapp_event_id,
            part_key=f"1:photo:{photo.id:020d}",
            text=f"{PREFIX}{item.id}\nFotografie {photo.sort_order + 1}",
            media_path=photo.file_path,
            recipient=get_settings().lost_found_whatsapp_recipient,
            state="pending",
        )
    )


def cancel_find(db: Session, item_id: int) -> None:
    item = db.get(LostFoundItem, item_id)
    db.execute(
        update(LostFoundWhatsappPart)
        .where(
            LostFoundWhatsappPart.event_id == item.whatsapp_event_id,
            LostFoundWhatsappPart.state.in_(["pending", "blocked"]),
        )
        .values(state="cancelled", text="", media_path=None)
    )


def notification_summary(db: Session, item: LostFoundItem) -> LostFoundItem:
    parts = list(
        db.scalars(
            select(LostFoundWhatsappPart).where(
                LostFoundWhatsappPart.event_id == item.whatsapp_event_id
            )
        )
    )
    if parts:
        sent = sum(part.state in {"accepted", "delivered", "read"} for part in parts)
        state = (
            "attention"
            if any(p.state in {"failed", "unknown", "blocked"} for p in parts)
            else "accepted"
            if sent == len(parts)
            else "pending"
        )
        item.whatsapp_notification = {
            "state": state,
            "accepted_parts": sent,
            "total_parts": len(parts),
        }
    return item


def _token() -> str:
    path = get_settings().lost_found_whatsapp_token_file
    if not path:
        raise ValueError("WHATSAPP_CONFIGURATION_REQUIRED")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > 512:
            raise ValueError("WHATSAPP_CONFIGURATION_REQUIRED")
        token = handle.read().strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,256}", token):
        raise ValueError("WHATSAPP_CONFIGURATION_REQUIRED")
    return token


async def call_communication(name: str, arguments: dict) -> dict:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    async with streamablehttp_client(
        ENDPOINT, headers={"Authorization": "Bearer " + _token()}, timeout=40, sse_read_timeout=45
    ) as (reader, writer, _):
        async with ClientSession(reader, writer) as session:
            await session.initialize()
            result = await session.call_tool(name, arguments)
    body = result.structuredContent
    if not isinstance(body, dict):
        body = json.loads(next(block.text for block in result.content if block.type == "text"))
    if result.isError or body.get("ok") is not True:
        code = body.get("error", {}).get("code", "COMMUNICATION_ERROR")
        if code == "NOT_FOUND":
            return {"state": "not_found"}
        raise ValueError(
            code if re.fullmatch(r"[A-Z0-9_]{1,64}", str(code)) else "COMMUNICATION_ERROR"
        )
    data = body.get("data")
    if not isinstance(data, dict):
        raise ValueError("COMMUNICATION_RESPONSE_INVALID")
    return data


def _image(path: str) -> dict:
    from PIL import Image, ImageOps

    raw = MediaStorage(get_settings().media_root).resolve(path).read_bytes()
    with Image.open(io.BytesIO(raw)) as image:
        image.verify()
    with Image.open(io.BytesIO(raw)) as image:
        if image.format in {"JPEG", "PNG"} and len(raw) <= 2_000_000:
            return {
                "mime_type": "image/jpeg" if image.format == "JPEG" else "image/png",
                "data_base64": base64.b64encode(raw).decode(),
            }
        converted = ImageOps.exif_transpose(image).convert("RGB")
        for size in (2400, 1800, 1200):
            converted.thumbnail((size, size))
            for quality in (88, 75, 60):
                output = io.BytesIO()
                converted.save(output, format="JPEG", quality=quality)
                if output.tell() <= 2_000_000:
                    return {
                        "mime_type": "image/jpeg",
                        "data_base64": base64.b64encode(output.getvalue()).decode(),
                    }
    raise ValueError("IMAGE_TOO_LARGE")


async def dispatch_pending(*, session_factory=SessionLocal, call=call_communication) -> None:
    if not get_settings().lost_found_whatsapp_enabled:
        return
    now = utc_now()
    with session_factory() as db:
        # After a crash, recover only the same operation's receipt.
        db.execute(
            update(LostFoundWhatsappPart)
            .where(
                LostFoundWhatsappPart.state == "submitting",
                LostFoundWhatsappPart.updated_at < now - timedelta(minutes=2),
            )
            .values(state="unknown")
        )
        db.commit()
        ids = list(
            db.scalars(
                select(LostFoundWhatsappPart.id)
                .where(
                    LostFoundWhatsappPart.state.not_in(TERMINAL),
                    LostFoundWhatsappPart.next_attempt_at <= now,
                )
                .order_by(LostFoundWhatsappPart.created_at, LostFoundWhatsappPart.part_key)
                .limit(25)
            )
        )
    for operation_id in ids:
        with session_factory() as db:
            part = db.get(LostFoundWhatsappPart, operation_id)
            if not part or part.state == "submitting":
                continue
            previous = part.state
            try:
                if previous in {"queued", "unknown", "accepted"}:
                    receipt = await call(
                        "whatsapp_message_status", {"notification_id": operation_id}
                    )
                    if receipt.get("state") == "not_found":
                        if previous == "accepted":
                            raise ValueError("COMMUNICATION_RECEIPT_MISSING")
                        # Authoritative absence permits the same UUID on a later worker tick.
                        part.state = "pending"
                    else:
                        state = _receipt_state(receipt, operation_id)
                        if previous == "accepted" and state in {"queued", "unknown"}:
                            raise ValueError("COMMUNICATION_RECEIPT_UNCONFIRMED")
                        part.state = state
                else:
                    recipient = part.recipient or get_settings().lost_found_whatsapp_recipient
                    if not re.fullmatch(r"\+[1-9]\d{7,14}", recipient):
                        raise ValueError("WHATSAPP_CONFIGURATION_REQUIRED")
                    arguments = {
                        "operation_id": operation_id,
                        "recipient": recipient,
                        "text": part.text,
                    }
                    if part.media_path:
                        arguments["image"] = _image(part.media_path)
                    claimed = db.execute(
                        update(LostFoundWhatsappPart)
                        .where(
                            LostFoundWhatsappPart.id == operation_id,
                            LostFoundWhatsappPart.state.in_(["pending", "blocked"]),
                        )
                        .values(state="submitting", recipient=recipient, updated_at=utc_now())
                    )
                    db.commit()
                    if not claimed.rowcount:
                        continue
                    receipt = await call("whatsapp_send_message", arguments)
                    part = db.get(LostFoundWhatsappPart, operation_id)
                    part.state = _receipt_state(receipt, operation_id)
                part.error_code = receipt.get("error_code")
            except Exception as error:
                # Never log message bodies, image data, credentials or provider responses.
                db.rollback()
                part = db.get(LostFoundWhatsappPart, operation_id)
                # Proven acceptance must survive read failures: never re-enter the send path.
                if previous != "accepted":
                    part.state = (
                        "unknown"
                        if part.state == "submitting" or previous in {"queued", "unknown"}
                        else "blocked"
                    )
                safe_code = (
                    str(error)
                    if isinstance(error, ValueError)
                    and re.fullmatch(r"[A-Z0-9_]{1,64}", str(error))
                    else "COMMUNICATION_UNAVAILABLE"
                )
                part.error_code = safe_code
            part.updated_at = utc_now()
            part.next_attempt_at = utc_now() + timedelta(
                seconds=60 if part.state in {"blocked", "unknown", "accepted"} else 5
            )
            db.commit()


def _receipt_state(receipt: dict, operation_id: str) -> str:
    if receipt.get("id") != operation_id:
        raise ValueError("COMMUNICATION_RESPONSE_INVALID")
    state = receipt.get("state")
    if state in {"accepted", "delivered", "read", "failed", "unknown"}:
        return state
    if state in {"pending", "blocked", "submitting"}:
        return "queued"
    raise ValueError("COMMUNICATION_RESPONSE_INVALID")


async def scheduler_loop() -> None:
    while True:
        try:
            await dispatch_pending()
        except asyncio.CancelledError:
            raise
        except Exception:
            logging.getLogger(__name__).error("Lost-found WhatsApp worker unavailable")
        await asyncio.sleep(5)
