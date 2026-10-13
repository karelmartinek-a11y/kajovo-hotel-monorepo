"""Separately versioned host metadata. Scenarios and running jobs remain on SmartPlan."""
import base64
import os
from datetime import datetime

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import Column, Integer, MetaData, String, Table, Text, DateTime, UniqueConstraint, select, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from voice_core_server import VoiceError

from .config import master_key
from .ports import SessionLocal


class SmartPlanBase(DeclarativeBase):
    pass


class SmartPlanSecret(SmartPlanBase):
    __tablename__ = 'dagmar_smartplan_secrets'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ciphertext: Mapped[str] = mapped_column(Text)


class SmartPlanLink(SmartPlanBase):
    __tablename__ = 'dagmar_smartplan_links'
    subject: Mapped[str] = mapped_column(String(128), primary_key=True)
    link_id: Mapped[str] = mapped_column(String(512), unique=True)


class SmartPlanReceipt(SmartPlanBase):
    __tablename__ = 'dagmar_smartplan_receipts'
    __table_args__ = (UniqueConstraint('subject', 'input_event_id'),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    subject: Mapped[str] = mapped_column(String(128), index=True)
    logical_call_id: Mapped[str] = mapped_column(String(128))
    voice_session_id: Mapped[str] = mapped_column(String(64))
    proposal_id: Mapped[str] = mapped_column(String(512))
    fingerprint: Mapped[str] = mapped_column(String(512))
    expected_revision: Mapped[int | None] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(32))
    input_event_id: Mapped[str | None] = mapped_column(String(256))


class SmartPlanDelivery(SmartPlanBase):
    __tablename__ = 'dagmar_smartplan_deliveries'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    subject: Mapped[str] = mapped_column(String(128))
    logical_call_id: Mapped[str] = mapped_column(String(128))
    tool: Mapped[str] = mapped_column(String(64))
    arguments_digest: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(32))
    proposal_id: Mapped[str | None] = mapped_column(String(512))
    request_key: Mapped[str | None] = mapped_column(String(128))


def migrate(connection):
    marker = Table('dagmar_smartplan_schema_version', MetaData(), Column('version', Integer, primary_key=True))
    marker.create(connection, checkfirst=True)
    version = connection.scalar(select(marker.c.version))
    if version not in (None, 1):
        raise RuntimeError('unsupported_dagmar_smartplan_schema')
    SmartPlanBase.metadata.create_all(connection)
    # Nullable additive metadata remains readable by the previous v1 rollback code.
    columns = {item['name'] for item in inspect(connection).get_columns('dagmar_smartplan_deliveries')}
    for name, length in (('proposal_id',512), ('request_key',128)):
        if name not in columns:
            connection.execute(text(f'ALTER TABLE dagmar_smartplan_deliveries ADD COLUMN {name} VARCHAR({length})'))
    if version is None:
        connection.execute(marker.insert().values(version=1))


class SmartPlanSecretStore:
    AAD = b'dagmar:smartplan:SMARTPLAN_VOICE_HOST_TOKEN:v1'

    def save(self, token):
        if not isinstance(token, str) or not 16 <= len(token) <= 512 or any(c.isspace() for c in token):
            raise VoiceError('invalid_smartplan_secret')
        nonce = os.urandom(12)
        cipher = base64.b64encode(nonce + AESGCM(master_key()).encrypt(nonce, token.encode(), self.AAD)).decode()
        with SessionLocal() as db:
            row = db.get(SmartPlanSecret, 1)
            if row is None:
                row = SmartPlanSecret(id=1)
                db.add(row)
            row.ciphertext = cipher
            db.commit()

    def read(self):
        try:
            with SessionLocal() as db:
                row = db.get(SmartPlanSecret, 1)
                if row is None:
                    raise VoiceError('missing_smartplan_secret')
                cipher = base64.b64decode(row.ciphertext, validate=True)
            return AESGCM(master_key()).decrypt(cipher[:12], cipher[12:], self.AAD).decode()
        except VoiceError:
            raise
        except Exception:
            raise VoiceError('smartplan_secret_store_unavailable') from None
