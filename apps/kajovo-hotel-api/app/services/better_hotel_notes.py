from __future__ import annotations

from typing import Any


def housekeep_note(reservation: dict[str, Any]) -> str | None:
    notes = reservation.get("reservation_note")
    if not isinstance(notes, list):
        return None
    parts = [str(item.get("housekeep") or "").strip() for item in notes if isinstance(item, dict)]
    text = "\n".join(dict.fromkeys(part for part in parts if part))
    return text or None
