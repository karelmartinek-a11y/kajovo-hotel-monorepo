import os


def admin_email() -> str:
    return (
        os.getenv("KAJOVO_API_ADMIN_EMAIL")
        or os.getenv("HOTEL_ADMIN_EMAIL")
        or "admin@kajovohotel.local"
    ).strip().lower()


def admin_password() -> str:
    return os.getenv("KAJOVO_API_ADMIN_PASSWORD") or os.getenv("HOTEL_ADMIN_PASSWORD") or "admin123"


def admin_login_payload() -> dict[str, str]:
    return {
        "email": admin_email(),
        "password": admin_password(),
    }
