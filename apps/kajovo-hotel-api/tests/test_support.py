import os


def _in_ci() -> bool:
    return os.getenv("CI") == "true" or os.getenv("GITHUB_ACTIONS") == "true"


def admin_email() -> str:
    value = os.getenv("KAJOVO_API_ADMIN_EMAIL") or os.getenv("HOTEL_ADMIN_EMAIL")
    if value:
        return value.strip().lower()
    if _in_ci():
        raise RuntimeError(
            "Missing admin email for tests. Set HOTEL_ADMIN_EMAIL or KAJOVO_API_ADMIN_EMAIL."
        )
    return "admin@kajovohotel.local"


def admin_password() -> str:
    value = os.getenv("KAJOVO_API_ADMIN_PASSWORD") or os.getenv("HOTEL_ADMIN_PASSWORD")
    if value:
        return value
    if _in_ci():
        raise RuntimeError(
            "Missing admin password for tests. Set HOTEL_ADMIN_PASSWORD or KAJOVO_API_ADMIN_PASSWORD."
        )
    return "admin123"


def admin_login_payload() -> dict[str, str]:
    return {
        "email": admin_email(),
        "password": admin_password(),
    }
