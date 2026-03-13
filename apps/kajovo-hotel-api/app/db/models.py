import json
from datetime import date, datetime

try:
    from enum import StrEnum
except ImportError:  # pragma: no cover
    from enum import Enum

    class StrEnum(str, Enum):
        pass


from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


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
    diet_no_gluten: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    diet_no_milk: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    diet_no_pork: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


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


class PortalSmtpSettings(Base):
    __tablename__ = "portal_smtp_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    password_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    use_tls: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    use_ssl: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
