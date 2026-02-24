from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "KájovoHotel API"
    app_version: str = "0.1.0"
    environment: str = "development"
    database_url: str = "sqlite:///./kajovo_hotel.db"
    admin_email: str = "admin@kajovohotel.local"
    admin_password: str = "admin123"
    admin_password_hint: str = "default admin password for CI"
    smtp_enabled: bool = False
    smtp_from_email: str = "noreply@kajovohotel.local"
    smtp_encryption_key: str = "dev-only-smtp-key-change-in-production"

    model_config = SettingsConfigDict(env_prefix="KAJOVO_API_")


@lru_cache
def get_settings() -> Settings:
    return Settings()
