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
    base_url = _value("BETTER_HOTEL_CONNECTOR_BASE_URL", "KAJOVO_API_BETTER_HOTEL_CONNECTOR_BASE_URL")
    access_token = _value("BETTER_HOTEL_ACCESS_TOKEN", "KAJOVO_API_BETTER_HOTEL_ACCESS_TOKEN", "A_token")
    client_token = _value("BETTER_HOTEL_CLIENT_TOKEN", "KAJOVO_API_BETTER_HOTEL_CLIENT_TOKEN", "C_token")

    errors: list[str] = []
    if not access_token:
        errors.append("Missing Better Hotel access token env: BETTER_HOTEL_ACCESS_TOKEN.")
    if not client_token:
        errors.append("Missing Better Hotel client token env: BETTER_HOTEL_CLIENT_TOKEN.")
    if not base_url:
        base_url = "https://api.better-hotel.com/api/connector/v/1"

    if errors:
        print("Better Hotel credential environment check: FAIL", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Better Hotel credential environment check: PASS")
    print(f"Better Hotel connector base URL resolved to: {base_url}")
    print("Better Hotel token mapping resolved: BETTER_HOTEL_ACCESS_TOKEN + BETTER_HOTEL_CLIENT_TOKEN")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
