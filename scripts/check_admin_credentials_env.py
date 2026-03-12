from __future__ import annotations

import os
import sys


def _value(*keys: str) -> str:
    for key in keys:
        value = os.getenv(key, "").strip()
        if value:
            return value
    return ""


def main() -> int:
    hotel_email = os.getenv("HOTEL_ADMIN_EMAIL", "").strip()
    hotel_password = os.getenv("HOTEL_ADMIN_PASSWORD", "").strip()
    api_email = os.getenv("KAJOVO_API_ADMIN_EMAIL", "").strip()
    api_password = os.getenv("KAJOVO_API_ADMIN_PASSWORD", "").strip()

    resolved_email = _value("HOTEL_ADMIN_EMAIL", "KAJOVO_API_ADMIN_EMAIL")
    resolved_password = _value("HOTEL_ADMIN_PASSWORD", "KAJOVO_API_ADMIN_PASSWORD")

    errors: list[str] = []
    if not resolved_email:
        errors.append(
            "Missing admin email: set GitHub secret or variable HOTEL_ADMIN_EMAIL "
            "(optionally mirrored as KAJOVO_API_ADMIN_EMAIL)."
        )
    if not resolved_password:
        errors.append(
            "Missing admin password: set GitHub secret HOTEL_ADMIN_PASSWORD "
            "(optionally mirrored as KAJOVO_API_ADMIN_PASSWORD)."
        )

    if hotel_email and api_email and hotel_email != api_email:
        errors.append(
            "HOTEL_ADMIN_EMAIL and KAJOVO_API_ADMIN_EMAIL must resolve to the same admin email."
        )
    if hotel_password and api_password and hotel_password != api_password:
        errors.append(
            "HOTEL_ADMIN_PASSWORD and KAJOVO_API_ADMIN_PASSWORD must resolve to the same admin password."
        )

    if errors:
        print("Admin credential environment check: FAIL", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Admin credential environment check: PASS")
    print(f"Admin email source resolved to: {resolved_email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
