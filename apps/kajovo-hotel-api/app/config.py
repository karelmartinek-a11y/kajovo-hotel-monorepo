from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "KajovoHotel API"
    app_version: str = "0.1.0"
    environment: str = "development"
    database_url: str = "sqlite:///./kajovo_hotel.db"
    admin_email: str = "admin@kajovohotel.local"
    admin_password: str = "admin123"
    smtp_enabled: bool = False
    smtp_from_email: str = "noreply@kajovohotel.local"
    smtp_encryption_key: str = "dev-only-smtp-key-change-in-production"
    media_root: str = "/app/data/media"
    inventory_seed_enabled: bool = False
    trusted_hosts: list[str] = Field(
        default_factory=lambda: [
            "kajovohotel.hcasc.cz",
            "kajovohotel-staging.hcasc.cz",
            "kajovohotel.local",
            "localhost",
            "127.0.0.1",
        ]
    )
    cors_allow_origins: list[str] = Field(
        default_factory=lambda: [
            "https://kajovohotel.hcasc.cz",
            "https://kajovohotel-staging.hcasc.cz",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )
    session_max_age_seconds: int = 3600
    device_token_pepper: str = ""
    device_challenge_max_age_seconds: int = 300
    content_security_policy: str = (
        "default-src 'self'; "
        "img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; "
        "connect-src 'self'; "
        "font-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )

    model_config = SettingsConfigDict(env_prefix="KAJOVO_API_")


@lru_cache
def get_settings() -> Settings:
    return Settings()
