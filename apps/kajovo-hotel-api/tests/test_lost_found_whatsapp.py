import asyncio
import io
from datetime import timedelta
from types import SimpleNamespace

import pytest
from PIL import Image
from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import sessionmaker

from app.api.routes.lost_found import create_lost_found_item, upload_lost_found_photos
from app.api.schemas import LostFoundItemCreate
from app.config import get_settings
from app.db.models import Base, LostFoundItem, LostFoundPhoto, LostFoundWhatsappPart
from app.services import lost_found_whatsapp as worker
from app.time_utils import utc_now


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("KAJOVO_API_LOST_FOUND_WHATSAPP_ENABLED", "true")
    monkeypatch.setenv("KAJOVO_API_LOST_FOUND_WHATSAPP_RECIPIENT", "+420777000111")
    monkeypatch.setenv("KAJOVO_API_MEDIA_ROOT", str(tmp_path / "media"))
    get_settings.cache_clear()
    engine = create_engine("sqlite:///" + str(tmp_path / "notifications.db"))
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False)
    yield factory
    engine.dispose()
    get_settings.cache_clear()


def create(factory, **extra):
    with factory() as db:
        return create_lost_found_item(
            LostFoundItemCreate(
                **{
                    "description": "Nalezená modrá taška\nVčetně popruhu 😀",
                    "category": "Zavazadlo",
                    "location": "U výtahu",
                    "room_number": "223",
                    "event_at": "2026-11-03T10:00:00Z",
                    "claimant_name": "Testovací jméno",
                    "claimant_contact": "Pouze syntetický kontakt",
                    "handover_note": "Uloženo na recepci",
                    "tags": ["kontaktova"],
                    **extra,
                }
            ),
            db,
        ).id


def parts(factory):
    with factory() as db:
        return list(
            db.scalars(select(LostFoundWhatsappPart).order_by(LostFoundWhatsappPart.part_key))
        )


def ready(factory):
    with factory() as db:
        db.execute(
            update(LostFoundWhatsappPart).values(next_attempt_at=utc_now() - timedelta(seconds=1))
        )
        db.commit()


def photo(factory, item_id, color="blue", format="PNG"):
    out = io.BytesIO()
    Image.new("RGB", (20, 20), color).save(out, format=format)
    out.seek(0)
    upload = SimpleNamespace(
        file=out, filename="photo." + format.lower(), content_type="image/" + format.lower()
    )
    with factory() as db:
        upload_lost_found_photos(item_id, [upload], db)


def test_complete_snapshot_is_created_in_the_item_transaction_and_never_for_loss(store):
    item_id = create(store)
    text = "".join(part.text for part in parts(store))
    assert "Nalezená modrá taška\nVčetně popruhu 😀" in text
    assert (
        f"Otevřít nález: https://kajovocml.hcasc.cz/#hotel?view=lostfound-detail&id={item_id}\n"
        in parts(store)[0].text
    )
    assert all(
        value in text
        for value in [
            "U výtahu",
            "223",
            "Testovací jméno",
            "Pouze syntetický kontakt",
            "Uloženo na recepci",
            "Kontaktován",
            "11:00:00",
        ]
    )
    create(store, item_type="lost")
    assert {part.item_id for part in parts(store)} == {item_id}
    with store() as db:
        item = db.get(LostFoundItem, item_id)
        item.description = "Pozdější oprava"
        db.commit()
    assert "Pozdější oprava" not in "".join(part.text for part in parts(store))


def test_long_unicode_text_is_not_truncated_and_each_part_fits_provider(store):
    description = "😀\nŽlutá  taška " * 260
    item_id = create(store, description=description, handover_note="Další text " * 170)
    rows = parts(store)
    assert len(rows) > 4
    content = "".join(row.text.split("\n", 1)[1] for row in rows)
    assert description in content
    assert "Další text " * 170 in content
    assert all(len(row.text.encode("utf-16-le")) // 2 <= 900 for row in rows)
    url = f"https://kajovocml.hcasc.cz/#hotel?view=lostfound-detail&id={item_id}"
    assert url in rows[0].text
    assert sum(row.text.count(url) for row in rows) == 1


def test_all_later_photos_are_queued_once_and_historical_items_stay_silent(store):
    item_id = create(store)
    for color in ["red", "blue", "green", "yellow"]:
        photo(store, item_id, color)
    rows = parts(store)
    assert len([row for row in rows if row.media_path]) == 4
    assert len({row.id for row in rows}) == len(rows)
    with store() as db:
        old = LostFoundItem(
            description="Původní nález", category="Test", location="Test", event_at=utc_now()
        )
        db.add(old)
        db.commit()
        old_id = old.id
    photo(store, old_id)
    assert {row.item_id for row in parts(store)} == {item_id}


def test_failed_text_does_not_stop_photos_and_unknown_send_only_reads_original_receipt(store):
    item_id = create(store)
    photo(store, item_id, format="WEBP")
    calls = []

    async def fake(name, arguments):
        calls.append((name, arguments))
        if name == "whatsapp_message_status":
            return {"id": arguments["notification_id"], "state": "accepted"}
        if "image" not in arguments:
            raise TimeoutError("synthetic transport loss")
        assert arguments["image"]["mime_type"] == "image/jpeg"
        assert "https:" not in arguments["image"]["data_base64"]
        return {"id": arguments["operation_id"], "state": "accepted"}

    ready(store)
    asyncio.run(worker.dispatch_pending(session_factory=store, call=fake))
    assert {row.state for row in parts(store)} == {"unknown", "accepted"}
    ready(store)
    asyncio.run(worker.dispatch_pending(session_factory=store, call=fake))
    assert all(row.state == "accepted" for row in parts(store))
    assert [name for name, _ in calls].count("whatsapp_send_message") == 2
    assert [name for name, _ in calls].count("whatsapp_message_status") == 2
    ready(store)
    asyncio.run(worker.dispatch_pending(session_factory=store, call=fake))
    assert [name for name, _ in calls].count("whatsapp_send_message") == 2
    assert [name for name, _ in calls].count("whatsapp_message_status") == 4


@pytest.mark.parametrize("final_state", ["delivered", "read", "failed"])
def test_accepted_receipt_is_monitored_until_final_provider_result(store, final_state):
    item_id = create(store)
    operation_id = parts(store)[0].id
    calls = []

    async def fake(name, args):
        calls.append((name, args))
        if name == "whatsapp_send_message":
            return {"id": args["operation_id"], "state": "accepted"}
        assert args == {"notification_id": operation_id}
        return {
            "id": operation_id,
            "state": final_state,
            "error_code": "131042" if final_state == "failed" else None,
        }

    ready(store)
    asyncio.run(worker.dispatch_pending(session_factory=store, call=fake))
    assert parts(store)[0].state == "accepted"
    assert parts(store)[0].next_attempt_at > utc_now().replace(tzinfo=None) + timedelta(seconds=50)
    ready(store)
    asyncio.run(worker.dispatch_pending(session_factory=store, call=fake))
    result = parts(store)[0]
    assert result.state == final_state
    assert result.error_code == ("131042" if final_state == "failed" else None)
    with store() as db:
        summary = worker.notification_summary(db, db.get(LostFoundItem, item_id)).whatsapp_notification
        assert summary["state"] == ("attention" if final_state == "failed" else "accepted")
        assert summary["accepted_parts"] == (0 if final_state == "failed" else 1)
    ready(store)
    asyncio.run(worker.dispatch_pending(session_factory=store, call=fake))
    assert [name for name, _ in calls] == ["whatsapp_send_message", "whatsapp_message_status"]


@pytest.mark.parametrize("read_problem", ["timeout", "not_found", "unknown", "pending", "foreign"])
def test_accepted_receipt_read_failure_never_repeats_original_send(store, read_problem):
    create(store)
    operation_id = parts(store)[0].id
    calls = []
    recovered = False

    async def fake(name, args):
        calls.append((name, args))
        if name == "whatsapp_send_message":
            return {"id": args["operation_id"], "state": "accepted"}
        assert args == {"notification_id": operation_id}
        if recovered:
            return {"id": operation_id, "state": "delivered"}
        if read_problem == "timeout":
            raise TimeoutError("synthetic read failure")
        return {
            "id": "another-operation" if read_problem == "foreign" else operation_id,
            "state": "accepted" if read_problem == "foreign" else read_problem,
        }

    ready(store)
    asyncio.run(worker.dispatch_pending(session_factory=store, call=fake))
    for _ in range(2):
        ready(store)
        asyncio.run(worker.dispatch_pending(session_factory=store, call=fake))
        assert parts(store)[0].state == "accepted"
        assert parts(store)[0].error_code
    recovered = True
    ready(store)
    asyncio.run(worker.dispatch_pending(session_factory=store, call=fake))
    assert parts(store)[0].state == "delivered"
    assert parts(store)[0].error_code is None
    assert [name for name, _ in calls].count("whatsapp_send_message") == 1
    assert [name for name, _ in calls].count("whatsapp_message_status") == 3


def test_authoritative_missing_receipt_recovers_same_uuid_on_later_tick(store):
    create(store)
    original = parts(store)[0].id
    with store() as db:
        db.execute(update(LostFoundWhatsappPart).values(state="unknown"))
        db.commit()
    calls = []

    async def fake(name, args):
        calls.append((name, args))
        return (
            {"state": "not_found"}
            if name.endswith("_status")
            else {"id": args["operation_id"], "state": "pending"}
        )

    ready(store)
    asyncio.run(worker.dispatch_pending(session_factory=store, call=fake))
    assert [name for name, _ in calls] == ["whatsapp_message_status"]
    ready(store)
    asyncio.run(worker.dispatch_pending(session_factory=store, call=fake))
    assert calls[1][1]["operation_id"] == original
    assert parts(store)[0].state == "queued"


def test_disabled_worker_never_calls_provider_and_deletion_cancels_only_unsent(store, monkeypatch):
    item_id = create(store)
    monkeypatch.setenv("KAJOVO_API_LOST_FOUND_WHATSAPP_ENABLED", "false")
    get_settings.cache_clear()

    async def forbidden(*args):
        raise AssertionError("disabled worker must not send")

    asyncio.run(worker.dispatch_pending(session_factory=store, call=forbidden))
    assert parts(store)[0].state == "pending"
    with store() as db:
        worker.cancel_find(db, item_id)
        db.commit()
    assert parts(store)[0].state == "cancelled"


def test_rolled_back_creation_cannot_send(store):
    with store() as db:
        item = LostFoundItem(
            description="Rollback test", category="Test", location="Test", event_at=utc_now()
        )
        db.add(item)
        db.flush()
        worker.enqueue_find(db, item)
        db.rollback()
    assert parts(store) == []


def test_reused_numeric_id_has_a_new_notification_identity(store):
    first = create(store)
    first_event = parts(store)[0].event_id
    with store() as db:
        worker.cancel_find(db, first)
        db.delete(db.get(LostFoundItem, first))
        db.commit()
    second = create(store)
    assert second == first  # SQLite may reuse a deleted numeric primary key.
    with store() as db:
        item = db.get(LostFoundItem, second)
        assert item.whatsapp_event_id != first_event
        assert worker.notification_summary(db, item).whatsapp_notification["total_parts"] == 1


def test_concurrent_workers_do_not_submit_the_same_part_twice(store):
    create(store)
    calls = []

    async def fake(name, arguments):
        calls.append((name, arguments))
        await asyncio.sleep(0.02)
        return {"id": arguments["operation_id"], "state": "accepted"}

    async def both():
        await asyncio.gather(
            worker.dispatch_pending(session_factory=store, call=fake),
            worker.dispatch_pending(session_factory=store, call=fake),
        )

    ready(store)
    asyncio.run(both())
    assert len(calls) == 1


def test_status_distinguishes_provider_acceptance_from_waiting_or_failure(store):
    item_id = create(store)
    with store() as db:
        summary = worker.notification_summary(
            db, db.get(LostFoundItem, item_id)
        ).whatsapp_notification
        assert summary == {"state": "pending", "accepted_parts": 0, "total_parts": 1}
        db.execute(
            update(LostFoundWhatsappPart).values(state="failed", error_code="TEST_REJECTION")
        )
        db.commit()
        assert (
            worker.notification_summary(db, db.get(LostFoundItem, item_id)).whatsapp_notification[
                "state"
            ]
            == "attention"
        )


def test_image_and_invalid_media_errors_do_not_abort_other_notifications(store):
    item_id = create(store)
    with store() as db:
        image = LostFoundPhoto(
            item_id=item_id,
            sort_order=0,
            file_path="missing.jpg",
            thumb_path="missing.jpg",
            mime_type="image/jpeg",
            size_bytes=5,
        )
        db.add(image)
        db.flush()
        worker.enqueue_photo(db, db.get(LostFoundItem, item_id), image)
        db.commit()

    async def fake(name, args):
        return {"id": args["operation_id"], "state": "accepted"}

    ready(store)
    asyncio.run(worker.dispatch_pending(session_factory=store, call=fake))
    assert {row.state for row in parts(store)} == {"blocked", "accepted"}
