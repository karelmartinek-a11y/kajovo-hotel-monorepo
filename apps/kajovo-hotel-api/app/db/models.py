from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


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


class IssuePriority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class IssueStatus(StrEnum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    room_number: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    priority: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=IssuePriority.MEDIUM.value,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=IssueStatus.NEW.value,
        index=True,
    )
    assignee: Mapped[str | None] = mapped_column(String(255), nullable=True)
    in_progress_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class InventoryMovementType(StrEnum):
    IN = "in"
    OUT = "out"
    ADJUST = "adjust"


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    min_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    supplier: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    movements: Mapped[list["InventoryMovement"]] = relationship(
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="desc(InventoryMovement.created_at)",
    )


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"), index=True
    )
    movement_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

    item: Mapped[InventoryItem] = relationship(back_populates="movements")


class InventoryAuditLog(Base):
    __tablename__ = "inventory_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    entity: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
