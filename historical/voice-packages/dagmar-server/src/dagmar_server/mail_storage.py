"""Additive, separately versioned Mail metadata; no plaintext mail persistence."""
import base64
import os
from datetime import datetime, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import Column, Integer, MetaData, String, Table, Text, DateTime, UniqueConstraint, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from voice_core_server import VoiceError

from .config import master_key
from .ports import SessionLocal


class MailBase(DeclarativeBase):
    pass


class MailSecrets(MailBase):
    __tablename__ = "dagmar_mail_secrets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mcp_ciphertext: Mapped[str] = mapped_column(Text)
    approval_ciphertext: Mapped[str] = mapped_column(Text)


class MailReceipt(MailBase):
    __tablename__ = "dagmar_mail_receipts"
    __table_args__ = (UniqueConstraint("owner", "logical_call_id", "audio_event_id"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner: Mapped[str] = mapped_column(String(128), index=True)
    logical_call_id: Mapped[str] = mapped_column(String(128))
    voice_session_id: Mapped[str] = mapped_column(String(64))
    audio_event_id: Mapped[str] = mapped_column(String(256))
    approval_request_id: Mapped[str] = mapped_column(String(128), unique=True)
    send_request_id: Mapped[str] = mapped_column(String(128))
    content_hash: Mapped[str] = mapped_column(String(128))
    draft_version: Mapped[int] = mapped_column(Integer)
    idempotency_key: Mapped[str] = mapped_column(String(128))
    state: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class MailOperation(MailBase):
    __tablename__ = "dagmar_mail_operations"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner: Mapped[str] = mapped_column(String(128), index=True)
    logical_call_id: Mapped[str] = mapped_column(String(128))
    provider_item_id: Mapped[str] = mapped_column(String(128))
    tool_name: Mapped[str] = mapped_column(String(64))
    arguments_digest: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(32))
    send_request_id: Mapped[str | None] = mapped_column(String(128))
    idempotency_key: Mapped[str | None] = mapped_column(String(128))


def migrate(connection):
    marker = Table("dagmar_mail_schema_version", MetaData(), Column("version", Integer, primary_key=True))
    marker.create(connection, checkfirst=True)
    version = connection.scalar(select(marker.c.version))
    if version not in (None, 1):
        raise RuntimeError("unsupported_dagmar_mail_schema")
    MailBase.metadata.create_all(connection)
    if version is None:
        connection.execute(marker.insert().values(version=1))


class MailSecretStore:
    @staticmethod
    def aad(kind):
        return ("dagmar:mail:" + kind + ":v1").encode()

    def save(self, mcp_token, approval_token):
        if not all(isinstance(v, str) and 8 <= len(v) <= 512 and not any(c.isspace() for c in v) for v in (mcp_token, approval_token)) or mcp_token == approval_token:
            raise VoiceError("invalid_mail_secret")
        key = master_key()
        def encrypt(kind, value):
            nonce = os.urandom(12)
            return base64.b64encode(nonce + AESGCM(key).encrypt(nonce, value.encode(), self.aad(kind))).decode()
        with SessionLocal() as db:
            row = db.get(MailSecrets, 1)
            if row is None:
                row = MailSecrets(id=1)
                db.add(row)
            row.mcp_ciphertext = encrypt("mcp", mcp_token)
            row.approval_ciphertext = encrypt("approval", approval_token)
            db.commit()

    def read(self):
        try:
            with SessionLocal() as db:
                row = db.get(MailSecrets, 1)
                if row is None:
                    raise VoiceError("missing_mail_secrets")
                values = (row.mcp_ciphertext, row.approval_ciphertext)
            key = master_key()
            result = []
            for kind, cipher in zip(("mcp", "approval"), values):
                payload = base64.b64decode(cipher, validate=True)
                result.append(AESGCM(key).decrypt(payload[:12], payload[12:], self.aad(kind)).decode())
            return tuple(result)
        except VoiceError:
            raise
        except Exception:
            raise VoiceError("mail_secret_store_unavailable") from None
