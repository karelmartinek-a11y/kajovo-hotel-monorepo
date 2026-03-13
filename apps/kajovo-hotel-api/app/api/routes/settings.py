import logging
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import inspect, text
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

logger = logging.getLogger("kajovo.api.smtp")


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


def _default_smtp_settings_read() -> SmtpSettingsRead:
    return SmtpSettingsRead(
        host="",
        port=587,
        username="",
        use_tls=True,
        use_ssl=False,
        password_masked="",
    )


def _safe_load_smtp_row(db: Session) -> dict[str, object] | None:
    bind = db.get_bind()
    inspector = inspect(bind)
    try:
        columns = {str(column["name"]) for column in inspector.get_columns("portal_smtp_settings")}
    except Exception:
        logger.exception("smtp.settings.inspect_failed")
        return None

    if not columns:
        return None

    wanted_columns = [
        "id",
        "host",
        "port",
        "username",
        "password_encrypted",
        "use_tls",
        "use_ssl",
        "last_tested_at",
        "last_test_success",
        "last_test_recipient",
        "last_test_error",
    ]
    selected_columns = [column for column in wanted_columns if column in columns]
    if not selected_columns:
        return None

    where_clause = "WHERE id = :id" if "id" in columns else "LIMIT 1"
    query = text(f"SELECT {', '.join(selected_columns)} FROM portal_smtp_settings {where_clause}")
    params = {"id": 1} if "id" in columns else {}
    row = db.execute(query, params).mappings().first()
    return dict(row) if row is not None else None


def _safe_load_smtp_record(db: Session) -> PortalSmtpSettings | None:
    try:
        return db.get(PortalSmtpSettings, 1)
    except Exception:
        logger.exception("smtp.settings.orm_load_failed")
        db.rollback()
        return None


def _persist_smtp_test_result(
    db: Session,
    record: PortalSmtpSettings,
    *,
    recipient: str,
    success: bool,
    error: str | None,
) -> None:
    record.last_tested_at = datetime.now(timezone.utc)
    record.last_test_success = success
    record.last_test_recipient = recipient
    record.last_test_error = error
    db.add(record)
    db.commit()


def _fallback_smtp_settings_read(record: PortalSmtpSettings | None) -> SmtpSettingsRead:
    if record is None:
        return _default_smtp_settings_read()

    try:
        port = int(record.port) if record.port is not None else 587
    except (TypeError, ValueError):
        port = 587

    return SmtpSettingsRead(
        host=(record.host or "").strip(),
        port=port,
        username=(record.username or "").strip(),
        use_tls=True if record.use_tls is None else bool(record.use_tls),
        use_ssl=False if record.use_ssl is None else bool(record.use_ssl),
        password_masked="",
    )


@router.get("/smtp", response_model=SmtpSettingsRead)
def get_smtp_settings(db: Session = Depends(get_db)) -> SmtpSettingsRead:
    settings = get_settings()
    row = _safe_load_smtp_row(db)
    if row is None:
        return _default_smtp_settings_read()
    try:
        stored = StoredSmtpConfig(
            host=str(row.get("host") or ""),
            port=int(row.get("port") or 587),
            username=str(row.get("username") or ""),
            use_tls=bool(True if row.get("use_tls") is None else row.get("use_tls")),
            use_ssl=bool(False if row.get("use_ssl") is None else row.get("use_ssl")),
            password_encrypted=str(row.get("password_encrypted") or ""),
        )
        read_model = to_read_model(stored, settings.smtp_encryption_key)
        return SmtpSettingsRead(**read_model.__dict__)
    except Exception:
        # Keep the form editable even if the stored secret or legacy row is malformed.
        return _fallback_smtp_settings_read(SimpleNamespace(**row))


@router.get("/smtp/status", response_model=SmtpOperationalStatusRead)
def get_smtp_status(db: Session = Depends(get_db)) -> SmtpOperationalStatusRead:
    settings = get_settings()
    row = _safe_load_smtp_row(db)
    configured = row is not None
    last_tested_at = row.get("last_tested_at") if isinstance(row, dict) else None
    if not isinstance(last_tested_at, datetime):
        last_tested_at = None
    return SmtpOperationalStatusRead(
        configured=configured,
        smtp_enabled=settings.smtp_enabled,
        delivery_mode=_delivery_mode(smtp_enabled=settings.smtp_enabled, configured=configured),
        can_send_real_email=bool(configured and settings.smtp_enabled),
        last_tested_at=last_tested_at,
        last_test_success=bool(row["last_test_success"]) if isinstance(row, dict) and row.get("last_test_success") is not None else None,
        last_test_recipient=str(row["last_test_recipient"]) if isinstance(row, dict) and row.get("last_test_recipient") is not None else None,
        last_test_error=str(row["last_test_error"]) if isinstance(row, dict) and row.get("last_test_error") is not None else None,
    )


@router.put("/smtp", response_model=SmtpSettingsRead)
def put_smtp_settings(
    payload: SmtpSettingsUpsert,
    db: Session = Depends(get_db),
) -> SmtpSettingsRead:
    settings = get_settings()
    record = db.get(PortalSmtpSettings, 1)
    password = (payload.password or "").strip()
    if record is None and not password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="SMTP password is required for new configuration",
        )
    if record is None:
        stored = to_stored_config(
            SmtpSettingsPayload(
                host=payload.host,
                port=payload.port,
                username=payload.username,
                password=password,
                use_tls=payload.use_tls,
                use_ssl=payload.use_ssl,
            ),
            settings.smtp_encryption_key,
        )
    else:
        password_encrypted = record.password_encrypted
        if password:
            password_encrypted = to_stored_config(
                SmtpSettingsPayload(
                    host=payload.host,
                    port=payload.port,
                    username=payload.username,
                    password=password,
                    use_tls=payload.use_tls,
                    use_ssl=payload.use_ssl,
                ),
                settings.smtp_encryption_key,
            ).password_encrypted
        stored = StoredSmtpConfig(
            host=payload.host.strip(),
            port=payload.port,
            username=payload.username.strip(),
            use_tls=payload.use_tls,
            use_ssl=payload.use_ssl,
            password_encrypted=password_encrypted,
        )

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
    row = _safe_load_smtp_row(db)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SMTP settings not configured",
        )

    delivery_mode = _delivery_mode(smtp_enabled=settings.smtp_enabled, configured=True)
    stored = StoredSmtpConfig(
        host=str(row.get("host") or ""),
        port=int(row.get("port") or 587),
        username=str(row.get("username") or ""),
        use_tls=bool(True if row.get("use_tls") is None else row.get("use_tls")),
        use_ssl=bool(False if row.get("use_ssl") is None else row.get("use_ssl")),
        password_encrypted=str(row.get("password_encrypted") or ""),
    )
    try:
        service = build_email_service(settings, stored)
        service.send(
            MailMessage(
                recipient=payload.recipient,
                subject="KájovoHotel SMTP test",
                body="Toto je testovaci email SMTP konfigurace.",
            )
        )
        record = _safe_load_smtp_record(db)
        if record is None:
            logger.warning("smtp.test_email.skip_persist_success")
        else:
            try:
                _persist_smtp_test_result(
                    db,
                    record,
                    recipient=payload.recipient,
                    success=True,
                    error=None,
                )
            except Exception:
                db.rollback()
                logger.exception("smtp.test_email.persist_success_failed")
    except Exception as exc:
        record = _safe_load_smtp_record(db)
        if record is None:
            logger.warning("smtp.test_email.skip_persist_failure")
        else:
            try:
                _persist_smtp_test_result(
                    db,
                    record,
                    recipient=payload.recipient,
                    success=False,
                    error=str(exc),
                )
            except Exception:
                db.rollback()
                logger.exception("smtp.test_email.persist_failure_failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"SMTP test delivery failed: {exc}",
        ) from exc

    message = (
        "Testovaci e-mail byl odeslan pres realne SMTP."
        if delivery_mode == "smtp"
        else "Test SMTP probehl v mock rezimu; realny e-mail nebyl odeslan."
    )
    return SmtpTestEmailResponse(ok=True, delivery_mode=delivery_mode, message=message)
