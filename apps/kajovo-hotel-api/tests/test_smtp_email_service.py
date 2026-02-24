from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.routes.auth import HintRequest, admin_hint
from app.api.routes.settings import SmtpTestEmailRequest
from app.api.routes.settings import test_smtp_email as send_test_email
from app.api.routes.users import create_user
from app.api.schemas import PortalUserCreate
from app.config import get_settings
from app.db.models import Base, PortalSmtpSettings
from app.services.mail import MockSmtpTransport, SmtpEmailService, StoredSmtpConfig


def test_hint_test_email_and_onboarding_use_single_email_service(monkeypatch, tmp_path):
    db_path = tmp_path / "smtp-service.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)

    monkeypatch.setenv("KAJOVO_API_SMTP_ENABLED", "true")
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

        admin_hint(HintRequest(email="admin@kajovohotel.local"), db=db)
        send_test_email(SmtpTestEmailRequest(recipient="admin@kajovohotel.local"), db=db)
        create_user(
            PortalUserCreate(
                first_name="New",
                last_name="User",
                email="new.user@example.com",
                roles=["recepce"],
                password="new-user-pass",
            ),
            db=db,
        )

    assert [message.subject for message in transport.sent_messages] == [
        "KájovoHotel admin unlock",
        "KájovoHotel SMTP test",
        "KájovoHotel onboarding",
    ]
