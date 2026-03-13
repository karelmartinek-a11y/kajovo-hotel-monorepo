from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.routes.auth import HintRequest, admin_hint, hash_password
from app.api.routes.settings import (
    SmtpTestEmailRequest,
    _fallback_smtp_settings_read,
    get_smtp_settings,
    get_smtp_status,
    put_smtp_settings,
)
from app.api.routes.settings import test_smtp_email as send_test_email
from app.api.routes.users import create_user
from app.api.schemas import PortalUserCreate, SmtpSettingsUpsert
from app.config import get_settings
from app.db.models import Base, PortalSmtpSettings, PortalUser, PortalUserRole
from app.services.mail import MockSmtpTransport, SmtpEmailService, StoredSmtpConfig


def test_hint_test_email_and_onboarding_use_single_email_service(monkeypatch, tmp_path):
    admin_email = "admin@kajovohotel.local"
    admin_password = "admin123"
    db_path = tmp_path / "smtp-service.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)

    monkeypatch.setenv("KAJOVO_API_SMTP_ENABLED", "true")
    monkeypatch.setenv("KAJOVO_API_ADMIN_EMAIL", admin_email)
    monkeypatch.setenv("KAJOVO_API_ADMIN_PASSWORD", admin_password)
    get_settings.cache_clear()

    with Session(engine) as db:
        db.add(
            PortalSmtpSettings(
                id=1,
                host="smtp.local",
                port=1025,
                username="mailer",
                password_encrypted="ZW5jcnlwdGVkIiL4fQ6q-XcJQqcvTYw9rM1tm6fRMwVlk4hzU1Gk",
                use_tls=False,
                use_ssl=False,
            )
        )
        db.add(
            PortalUser(
                    first_name="Admin",
                    last_name="User",
                    email=admin_email,
                    password_hash=hash_password(admin_password),
                    is_active=True,
                    roles=[PortalUserRole(role="admin")],
                )
        )
        db.commit()

        transport = MockSmtpTransport()

        def _service_factory(*_args, **_kwargs):
            settings = get_settings()
            return SmtpEmailService(
                sender=settings.smtp_from_email,
                smtp_config=StoredSmtpConfig(
                    host="smtp.local",
                    port=1025,
                    username="mailer",
                    password_encrypted="ZW5jcnlwdGVkIiL4fQ6q-XcJQqcvTYw9rM1tm6fRMwVlk4hzU1Gk",
                    use_tls=False,
                    use_ssl=False,
                ),
                encryption_key=settings.smtp_encryption_key,
                transport=transport,
            )

        monkeypatch.setattr("app.api.routes.auth.build_email_service", _service_factory)
        monkeypatch.setattr("app.api.routes.users.build_email_service", _service_factory)
        monkeypatch.setattr("app.api.routes.settings.build_email_service", _service_factory)

        admin_hint(
            HintRequest(email=admin_email),
            request=SimpleNamespace(base_url="https://hotel.test/"),
            db=db,
        )
        response = send_test_email(SmtpTestEmailRequest(recipient=admin_email), db=db)
        create_user(PortalUserCreate(email="new.user@example.com", password="new-user-pass"), db=db)
        status = get_smtp_status(db=db)

    assert [message.subject for message in transport.sent_messages] == [
        "KájovoHotel odblokování admin účtu",
        "KájovoHotel SMTP test",
        "KájovoHotel onboarding",
    ]
    assert response.delivery_mode == "smtp"
    assert status.configured is True
    assert status.smtp_enabled is True
    assert status.can_send_real_email is True
    assert status.last_test_success is True
    assert status.last_test_recipient == admin_email


def test_get_smtp_settings_returns_blank_defaults_when_unconfigured(tmp_path):
    db_path = tmp_path / "smtp-empty.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
      settings = get_smtp_settings(db=db)

    assert settings.host == ""
    assert settings.port == 587
    assert settings.username == ""
    assert settings.use_tls is True
    assert settings.use_ssl is False
    assert settings.password_masked == ""


def test_put_smtp_settings_preserves_existing_password_when_blank(tmp_path):
    db_path = tmp_path / "smtp-preserve.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
        initial = put_smtp_settings(
            SmtpSettingsUpsert(
                host="smtp.initial.local",
                port=587,
                username="mailer",
                password="InitialSecret123",
                use_tls=True,
                use_ssl=False,
            ),
            db=db,
        )
        updated = put_smtp_settings(
            SmtpSettingsUpsert(
                host="smtp.changed.local",
                port=2525,
                username="mailer-updated",
                password=None,
                use_tls=False,
                use_ssl=True,
            ),
            db=db,
        )
        stored = db.get(PortalSmtpSettings, 1)

    assert initial.password_masked
    assert updated.host == "smtp.changed.local"
    assert updated.port == 2525
    assert updated.username == "mailer-updated"
    assert updated.use_tls is False
    assert updated.use_ssl is True
    assert updated.password_masked == initial.password_masked
    assert stored is not None


def test_fallback_smtp_settings_read_tolerates_malformed_legacy_record():
    record = SimpleNamespace(
        host=None,
        port="not-a-number",
        username=None,
        use_tls=None,
        use_ssl=None,
    )

    fallback = _fallback_smtp_settings_read(record)

    assert fallback.host == ""
    assert fallback.port == 587
    assert fallback.username == ""
    assert fallback.use_tls is True
    assert fallback.use_ssl is False
    assert fallback.password_masked == ""
