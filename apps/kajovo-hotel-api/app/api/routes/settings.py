from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.schemas import (
    SmtpOperationalStatusRead,
    SmtpSettingsRead,
    SmtpSettingsUpsert,
    SmtpTestEmailRequest,
    SmtpTestEmailResponse,
)
from app.config import get_settings
from app.db.models import PortalSmtpSettings
from app.db.session import get_db
from app.security.rbac import module_access_dependency, require_actor_type
from app.services.mail import (
    MailMessage,
    SmtpSettingsPayload,
    StoredSmtpConfig,
    build_email_service,
    to_read_model,
    to_stored_config,
)

router = APIRouter(
    prefix="/api/v1/admin/settings",
    tags=["settings"],
    dependencies=[Depends(require_actor_type("admin")), Depends(module_access_dependency("settings"))],
)


def _stored_from_record(record: PortalSmtpSettings) -> StoredSmtpConfig:
    return StoredSmtpConfig(
        host=record.host,
        port=record.port,
        username=record.username,
        use_tls=record.use_tls,
        use_ssl=record.use_ssl,
        password_encrypted=record.password_encrypted,
    )


def _delivery_mode(*, smtp_enabled: bool, configured: bool) -> str:
    if not configured:
        return "unconfigured"
    if smtp_enabled:
        return "smtp"
    return "mock"


@router.get("/smtp", response_model=SmtpSettingsRead)
def get_smtp_settings(db: Session = Depends(get_db)) -> SmtpSettingsRead:
    settings = get_settings()
    record = db.get(PortalSmtpSettings, 1)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SMTP settings not configured",
        )
    read_model = to_read_model(_stored_from_record(record), settings.smtp_encryption_key)
    return SmtpSettingsRead(**read_model.__dict__)


@router.get("/smtp/status", response_model=SmtpOperationalStatusRead)
def get_smtp_status(db: Session = Depends(get_db)) -> SmtpOperationalStatusRead:
    settings = get_settings()
    record = db.get(PortalSmtpSettings, 1)
    configured = record is not None
    return SmtpOperationalStatusRead(
        configured=configured,
        smtp_enabled=settings.smtp_enabled,
        delivery_mode=_delivery_mode(smtp_enabled=settings.smtp_enabled, configured=configured),
        can_send_real_email=bool(configured and settings.smtp_enabled),
        last_tested_at=record.last_tested_at if record is not None else None,
        last_test_success=record.last_test_success if record is not None else None,
        last_test_recipient=record.last_test_recipient if record is not None else None,
        last_test_error=record.last_test_error if record is not None else None,
    )


@router.put("/smtp", response_model=SmtpSettingsRead)
def put_smtp_settings(
    payload: SmtpSettingsUpsert,
    db: Session = Depends(get_db),
) -> SmtpSettingsRead:
    settings = get_settings()
    stored = to_stored_config(
        SmtpSettingsPayload(
            host=payload.host,
            port=payload.port,
            username=payload.username,
            password=payload.password,
            use_tls=payload.use_tls,
            use_ssl=payload.use_ssl,
        ),
        settings.smtp_encryption_key,
    )

    record = db.get(PortalSmtpSettings, 1)
    if record is None:
        record = PortalSmtpSettings(id=1)
    record.host = stored.host
    record.port = stored.port
    record.username = stored.username
    record.password_encrypted = stored.password_encrypted
    record.use_tls = stored.use_tls
    record.use_ssl = stored.use_ssl
    db.add(record)
    db.commit()

    read_model = to_read_model(stored, settings.smtp_encryption_key)
    return SmtpSettingsRead(**read_model.__dict__)


@router.post("/smtp/test-email", response_model=SmtpTestEmailResponse)
def test_smtp_email(
    payload: SmtpTestEmailRequest,
    db: Session = Depends(get_db),
) -> SmtpTestEmailResponse:
    settings = get_settings()
    record = db.get(PortalSmtpSettings, 1)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SMTP settings not configured",
        )

    delivery_mode = _delivery_mode(smtp_enabled=settings.smtp_enabled, configured=True)
    try:
        service = build_email_service(settings, _stored_from_record(record))
        service.send(
            MailMessage(
                recipient=payload.recipient,
                subject="KájovoHotel SMTP test",
                body="Toto je testovaci email SMTP konfigurace.",
            )
        )
        record.last_tested_at = datetime.now(timezone.utc)
        record.last_test_success = True
        record.last_test_recipient = payload.recipient
        record.last_test_error = None
        db.add(record)
        db.commit()
    except Exception as exc:
        record.last_tested_at = datetime.now(timezone.utc)
        record.last_test_success = False
        record.last_test_recipient = payload.recipient
        record.last_test_error = str(exc)
        db.add(record)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="SMTP test delivery failed",
        ) from exc

    message = (
        "Testovaci e-mail byl odeslan pres realne SMTP."
        if delivery_mode == "smtp"
        else "Test SMTP probehl v mock rezimu; realny e-mail nebyl odeslan."
    )
    return SmtpTestEmailResponse(ok=True, delivery_mode=delivery_mode, message=message)
