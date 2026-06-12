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
    base_url = _value("BETTER_HOTEL_BASE_URL", "KAJOVO_API_BETTER_HOTEL_BASE_URL")
    login_path = _value("BETTER_HOTEL_LOGIN_PATH", "KAJOVO_API_BETTER_HOTEL_LOGIN_PATH")
    report_url_template = _value("BETTER_HOTEL_REPORT_URL_TEMPLATE", "KAJOVO_API_BETTER_HOTEL_REPORT_URL_TEMPLATE")
    username = _value("bb_user", "BB_USER", "KAJOVO_API_BETTER_HOTEL_USERNAME")
    password = _value("bb_pass", "BB_PASS", "KAJOVO_API_BETTER_HOTEL_PASSWORD")

    errors: list[str] = []
    if bool(username) != bool(password):
        errors.append("Better Hotel credentials must be provided together: set both bb_user and bb_pass.")
    if (username or password) and not base_url:
        errors.append("Missing Better Hotel base URL: set BETTER_HOTEL_BASE_URL when bb_user/bb_pass are used.")

    if errors:
        print("Better Hotel credential environment check: FAIL", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Better Hotel credential environment check: PASS")
    if username and password:
        print(f"Better Hotel base URL source resolved to: {base_url}")
        if login_path:
            print(f"Better Hotel login path resolved to: {login_path}")
        if report_url_template:
            print("Better Hotel report URL template resolved: yes")
    else:
        print("Better Hotel browser credentials nejsou nastavené; deploy bude spoléhat na live ruční refresh fallback.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
