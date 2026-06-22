from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "KajovoHotel API"
    app_version: str = "0.1.0"
    environment: str = "development"
    database_url: str = "sqlite:///./kajovo_hotel.db"
    admin_email: str = Field(
        default="admin@kajovohotel.local",
        validation_alias=AliasChoices("KAJOVO_API_ADMIN_EMAIL", "HOTEL_ADMIN_EMAIL"),
    )
    admin_password: str = Field(
        default="admin123",
        validation_alias=AliasChoices("KAJOVO_API_ADMIN_PASSWORD", "HOTEL_ADMIN_PASSWORD"),
    )
    smtp_enabled: bool = False
    smtp_from_email: str = "noreply@kajovohotel.local"
    smtp_encryption_key: str = "dev-only-smtp-key-change-in-production"
    smtp_capture_path: str = ""
    media_root: str = "/app/data/media"
    breakfast_scheduler_enabled: bool = True
    breakfast_scheduler_interval_seconds: int = 300
    breakfast_scheduler_retry_seconds: int = 30
    breakfast_scheduler_max_retries: int = 3
    better_hotel_connector_base_url: str = Field(
        default="https://api.better-hotel.com/api/connector/v/1",
        validation_alias=AliasChoices(
            "BETTER_HOTEL_CONNECTOR_BASE_URL",
            "KAJOVO_API_BETTER_HOTEL_CONNECTOR_BASE_URL",
            "BETTER_HOTEL_BASE_URL",
            "KAJOVO_API_BETTER_HOTEL_BASE_URL",
        ),
    )
    better_hotel_access_token: str = Field(
        default="",
        validation_alias=AliasChoices(
            "BETTER_HOTEL_ACCESS_TOKEN",
            "KAJOVO_API_BETTER_HOTEL_ACCESS_TOKEN",
            "A_token",
        ),
    )
    better_hotel_client_token: str = Field(
        default="",
        validation_alias=AliasChoices(
            "BETTER_HOTEL_CLIENT_TOKEN",
            "KAJOVO_API_BETTER_HOTEL_CLIENT_TOKEN",
            "C_token",
        ),
    )
    better_hotel_breakfast_window_days_forward: int = Field(
        default=7,
        validation_alias=AliasChoices("KAJOVO_API_BETTER_HOTEL_BREAKFAST_WINDOW_DAYS_FORWARD"),
    )
    better_hotel_breakfast_food_codes: str = Field(
        default="1",
        validation_alias=AliasChoices("KAJOVO_API_BETTER_HOTEL_BREAKFAST_FOOD_CODES"),
    )
    better_hotel_request_timeout_seconds: int = Field(
        default=30,
        validation_alias=AliasChoices("KAJOVO_API_BETTER_HOTEL_REQUEST_TIMEOUT_SECONDS"),
    )
    breakfast_runtime_artifact_dir: str = "/app/data/runtime-artifacts"
    device_bootstrap_key: str = ""
    device_challenge_ttl_seconds: int = 300
    device_token_ttl_seconds: int = 86400
    trusted_hosts: list[str] = Field(
        default_factory=lambda: [
            "hotel.hcasc.cz",
            "kajovohotel-staging.hcasc.cz",
            "kajovohotel.local",
            "localhost",
            "127.0.0.1",
        ]
    )
    cors_allow_origins: list[str] = Field(
        default_factory=lambda: [
            "https://hotel.hcasc.cz",
            "https://kajovohotel-staging.hcasc.cz",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )
    session_max_age_seconds: int = 3600
    session_remember_me_max_age_seconds: int = 2592000
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
