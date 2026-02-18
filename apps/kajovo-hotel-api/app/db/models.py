from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Date, DateTime, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BreakfastStatus(StrEnum):
    PENDING = "pending"
    PREPARING = "preparing"
    SERVED = "served"
    CANCELLED = "cancelled"


class BreakfastOrder(Base):
    __tablename__ = "breakfast_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    service_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    room_number: Mapped[str] = mapped_column(String(32), nullable=False)
    guest_name: Mapped[str] = mapped_column(String(255), nullable=False)
    guest_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=BreakfastStatus.PENDING.value
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class LostFoundItemType(StrEnum):
    LOST = "lost"
    FOUND = "found"


class LostFoundStatus(StrEnum):
    STORED = "stored"
    CLAIMED = "claimed"
    RETURNED = "returned"
    DISPOSED = "disposed"


class LostFoundItem(Base):
    __tablename__ = "lost_found_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    item_type: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=LostFoundItemType.FOUND.value,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=LostFoundStatus.STORED.value,
    )
    claimant_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    claimant_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    handover_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
