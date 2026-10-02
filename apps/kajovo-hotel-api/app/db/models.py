import json
from datetime import date, datetime

try:
    from enum import StrEnum
except ImportError:  # pragma: no cover
    from enum import Enum

    class StrEnum(str, Enum):
        pass


from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class VoiceCoreSettings(Base):
    __tablename__ = "voice_core_settings"
    __table_args__ = (CheckConstraint("id = 1", name="voice_core_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    config_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    encrypted_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)


class VoiceSmartOperation(Base):
    """Idempotency/recovery metadata only: no arguments, device values or transcripts."""
    __tablename__ = "voice_smart_operations"
    __table_args__ = (UniqueConstraint("owner_session_id", "call_id", name="uq_voice_smart_provider_call"),)

    request_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    owner_session_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    call_id: Mapped[str] = mapped_column(String(128), nullable=False)
    arguments_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VoiceSmartDelivery(Base):
    """Provider delivery receipt only; no tool output, image or transcript storage."""
    __tablename__ = "voice_smart_deliveries"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    owner_session_id: Mapped[str] = mapped_column(String(128), nullable=False)
    arguments_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReservationAmenity(Base):
    __tablename__ = "reservation_amenities"
    __table_args__ = (
        UniqueConstraint("reservation_id", "kind", name="uq_reservation_amenity"),
        CheckConstraint("kind IN ('dog', 'cot')", name="ck_reservation_amenity_kind"),
        CheckConstraint("state IN ('red', 'green')", name="ck_reservation_amenity_state"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reservation_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="red")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DeviceStatus(StrEnum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    photos: Mapped[list["ReportPhoto"]] = relationship(
        "ReportPhoto",
        back_populates="report",
        cascade="all, delete-orphan",
        order_by="ReportPhoto.sort_order.asc()",
    )


class BreakfastStatus(StrEnum):
    PENDING = "pending"
    PREPARING = "preparing"
    SERVED = "served"
    CANCELLED = "cancelled"


class ReservationBreakfastDiet(Base):
    __tablename__ = "reservation_breakfast_diets"

    reservation_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    guest_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    arrival: Mapped[date | None] = mapped_column(Date, nullable=True)
    departure: Mapped[date | None] = mapped_column(Date, nullable=True)
    diet_no_gluten: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    diet_no_milk: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    diet_no_pork: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_by: Mapped[str] = mapped_column(String(255), nullable=False, default="sync")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class BreakfastOrder(Base):
    __tablename__ = "breakfast_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    service_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    source_key: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    room_number: Mapped[str] = mapped_column(String(32), nullable=False)
    guest_name: Mapped[str] = mapped_column(String(255), nullable=False)
    guest_names: Mapped[str | None] = mapped_column(Text, nullable=True)
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    reservation_details_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    guest_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=BreakfastStatus.PENDING.value
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    diet_no_gluten: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    diet_no_milk: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    diet_no_pork: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class BreakfastImportMailboxSettings(Base):
    __tablename__ = "breakfast_import_mailbox_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    host: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    port: Mapped[int] = mapped_column(Integer, nullable=False, default=993)
    use_ssl: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    mailbox: Mapped[str] = mapped_column(String(128), nullable=False, default="INBOX")
    username: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    password_encrypted: Mapped[str] = mapped_column(Text, nullable=False, default="")
    from_contains: Mapped[str] = mapped_column(
        String(255), nullable=False, default="noreply=better-hotel.com@mg2.better-hotel.com"
    )
    subject_contains: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class BreakfastImportProcessedAttachment(Base):
    __tablename__ = "breakfast_import_processed_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    message_uid: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    attachment_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    parsed_day: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BreakfastImportRunLog(Base):
    __tablename__ = "breakfast_import_run_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    trigger: Mapped[str] = mapped_column(String(32), nullable=False, default="scheduler")
    details_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LostFoundItemType(StrEnum):
    LOST = "lost"
    FOUND = "found"


class LostFoundStatus(StrEnum):
    NEW = "new"
    STORED = "stored"
    DISPOSED = "disposed"
    CLAIMED = "claimed"
    RETURNED = "returned"


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
    room_number: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=LostFoundStatus.NEW.value,
    )
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    claimant_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    claimant_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    handover_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    photos: Mapped[list["LostFoundPhoto"]] = relationship(
        "LostFoundPhoto",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="LostFoundPhoto.sort_order.asc()",
    )

    @property
    def tags(self) -> list[str]:
        try:
            parsed = json.loads(self.tags_json or "[]")
        except json.JSONDecodeError:
            return []
        if not isinstance(parsed, list):
            return []
        return [str(item) for item in parsed]

    @tags.setter
    def tags(self, value: list[str] | None) -> None:
        tags = [str(item) for item in (value or []) if str(item).strip()]
        self.tags_json = json.dumps(tags, ensure_ascii=False)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    photos: Mapped[list["IssuePhoto"]] = relationship(
        "IssuePhoto",
        back_populates="issue",
        cascade="all, delete-orphan",
        order_by="IssuePhoto.sort_order.asc()",
    )


class InventoryMovementType(StrEnum):
    IN = "in"
    OUT = "out"
    ADJUST = "adjust"


class InventoryCardType(StrEnum):
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
    amount_per_piece_base: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    pictogram_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    pictogram_thumb_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    movements: Mapped[list["InventoryMovement"]] = relationship(
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="InventoryMovement.document_date.asc(), InventoryMovement.created_at.asc()",
    )
    card_lines: Mapped[list["InventoryCardItem"]] = relationship(
        "InventoryCardItem",
        back_populates="ingredient",
        cascade="all, delete-orphan",
        order_by="InventoryCardItem.id.asc()",
    )


class InventoryCard(Base):
    __tablename__ = "inventory_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    card_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    card_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    supplier: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(64), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    items: Mapped[list["InventoryCardItem"]] = relationship(
        "InventoryCardItem",
        back_populates="card",
        cascade="all, delete-orphan",
        order_by="InventoryCardItem.id.asc()",
    )
    movements: Mapped[list["InventoryMovement"]] = relationship(
        "InventoryMovement",
        back_populates="card",
        order_by="InventoryMovement.created_at.asc(), InventoryMovement.id.asc()",
    )


class InventoryCardItem(Base):
    __tablename__ = "inventory_card_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    card_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_cards.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity_base: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quantity_pieces: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    card: Mapped["InventoryCard"] = relationship("InventoryCard", back_populates="items")
    ingredient: Mapped["InventoryItem"] = relationship("InventoryItem", back_populates="card_lines")
    movements: Mapped[list["InventoryMovement"]] = relationship(
        "InventoryMovement",
        back_populates="card_item",
        order_by="InventoryMovement.created_at.asc(), InventoryMovement.id.asc()",
    )


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"), index=True
    )
    card_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_cards.id", ondelete="SET NULL"), nullable=True, index=True
    )
    card_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_card_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    movement_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    document_number: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    document_reference: Mapped[str | None] = mapped_column(String(64), nullable=True)
    document_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_pieces: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    item: Mapped[InventoryItem] = relationship(back_populates="movements")
    card: Mapped["InventoryCard | None"] = relationship("InventoryCard", back_populates="movements")
    card_item: Mapped["InventoryCardItem | None"] = relationship("InventoryCardItem", back_populates="movements")


class IssuePhoto(Base):
    __tablename__ = "issue_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    issue_id: Mapped[int] = mapped_column(
        ForeignKey("issues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    thumb_path: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(80), nullable=False, default="image/jpeg")
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    issue: Mapped[Issue] = relationship(back_populates="photos")


class ReportPhoto(Base):
    __tablename__ = "report_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(
        ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    thumb_path: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(80), nullable=False, default="image/jpeg")
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    report: Mapped[Report] = relationship(back_populates="photos")


class LostFoundPhoto(Base):
    __tablename__ = "lost_found_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("lost_found_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    thumb_path: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(80), nullable=False, default="image/jpeg")
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    item: Mapped[LostFoundItem] = relationship(back_populates="photos")


class InventoryAuditLog(Base):
    __tablename__ = "inventory_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    entity: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    resource_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class DeviceRegistration(Base):
    __tablename__ = "device_registrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", index=True)
    secret_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class DeviceChallenge(Base):
    __tablename__ = "device_challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    challenge_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    device_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    challenge: Mapped[str] = mapped_column(String(128), nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)


class DeviceAccessToken(Base):
    __tablename__ = "device_access_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)


class AuditTrail(Base):
    __tablename__ = "audit_trail"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    request_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    actor_role: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    module: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    resource: Mapped[str] = mapped_column(String(255), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PortalUser(Base):
    __tablename__ = "portal_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    last_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    preferred_locale: Mapped[str] = mapped_column(String(2), nullable=False, default="cs", server_default="cs")
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(16), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    roles: Mapped[list["PortalUserRole"]] = relationship(
        "PortalUserRole",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    sessions: Mapped[list["AuthSession"]] = relationship(
        "AuthSession",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class PortalUserRole(Base):
    __tablename__ = "portal_user_roles"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("portal_users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(32), primary_key=True, index=True)
    user: Mapped[PortalUser] = relationship("PortalUser", back_populates="roles")


class ChatParticipant(Base):
    __tablename__ = "chat_participants"
    __table_args__ = (UniqueConstraint("principal_type", "principal_id", name="uq_chat_participant_principal"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    principal_type: Mapped[str] = mapped_column(String(24), nullable=False)
    principal_id: Mapped[int] = mapped_column(Integer, nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ChatConversation(Base):
    __tablename__ = "chat_conversations"
    __table_args__ = (UniqueConstraint("participant_low_id", "participant_high_id", name="uq_chat_conversation_participants"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    participant_low_id: Mapped[int] = mapped_column(ForeignKey("chat_participants.id", ondelete="RESTRICT"), nullable=False, index=True)
    participant_high_id: Mapped[int] = mapped_column(ForeignKey("chat_participants.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (UniqueConstraint("sender_id", "client_message_id", name="uq_chat_message_client_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("chat_participants.id", ondelete="RESTRICT"), nullable=False, index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    client_message_id: Mapped[str] = mapped_column(String(64), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)


class ChatPushSubscription(Base):
    __tablename__ = "chat_push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    participant_id: Mapped[int] = mapped_column(ForeignKey("chat_participants.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ChatPushOutbox(Base):
    __tablename__ = "chat_push_outbox"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False, unique=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChatFcmToken(Base):
    __tablename__ = "chat_fcm_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    participant_id: Mapped[int] = mapped_column(ForeignKey("chat_participants.id", ondelete="CASCADE"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ChatFcmOutbox(Base):
    __tablename__ = "chat_fcm_outbox"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False, unique=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_token_ids: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PortalSmtpSettings(Base):
    __tablename__ = "portal_smtp_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    from_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    password_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    use_tls: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    use_ssl: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_test_connected: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_test_send_attempted: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_test_success: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_test_recipient: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_test_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class AdminProfile(Base):
    __tablename__ = "admin_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False, default="Admin")
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class AuthLockoutState(Base):
    __tablename__ = "auth_lockout_states"
    __mapper_args__ = {"confirm_deleted_rows": False}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    actor_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    principal: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    failed_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    first_failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_forgot_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    actor_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    principal: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    portal_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("portal_users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    roles_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    active_role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    web_activity_session: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    user: Mapped[PortalUser | None] = relationship("PortalUser", back_populates="sessions")

    @property
    def roles(self) -> list[str]:
        try:
            parsed = json.loads(self.roles_json or "[]")
        except json.JSONDecodeError:
            return []
        if not isinstance(parsed, list):
            return []
        return [str(item) for item in parsed if str(item).strip()]

    @roles.setter
    def roles(self, value: list[str] | None) -> None:
        roles = [str(item) for item in (value or []) if str(item).strip()]
        self.roles_json = json.dumps(roles, ensure_ascii=False)


class AuthUnlockToken(Base):
    __tablename__ = "auth_unlock_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    actor_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    principal: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(32), nullable=False, default="unlock", index=True)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VoiceMemoryPrincipal(Base):
    __tablename__ = "voice_memory_principals"
    __table_args__ = (
        CheckConstraint(
            "(portal_user_id IS NULL) <> (admin_profile_id IS NULL)",
            name="ck_voice_memory_owner",
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    portal_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("portal_users.id", ondelete="CASCADE"), unique=True
    )
    admin_profile_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_profile.id", ondelete="CASCADE"), unique=True
    )


class VoiceMemorySettings(Base):
    __tablename__ = "voice_memory_settings"
    principal_id: Mapped[str] = mapped_column(
        ForeignKey("voice_memory_principals.id", ondelete="CASCADE"), primary_key=True
    )
    automatic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    generation: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class VoiceMemory(Base):
    __tablename__ = "voice_memories"
    __table_args__ = (
        Index(
            "ix_voice_memory_context",
            "principal_id",
            "status",
            "pinned",
            "importance",
            "updated_at",
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    principal_id: Mapped[str] = mapped_column(
        ForeignKey("voice_memory_principals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    search_text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", index=True
    )
    origin: Mapped[str] = mapped_column(String(16), nullable=False)
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    importance: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    source_session_id: Mapped[str | None] = mapped_column(String(128))
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class VoiceMemoryRevision(Base):
    __tablename__ = "voice_memory_revisions"
    __table_args__ = (
        UniqueConstraint("memory_id", "revision", name="uq_voice_memory_revision"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    memory_id: Mapped[str] = mapped_column(
        ForeignKey("voice_memories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    source_session_id: Mapped[str | None] = mapped_column(String(128))
    reason: Mapped[str] = mapped_column(String(24), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class VoiceNote(Base):
    __tablename__ = "voice_notes"
    __table_args__ = (
        Index("ix_voice_note_owner_status", "principal_id", "status", "updated_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    principal_id: Mapped[str] = mapped_column(
        ForeignKey("voice_memory_principals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    normalized_title: Mapped[str] = mapped_column(
        String(320), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class VoiceNoteItem(Base):
    __tablename__ = "voice_note_items"
    __table_args__ = (
        UniqueConstraint("note_id", "position", name="uq_voice_note_position"),
        CheckConstraint("position >= 0", name="ck_voice_note_position"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    note_id: Mapped[str] = mapped_column(
        ForeignKey("voice_notes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)


class VoiceConversationSummary(Base):
    __tablename__ = "voice_conversation_summaries"
    __table_args__ = (
        UniqueConstraint("principal_id", "session_id", name="uq_voice_summary_session"),
        Index("ix_voice_summary_owner_recency", "principal_id", "updated_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    principal_id: Mapped[str] = mapped_column(
        ForeignKey("voice_memory_principals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[str] = mapped_column(String(128), nullable=False)
    topics: Mapped[list] = mapped_column(JSON, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    decisions: Mapped[list] = mapped_column(JSON, nullable=False)
    open_points: Mapped[list] = mapped_column(JSON, nullable=False)
    continuation: Mapped[str] = mapped_column(String(400), nullable=False)
    memory_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    source_note_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    search_text: Mapped[str] = mapped_column(Text, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class VoiceMemoryOperation(Base):
    __tablename__ = "voice_memory_operations"
    __table_args__ = (
        UniqueConstraint(
            "principal_id", "session_id", "call_id", name="uq_voice_memory_call"
        ),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    principal_id: Mapped[str] = mapped_column(
        ForeignKey("voice_memory_principals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[str] = mapped_column(String(128), nullable=False)
    call_id: Mapped[str] = mapped_column(String(128), nullable=False)
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    arguments_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    result_code: Mapped[str] = mapped_column(String(24), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(36))
    entity_revision: Mapped[int | None] = mapped_column(Integer)
    delivered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class VoiceMemoryDependency(Base):
    __tablename__ = "voice_memory_dependencies"
    __table_args__ = (
        CheckConstraint(
            "(source_memory_id IS NULL) <> (source_note_id IS NULL)",
            name="ck_voice_memory_dependency_source",
        ),
        UniqueConstraint(
            "memory_id", "source_memory_id", name="uq_voice_memory_dependency_memory"
        ),
        UniqueConstraint(
            "memory_id", "source_note_id", name="uq_voice_memory_dependency_note"
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    memory_id: Mapped[str] = mapped_column(
        ForeignKey("voice_memories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_memory_id: Mapped[str | None] = mapped_column(
        ForeignKey("voice_memories.id", ondelete="CASCADE"), index=True
    )
    source_note_id: Mapped[str | None] = mapped_column(
        ForeignKey("voice_notes.id", ondelete="CASCADE"), index=True
    )
