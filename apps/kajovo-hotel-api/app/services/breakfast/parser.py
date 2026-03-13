from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO


@dataclass(frozen=True)
class BreakfastRow:
    day: date
    room: str
    breakfast_count: int
    guest_name: str | None = None


DATE_RE = re.compile(
    r"(?:prehled)\s+stravy(?:\s+na\s+den)?\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4})",
    re.IGNORECASE,
)
DATE_FALLBACK_RE = re.compile(r"\b(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b")
DATE_RANGE_RE = re.compile(
    r"\d{1,2}[./-]\d{1,2}\.?[./-]?\s*-\s*\d{1,2}[./-]\d{1,2}\.?(?:[./-]\d{2,4})?"
)
ROOM_PREFIXES = {"KOMFORT", "LOWCOST", "SUPERIOR"}
BOOKING_NOISE = re.compile(r"(booking\.com|b\.v\.|mevris)", re.IGNORECASE)
HEADER_NOISE_MARKERS = (
    "prehled stravy",
    "pokoj oznaceni rezervace",
    "prijezd",
    "odjezd",
    "den bez",
    "sni dane",
    "all inclusive",
    "powered by",
    "hotel chodov asc",
    "miroveho hnuti",
    "recepce@hotelchodovasc.cz",
    "www.hotelchodovasc.cz",
    "celkem:",
    "dospely",
    "dite",
    "mimino",
)


def _strip_accents(text: str) -> str:
    base = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in base if not unicodedata.combining(ch))


def _normalize_line(text: str) -> str:
    return re.sub(r"\s+", " ", _strip_accents(text or "")).strip()


def _parse_date_candidate(text: str) -> date:
    for fmt in ("%d.%m.%Y", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unsupported date format: {text}")


def _find_report_date(full_text: str) -> date:
    normalized = _strip_accents(full_text)
    match = DATE_RE.search(normalized)
    if match:
        return _parse_date_candidate(match.group(1))

    lines = normalized.splitlines()
    for idx, line in enumerate(lines):
        if "prehled stravy" not in line.lower():
            continue
        for candidate_idx in (idx, idx + 1):
            if candidate_idx >= len(lines):
                continue
            candidate = DATE_FALLBACK_RE.search(lines[candidate_idx])
            if candidate:
                return _parse_date_candidate(candidate.group(1))

    fallback = DATE_FALLBACK_RE.search("\n".join(lines[:20]))
    if fallback:
        return _parse_date_candidate(fallback.group(1))

    raise ValueError("PDF date not found (expected 'Prehled stravy <datum>').")


def _should_skip_line(line: str) -> bool:
    normalized = _normalize_line(line).lower()
    if not normalized:
        return True
    return any(marker in normalized for marker in HEADER_NOISE_MARKERS)


def _clean_guest_segment(segment: str) -> str:
    cleaned = re.sub(r"\s+", " ", segment or "").strip(" ,;-|.")
    if not cleaned:
        return ""
    tokens = cleaned.split()
    while tokens and _strip_accents(tokens[0]).upper() in ROOM_PREFIXES:
        tokens = tokens[1:]
    cleaned = " ".join(tokens).strip(" ,;-|.")
    if not cleaned or BOOKING_NOISE.search(cleaned):
        return ""
    return cleaned


def _extract_guest_name(raw: str) -> str:
    if not raw:
        return ""

    head = DATE_RANGE_RE.split(raw, maxsplit=1)[0]
    head = re.split(r"\d{1,2}[./-]\d{1,2}[./-]\d{2,4}", head, maxsplit=1)[0]
    head = head.replace("|", ";")
    names = [_clean_guest_segment(part) for part in head.split(";")]
    cleaned = [name for name in names if name]
    return "; ".join(cleaned)


def _collect_blocks(full_text: str) -> list[str]:
    blocks: list[str] = []
    current: str | None = None
    for raw_line in full_text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if _should_skip_line(line):
            continue
        if re.match(r"^\d{3}\b", line):
            if current:
                blocks.append(current)
            current = line
            continue
        if current:
            current += f" {line}"
    if current:
        blocks.append(current)
    return blocks


def parse_breakfast_text(full_text: str) -> tuple[date, list[BreakfastRow]]:
    report_date = _find_report_date(full_text)
    blocks = _collect_blocks(full_text)

    per_room: dict[str, int] = defaultdict(int)
    names: dict[str, str] = {}

    for block in blocks:
        room_match = re.match(r"^(\d{3})\b", block)
        if not room_match:
            continue
        room = room_match.group(1)
        rest = block[room_match.end() :].strip()

        fraction = re.search(r"(\d+)\s*/\s*(\d+)", rest)
        if not fraction:
            continue

        guest_clean = _extract_guest_name(rest[: fraction.start()].strip(" -;|"))
        numbers = [int(number) for number in re.findall(r"\d+", rest[fraction.end() :])]
        if not numbers:
            continue

        breakfast = numbers[1] if len(numbers) > 1 else numbers[0]
        if breakfast <= 0:
            continue

        per_room[room] += breakfast
        if guest_clean and room not in names:
            names[room] = guest_clean

    rows = [
        BreakfastRow(day=report_date, room=room, breakfast_count=count, guest_name=names.get(room))
        for room, count in per_room.items()
    ]
    rows.sort(key=lambda row: int(re.sub(r"\D", "", row.room) or "0"))
    return report_date, rows


def parse_breakfast_pdf(pdf_bytes: bytes) -> tuple[date, list[BreakfastRow]]:
    try:
        from pypdf import PdfReader
    except Exception as exc:  # pragma: no cover
        raise ValueError("Missing dependency pypdf for PDF import") from exc

    reader = PdfReader(BytesIO(pdf_bytes))
    full_text = "\n".join((page.extract_text() or "") for page in reader.pages)
    return parse_breakfast_text(full_text)
