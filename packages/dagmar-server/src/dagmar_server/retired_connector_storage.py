"""Retired connector metadata retained solely for non-destructive schema compatibility."""
from datetime import datetime

from sqlalchemy import Column, Integer, MetaData, String, Table, Text, DateTime, UniqueConstraint, select, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column



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

    correlation_id: Mapped[str | None] = mapped_column(String(512))
    operation_id: Mapped[str | None] = mapped_column(String(512))
    # Null means legacy unknown; no migration invents evidence.
    transport_state: Mapped[str | None] = mapped_column(String(32))
    voice_session_id: Mapped[str | None] = mapped_column(String(64))
    input_event_id: Mapped[str | None] = mapped_column(String(256))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SmartPlanAuthorization(SmartPlanBase):
    __tablename__ = 'dagmar_smartplan_authorizations'
    __table_args__ = (UniqueConstraint('receipt_id', 'input_event_id'),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    receipt_id: Mapped[str] = mapped_column(String(64), index=True)
    subject: Mapped[str] = mapped_column(String(128))
    logical_call_id: Mapped[str] = mapped_column(String(128))
    voice_session_id: Mapped[str] = mapped_column(String(64))
    fingerprint: Mapped[str] = mapped_column(String(512))
    input_event_id: Mapped[str | None] = mapped_column(String(256))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(32))
    confirm_transport: Mapped[str] = mapped_column(String(32))
    commit_transport: Mapped[str] = mapped_column(String(32))


def migrate(connection):
    marker = Table('dagmar_smartplan_schema_version', MetaData(), Column('version', Integer, primary_key=True))
    marker.create(connection, checkfirst=True)
    version = connection.scalar(select(marker.c.version))
    if version not in (None, 1):
        raise RuntimeError('unsupported_dagmar_smartplan_schema')
    SmartPlanBase.metadata.create_all(connection)
    # Nullable additive metadata remains readable by the previous v1 rollback code.
    columns = {item['name'] for item in inspect(connection).get_columns('dagmar_smartplan_deliveries')}
    for name, length in (('proposal_id',512), ('request_key',128), ('transport_state',32), ('voice_session_id',64), ('input_event_id',256), ('correlation_id',512), ('operation_id',512)):
        if name not in columns:
            connection.execute(text(f'ALTER TABLE dagmar_smartplan_deliveries ADD COLUMN {name} VARCHAR({length})'))
    if 'created_at' not in columns:
        timestamp_type = DateTime(timezone=True).compile(dialect=connection.dialect)
        connection.execute(text(f'ALTER TABLE dagmar_smartplan_deliveries ADD COLUMN created_at {timestamp_type}'))
    if version is None:
        connection.execute(marker.insert().values(version=1))
