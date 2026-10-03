"""Room-scoped operational projection; never returns raw guest or billing objects."""

import re
import unicodedata
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

import pycountry


def person_name(guest: Any) -> str | None:
    if not isinstance(guest, dict):
        return None
    name = " ".join(str(guest.get(key) or "").strip() for key in ("last_name", "first_name")).strip()
    return name or str(guest.get("full_name") or "").strip() or None


def country_code(entity: Any) -> str | None:
    address = entity.get("address") if isinstance(entity, dict) else None
    code = str(address.get("country") or "").strip().upper() if isinstance(address, dict) else ""
    country = pycountry.countries.get(**({"alpha_3": code} if len(code) == 3 else {"alpha_2": code})) if len(code) in {2, 3} else None
    return country.alpha_2 if country else None


def guest_age(item: dict[str, Any], day: date) -> tuple[int | None, str]:
    guest = item.get("guest")
    birth = guest.get("birth_date") if isinstance(guest, dict) else None
    if birth:
        try:
            birthday = date.fromisoformat(str(birth))
            age = day.year - birthday.year - ((day.month, day.day) < (birthday.month, birthday.day))
            if age < 0:
                return None, "unknown"
            return age, "infants" if age < 2 else "children" if age < 18 else "adults"
        except (ValueError, TypeError):
            return None, "unknown"
    category = item.get("guest_type")
    if not isinstance(category, dict) and isinstance(guest, dict):
        category = guest.get("guest_type")
    if isinstance(category, dict) and "age_limit" in category:
        limit = category["age_limit"]
        if limit is None and category.get("id"):
            return None, "adults"
        if isinstance(limit, (int, float)) and not isinstance(limit, bool) and limit >= 0:
            return None, "infants" if limit <= 2 else "children" if limit < 18 else "adults"
    return None, "unknown"


def _time(value: Any) -> str | None:
    value = str(value or "").strip()
    return value if re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value) else None


def _charges(reservation: dict[str, Any]) -> dict[str, Any]:
    bill = reservation.get("bill")
    if bill is None:
        return {"dog_count": 0, "cot_required": False, "charges": []}
    if not isinstance(bill, dict) or not isinstance(bill.get("bill_item"), list):
        return {"dog_count": None, "cot_required": None, "charges": []}
    seen: set[str] = set()
    totals = {"dog": Decimal(0), "cot": Decimal(0)}
    invalid: set[str] = set()
    charges = []
    for index, item in enumerate(bill["bill_item"]):
        if not isinstance(item, dict) or item.get("archived"):
            continue
        identity = str(item.get("id") or f"position:{index}")
        if identity in seen:
            continue
        seen.add(identity)
        label = str(item.get("label") or "").strip()
        normalized = unicodedata.normalize("NFKC", label).casefold()
        kind = "dog" if "domácí mazlíček" in normalized else "cot" if "dětská postýlka" in normalized else None
        if kind is None:
            continue
        try:
            quantity = Decimal(str(item.get("quantity")))
            if not quantity.is_finite():
                raise InvalidOperation
        except (InvalidOperation, ValueError):
            invalid.add(kind)
            continue
        totals[kind] += quantity
        charges.append({"kind": kind, "label": label, "quantity": float(quantity), "date": item.get("date")})
    dogs = max(Decimal(0), totals["dog"])
    return {
        "dog_count": int(dogs) if "dog" not in invalid and dogs == dogs.to_integral_value() else None,
        "cot_required": totals["cot"] > 0 if "cot" not in invalid else None,
        "charges": charges,
    }


def reservation_details(reservation: dict[str, Any], day: date) -> dict[str, Any]:
    slots = sorted((item for item in reservation.get("guest_list") or [] if isinstance(item, dict)), key=lambda item: int(item.get("position") or 0))
    main = reservation.get("main_guest")
    if not isinstance(main, dict):
        expanded = reservation.get("guest")
        main = expanded if isinstance(expanded, dict) and str(expanded.get("id")) == str(main) else next(
            (item["guest"] for item in slots if isinstance(item.get("guest"), dict) and str(item["guest"].get("id")) == str(main)), None)
    company = reservation.get("company")
    company_name = str(company.get("name") or "").strip() or None if isinstance(company, dict) else None
    guests = []
    counts = {"adults": 0, "children": 0, "infants": 0, "unknown": 0}
    for item in slots:
        age, group = guest_age(item, day)
        counts[group] += 1
        guests.append({"name": person_name(item.get("guest")), "country_code": country_code(item.get("guest")), "age": age, "age_group": group})
    persons = max(0, int(reservation.get("persons") or 0))
    unknown = counts["unknown"] + abs(persons - len(slots))
    complete = unknown == 0 and len(slots) == persons
    status = reservation.get("reservation_status") or reservation.get("status")
    status_name = str(status.get("name") or "").strip() if isinstance(status, dict) else ""
    states = {"potvrzeno": "confirmed", "check-in": "checked_in", "check-out": "checked_out", "opce": "option"}
    return {
        "reservation_code": str(reservation.get("code") or "").strip() or None,
        "reservation_state": states.get(status_name.casefold()),
        "reservation_status_name": status_name or None,
        "display_name": next((guest["name"] for guest in guests if guest["name"]), None) or person_name(main) or company_name,
        "main_guest_name": person_name(main), "company_name": company_name,
        "country_code": next((code for entity in [main, *(item.get("guest") for item in slots), company] if (code := country_code(entity))), None),
        "adults": counts["adults"] if complete else None,
        "children": counts["children"] if complete else None,
        "infants": counts["infants"] if complete else None,
        "unknown_persons": unknown, "guests": guests,
        "arrival_time": _time(reservation.get("arrival_time")),
        "departure_time": _time(reservation.get("departure_time")),
        **_charges(reservation),
    }
