import smtplib
import ssl
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes.auth import HintRequest, admin_hint, hash_password
from app.api.routes.settings import (
    SmtpTestEmailRequest,
    _compat_smtp_settings_read,
    get_smtp_settings,
    get_smtp_status,
    put_smtp_settings,
)
from app.api.routes.settings import test_smtp_email as send_test_email
from app.api.routes.users import create_user
from app.api.schemas import PortalUserCreate, SmtpSettingsUpsert
from app.config import get_settings
from app.db.models import Base, PortalSmtpSettings, PortalUser, PortalUserRole
from app.services.mail import (
    MockSmtpTransport,
    SmtpDeliveryError,
    SmtpEmailService,
    StoredSmtpConfig,
    build_email_service,
)


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
                from_email="mailer@example.com",
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
                sender="mailer@example.com",
                smtp_config=StoredSmtpConfig(
                    from_email="mailer@example.com",
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
        create_user(
            PortalUserCreate(
                email="new.user@example.com",
                password="new-user-pass",
                roles=["recepce"],
            ),
            db=db,
        )
        status = get_smtp_status(db=db)

    assert [message.subject for message in transport.sent_messages] == [
        "KájovoHotel připomenutí admin hesla",
        "KájovoHotel SMTP test",
        "KájovoHotel onboarding",
    ]
    assert response.delivery_mode == "smtp"
    assert status.configured is True
    assert status.smtp_enabled is True
    assert status.can_send_real_email is True
    assert status.last_test_connected is True
    assert status.last_test_send_attempted is True
    assert status.last_test_success is True
    assert status.last_test_recipient == admin_email


def test_get_smtp_settings_returns_blank_defaults_when_unconfigured(tmp_path):
    db_path = tmp_path / "smtp-empty.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
      settings = get_smtp_settings(db=db)

    assert settings.host == ""
    assert settings.from_email == ""
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
                from_email="noreply@example.com",
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
                from_email="noreply-updated@example.com",
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
    assert updated.from_email == "noreply-updated@example.com"
    assert updated.host == "smtp.changed.local"
    assert updated.port == 2525
    assert updated.username == "mailer-updated"
    assert updated.use_tls is False
    assert updated.use_ssl is True
    assert updated.password_masked == initial.password_masked
    assert stored is not None


def test_compat_smtp_settings_read_tolerates_malformed_legacy_record():
    record = SimpleNamespace(
        host=None,
        from_email=None,
        port="not-a-number",
        username=None,
        use_tls=None,
        use_ssl=None,
    )

    fallback = _compat_smtp_settings_read(record)

    assert fallback.host == ""
    assert fallback.from_email == ""
    assert fallback.port == 587
    assert fallback.username == ""
    assert fallback.use_tls is True
    assert fallback.use_ssl is False
    assert fallback.password_masked == ""


def test_put_smtp_settings_rejects_conflicting_tls_and_ssl(tmp_path):
    db_path = tmp_path / "smtp-conflict.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
        with pytest.raises(Exception) as exc_info:
            put_smtp_settings(
                SmtpSettingsUpsert(
                    from_email="conflict@example.com",
                    host="smtp.conflict.local",
                    port=587,
                    username="mailer",
                    password="secret",
                    use_tls=True,
                    use_ssl=True,
                ),
                db=db,
            )

    exc = exc_info.value
    assert getattr(exc, "status_code", None) == 422
    assert "TLS i SSL" in str(getattr(exc, "detail", exc))


def test_put_smtp_settings_rejects_port_465_without_ssl(tmp_path):
    db_path = tmp_path / "smtp-port-465.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
        with pytest.raises(Exception) as exc_info:
            put_smtp_settings(
                SmtpSettingsUpsert(
                    from_email="port465@example.com",
                    host="smtp.port465.local",
                    port=465,
                    username="mailer",
                    password="secret",
                    use_tls=True,
                    use_ssl=False,
                ),
                db=db,
            )

    exc = exc_info.value
    assert getattr(exc, "status_code", None) == 422
    assert "Port 465" in str(getattr(exc, "detail", exc))


def test_smtp_service_rewrites_wrong_version_number_to_actionable_hint(monkeypatch):
    settings = get_settings()
    service = SmtpEmailService(
        sender="mailer@example.com",
        smtp_config=StoredSmtpConfig(
            from_email="mailer@example.com",
            host="smtp.local",
            port=587,
            username="mailer",
            password_encrypted="ZW5jcnlwdGVkIiL4fQ6q-XcJQqcvTYw9rM1tm6fRMwVlk4hzU1Gk",
            use_tls=False,
            use_ssl=True,
        ),
        encryption_key=settings.smtp_encryption_key,
    )

    class FailingSslClient:
        def __enter__(self):
            raise ssl.SSLError("[SSL: WRONG_VERSION_NUMBER] wrong version number (_ssl.c:1006)")

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(smtplib, "SMTP_SSL", lambda *args, **kwargs: FailingSslClient())
    with pytest.raises(SmtpDeliveryError) as exc_info:
        service.send(
            SimpleNamespace(
                recipient="admin@example.com",
                subject="subject",
                body="body",
            )
        )

    assert "Vypnete SSL a zapnete TLS" in str(exc_info.value)


def test_send_test_email_returns_502_even_when_status_persist_fails(monkeypatch, tmp_path):
    db_path = tmp_path / "smtp-persist-failure.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)

    monkeypatch.setenv("KAJOVO_API_SMTP_ENABLED", "true")
    get_settings.cache_clear()

    with Session(engine) as db:
        db.add(
            PortalSmtpSettings(
                id=1,
                from_email="mailer@example.com",
                host="smtp.local",
                port=1025,
                username="mailer",
                password_encrypted="bad",
                use_tls=False,
                use_ssl=False,
            )
        )
        db.commit()

        original_commit = db.commit
        commit_calls = 0

        def flaky_commit() -> None:
            nonlocal commit_calls
            commit_calls += 1
            raise RuntimeError("persist unavailable")

        db.commit = flaky_commit  # type: ignore[method-assign]

        with pytest.raises(Exception) as exc_info:
            send_test_email(SmtpTestEmailRequest(recipient="admin@example.com"), db=db)

        db.commit = original_commit  # type: ignore[method-assign]

    exc = exc_info.value
    assert getattr(exc, "status_code", None) == 502
    assert "SMTP test delivery failed" in str(getattr(exc, "detail", exc))
    assert commit_calls == 1


def test_smtp_settings_routes_tolerate_legacy_table_without_status_columns(tmp_path):
    db_path = tmp_path / "smtp-legacy.db"
    engine = create_engine(f"sqlite:///{db_path}")

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE portal_smtp_settings (
              id INTEGER PRIMARY KEY,
              from_email VARCHAR(255),
              host VARCHAR(255) NOT NULL,
              port INTEGER NOT NULL,
              username VARCHAR(255) NOT NULL,
              password_encrypted TEXT NOT NULL,
              use_tls BOOLEAN NOT NULL,
              use_ssl BOOLEAN NOT NULL
            )
        """))
        conn.execute(
            text("""
                INSERT INTO portal_smtp_settings
                  (id, from_email, host, port, username, password_encrypted, use_tls, use_ssl)
                VALUES
                  (1, NULL, 'smtp.legacy.local', 587, 'mailer', 'bad', 1, 0)
            """)
        )

    with Session(engine) as db:
        settings = get_smtp_settings(db=db)
        status = get_smtp_status(db=db)

    assert settings.host == "smtp.legacy.local"
    assert settings.from_email == ""
    assert settings.port == 587
    assert settings.username == "mailer"
    assert status.configured is True
    assert status.last_test_connected is None
    assert status.last_test_send_attempted is None
    assert status.last_tested_at is None
    assert status.last_test_success is None
    assert status.last_test_recipient is None
    assert status.last_test_error is None


def test_send_test_email_persists_partial_delivery_flags(monkeypatch, tmp_path):
    db_path = tmp_path / "smtp-partial-flags.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)

    monkeypatch.setenv("KAJOVO_API_SMTP_ENABLED", "true")
    get_settings.cache_clear()

    class FailingService:
        def send(self, _message):
            raise SmtpDeliveryError(
                "simulated login failure",
                connected=True,
                send_attempted=False,
            )

    with Session(engine) as db:
        db.add(
            PortalSmtpSettings(
                id=1,
                from_email="mailer@example.com",
                host="smtp.local",
                port=1025,
                username="mailer",
                password_encrypted="bad",
                use_tls=False,
                use_ssl=False,
            )
        )
        db.commit()

        monkeypatch.setattr("app.api.routes.settings.build_email_service", lambda *_args, **_kwargs: FailingService())

        with pytest.raises(Exception) as exc_info:
            send_test_email(SmtpTestEmailRequest(recipient="admin@example.com"), db=db)

        status = get_smtp_status(db=db)

    exc = exc_info.value
    assert getattr(exc, "status_code", None) == 502
    assert status.last_test_connected is True
    assert status.last_test_send_attempted is False
    assert status.last_test_success is False


def test_smtp_test_email_tolerates_legacy_table_without_status_columns(monkeypatch, tmp_path):
    db_path = tmp_path / "smtp-legacy-test-email.db"
    engine = create_engine(f"sqlite:///{db_path}")

    monkeypatch.setenv("KAJOVO_API_SMTP_ENABLED", "false")
    get_settings.cache_clear()

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE portal_smtp_settings (
              id INTEGER PRIMARY KEY,
              from_email VARCHAR(255),
              host VARCHAR(255) NOT NULL,
              port INTEGER NOT NULL,
              username VARCHAR(255) NOT NULL,
              password_encrypted TEXT NOT NULL,
              use_tls BOOLEAN NOT NULL,
              use_ssl BOOLEAN NOT NULL
            )
        """))
        conn.execute(
            text("""
                INSERT INTO portal_smtp_settings
                  (id, from_email, host, port, username, password_encrypted, use_tls, use_ssl)
                VALUES
                  (1, NULL, 'smtp.legacy.local', 587, 'mailer', 'bad', 1, 0)
            """)
        )

    with Session(engine) as db:
        with pytest.raises(Exception) as exc_info:
            send_test_email(SmtpTestEmailRequest(recipient="admin@example.com"), db=db)

    exc = exc_info.value
    assert getattr(exc, "status_code", None) == 503


def test_put_smtp_settings_tolerates_legacy_table_without_status_columns(tmp_path):
    db_path = tmp_path / "smtp-legacy-put.db"
    engine = create_engine(f"sqlite:///{db_path}")

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE portal_smtp_settings (
              id INTEGER PRIMARY KEY,
              from_email VARCHAR(255),
              host VARCHAR(255) NOT NULL,
              port INTEGER NOT NULL,
              username VARCHAR(255) NOT NULL,
              password_encrypted TEXT NOT NULL,
              use_tls BOOLEAN NOT NULL,
              use_ssl BOOLEAN NOT NULL
            )
        """))
        conn.execute(
            text("""
                INSERT INTO portal_smtp_settings
                  (id, from_email, host, port, username, password_encrypted, use_tls, use_ssl)
                VALUES
                  (1, NULL, 'smtp.legacy.local', 587, 'mailer', 'legacy-secret', 1, 0)
            """)
        )

    with Session(engine) as db:
        updated = put_smtp_settings(
            SmtpSettingsUpsert(
                from_email="legacy-updated@example.com",
                host="smtp.updated.local",
                port=2525,
                username="mailer-updated",
                password=None,
                use_tls=False,
                use_ssl=True,
            ),
            db=db,
        )
        stored_row = db.execute(
            text("""
                SELECT host, port, username, password_encrypted, use_tls, use_ssl
                FROM portal_smtp_settings
                WHERE id = 1
            """)
        ).mappings().first()

    assert updated.from_email == "legacy-updated@example.com"
    assert updated.host == "smtp.updated.local"
    assert updated.port == 2525
    assert updated.username == "mailer-updated"
    assert updated.use_tls is False
    assert updated.use_ssl is True
    assert stored_row is not None
    assert stored_row["host"] == "smtp.updated.local"
    assert stored_row["port"] == 2525
    assert stored_row["username"] == "mailer-updated"
    assert stored_row["password_encrypted"] == "legacy-secret"
    assert bool(stored_row["use_tls"]) is False
    assert bool(stored_row["use_ssl"]) is True


def test_build_email_service_prefers_stored_from_email(monkeypatch):
    monkeypatch.setenv("KAJOVO_API_SMTP_ENABLED", "true")
    monkeypatch.setenv("KAJOVO_API_SMTP_FROM_EMAIL", "noreply@kajovohotel.local")
    get_settings.cache_clear()
    settings = get_settings()

    service = build_email_service(
        settings,
        StoredSmtpConfig(
            from_email="real-sender@example.com",
            host="smtp.local",
            port=587,
            username="mailer",
            password_encrypted="ZW5jcnlwdGVkIiL4fQ6q-XcJQqcvTYw9rM1tm6fRMwVlk4hzU1Gk",
            use_tls=True,
            use_ssl=False,
        ),
    )

    assert isinstance(service, SmtpEmailService)
    assert service.sender == "real-sender@example.com"


def test_build_email_service_falls_back_to_username_when_sender_missing(monkeypatch):
    monkeypatch.setenv("KAJOVO_API_SMTP_ENABLED", "true")
    monkeypatch.setenv("KAJOVO_API_SMTP_FROM_EMAIL", "noreply@kajovohotel.local")
    get_settings.cache_clear()
    settings = get_settings()

    service = build_email_service(
        settings,
        StoredSmtpConfig(
            from_email="",
            host="smtp.local",
            port=587,
            username="mailer@example.com",
            password_encrypted="ZW5jcnlwdGVkIiL4fQ6q-XcJQqcvTYw9rM1tm6fRMwVlk4hzU1Gk",
            use_tls=True,
            use_ssl=False,
        ),
    )

    assert isinstance(service, SmtpEmailService)
    assert service.sender == "mailer@example.com"
