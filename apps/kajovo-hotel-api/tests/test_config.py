from app.config import Settings


def test_admin_password_can_be_loaded_from_legacy_hotel_env_var(monkeypatch) -> None:
    monkeypatch.delenv("KAJOVO_API_ADMIN_PASSWORD", raising=False)
    monkeypatch.setenv("HOTEL_ADMIN_PASSWORD", "super-secret")

    settings = Settings()

    assert settings.admin_password == "super-secret"


def test_admin_email_can_be_loaded_from_legacy_hotel_env_var(monkeypatch) -> None:
    monkeypatch.delenv("KAJOVO_API_ADMIN_EMAIL", raising=False)
    monkeypatch.setenv("HOTEL_ADMIN_EMAIL", "admin@hotel.hcasc.cz")

    settings = Settings()

    assert settings.admin_email == "admin@hotel.hcasc.cz"


def test_device_bootstrap_key_requires_explicit_configuration(monkeypatch) -> None:
    monkeypatch.delenv("KAJOVO_API_DEVICE_BOOTSTRAP_KEY", raising=False)

    settings = Settings()

    assert settings.device_bootstrap_key == ""
