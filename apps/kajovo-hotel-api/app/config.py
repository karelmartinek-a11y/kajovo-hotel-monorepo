from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "KájovoHotel API"
    app_version: str = "0.1.0"
    environment: str = "development"
    database_url: str = "sqlite:///./kajovo_hotel.db"
    admin_email: str = "admin@kajovohotel.local"
    admin_password: str = "admin123"
    smtp_enabled: bool = False
    smtp_from_email: str = "noreply@kajovohotel.local"
    smtp_encryption_key: str = "dev-only-smtp-key-change-in-production"
    media_root: str = "/app/data/media"
    breakfast_scheduler_enabled: bool = False
    breakfast_scheduler_interval_seconds: int = 300
    breakfast_imap_host: str = ""
    breakfast_imap_port: int = 993
    breakfast_imap_use_ssl: bool = True
    breakfast_imap_mailbox: str = "INBOX"
    breakfast_imap_username: str = ""
    breakfast_imap_password: str = ""
    breakfast_imap_from_contains: str = "better-hotel.com"
    breakfast_imap_subject_contains: str = "přehled stravy"

    model_config = SettingsConfigDict(env_prefix="KAJOVO_API_")


@lru_cache
def get_settings() -> Settings:
    return Settings()
