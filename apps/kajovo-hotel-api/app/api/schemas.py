from datetime import date, datetime

try:
    from enum import StrEnum
except ImportError:  # pragma: no cover
    from enum import Enum

    class StrEnum(str, Enum):
        pass


from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.security.rbac import normalize_role


class ApiErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str | None = None
    details: object | None = None


class ApiErrorEnvelope(BaseModel):
    error: ApiErrorDetail


class ReportCreate(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    status: str = Field(default="open", pattern="^(open|in_progress|closed)$")


class ReportUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    status: str | None = Field(default=None, pattern="^(open|in_progress|closed)$")


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    status: str
    created_at: datetime | None
    updated_at: datetime | None
    photos: list["MediaPhotoRead"] = Field(default_factory=list)


class BreakfastStatus(StrEnum):
    PENDING = "pending"
    PREPARING = "preparing"
    SERVED = "served"
    CANCELLED = "cancelled"


class BreakfastOrderBase(BaseModel):
    service_date: date
    room_number: str = Field(min_length=1, max_length=32)
    guest_name: str = Field(min_length=1, max_length=255)
    guest_count: int = Field(ge=1, le=20)
    status: BreakfastStatus = BreakfastStatus.PENDING
    note: str | None = Field(default=None, max_length=2000)
    diet_no_gluten: bool = False
    diet_no_milk: bool = False
    diet_no_pork: bool = False


class BreakfastOrderCreate(BreakfastOrderBase):
    pass


class BreakfastOrderUpdate(BaseModel):
    service_date: date | None = None
    room_number: str | None = Field(default=None, min_length=1, max_length=32)
    guest_name: str | None = Field(default=None, min_length=1, max_length=255)
    guest_count: int | None = Field(default=None, ge=1, le=20)
    status: BreakfastStatus | None = None
    note: str | None = Field(default=None, max_length=2000)
    diet_no_gluten: bool | None = None
    diet_no_milk: bool | None = None
    diet_no_pork: bool | None = None


class BreakfastOrderRead(BreakfastOrderBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime | None
    updated_at: datetime | None


class BreakfastDailySummary(BaseModel):
    service_date: date
    total_orders: int
    total_guests: int
    status_counts: dict[BreakfastStatus, int]


class BreakfastImportItem(BaseModel):
    room: int
    count: int
    guest_name: str | None = None
    diet_no_gluten: bool = False
    diet_no_milk: bool = False
    diet_no_pork: bool = False


class BreakfastImportResponse(BaseModel):
    ok: bool = True
    date: date
    status: str
    saved: bool = False
    items: list[BreakfastImportItem]


class LostFoundItemType(StrEnum):
    LOST = "lost"
    FOUND = "found"


class LostFoundStatus(StrEnum):
    NEW = "new"
    STORED = "stored"
    DISPOSED = "disposed"
    CLAIMED = "claimed"
    RETURNED = "returned"


ALLOWED_LOST_FOUND_TAGS = {"kontaktova", "nezastizen", "vyzvedne", "odesleme"}


class LostFoundItemBase(BaseModel):
    item_type: LostFoundItemType = LostFoundItemType.FOUND
    description: str = Field(min_length=3, max_length=4000)
    category: str = Field(min_length=1, max_length=64)
    location: str = Field(min_length=1, max_length=255)
    room_number: str | None = Field(default=None, min_length=1, max_length=32)
    event_at: datetime
    status: LostFoundStatus = LostFoundStatus.NEW
    tags: list[str] = Field(default_factory=list)
    claimant_name: str | None = Field(default=None, max_length=255)
    claimant_contact: str | None = Field(default=None, max_length=255)
    handover_note: str | None = Field(default=None, max_length=2000)
    claimed_at: datetime | None = None
    returned_at: datetime | None = None

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for tag in value:
            normalized = str(tag).strip().lower()
            if not normalized:
                continue
            if normalized not in ALLOWED_LOST_FOUND_TAGS:
                raise ValueError(
                    f"Tag must be one of: {', '.join(sorted(ALLOWED_LOST_FOUND_TAGS))}"
                )
            if normalized not in cleaned:
                cleaned.append(normalized)
        return cleaned


class LostFoundItemCreate(LostFoundItemBase):
    pass


class LostFoundItemUpdate(BaseModel):
    item_type: LostFoundItemType | None = None
    description: str | None = Field(default=None, min_length=3, max_length=4000)
    category: str | None = Field(default=None, min_length=1, max_length=64)
    location: str | None = Field(default=None, min_length=1, max_length=255)
    room_number: str | None = Field(default=None, min_length=1, max_length=32)
    event_at: datetime | None = None
    status: LostFoundStatus | None = None
    tags: list[str] | None = None
    claimant_name: str | None = Field(default=None, max_length=255)
    claimant_contact: str | None = Field(default=None, max_length=255)
    handover_note: str | None = Field(default=None, max_length=2000)
    claimed_at: datetime | None = None
    returned_at: datetime | None = None

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned: list[str] = []
        for tag in value:
            normalized = str(tag).strip().lower()
            if not normalized:
                continue
            if normalized not in ALLOWED_LOST_FOUND_TAGS:
                raise ValueError(
                    f"Tag must be one of: {', '.join(sorted(ALLOWED_LOST_FOUND_TAGS))}"
                )
            if normalized not in cleaned:
                cleaned.append(normalized)
        return cleaned


class LostFoundItemRead(LostFoundItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime | None
    updated_at: datetime | None
    photos: list["MediaPhotoRead"] = Field(default_factory=list)


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


class IssueBase(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    location: str = Field(min_length=1, max_length=255)
    room_number: str | None = Field(default=None, min_length=1, max_length=32)
    priority: IssuePriority = IssuePriority.MEDIUM
    status: IssueStatus = IssueStatus.NEW
    assignee: str | None = Field(default=None, max_length=255)


class IssueCreate(IssueBase):
    pass


class IssueUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    location: str | None = Field(default=None, min_length=1, max_length=255)
    room_number: str | None = Field(default=None, min_length=1, max_length=32)
    priority: IssuePriority | None = None
    status: IssueStatus | None = None
    assignee: str | None = Field(default=None, max_length=255)


class IssueRead(IssueBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    in_progress_at: datetime | None
    resolved_at: datetime | None
    closed_at: datetime | None
    created_at: datetime | None
    updated_at: datetime | None
    photos: list["MediaPhotoRead"] = Field(default_factory=list)


class InventoryMovementType(StrEnum):
    IN = "in"
    OUT = "out"
    ADJUST = "adjust"


class InventoryCardType(StrEnum):
    IN = "in"
    OUT = "out"
    ADJUST = "adjust"


class InventoryItemBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    unit: str = Field(min_length=1, max_length=32)
    min_stock: int = Field(ge=0)
    current_stock: int = Field(ge=0)
    amount_per_piece_base: int = Field(default=1, ge=1)
    pictogram_path: str | None = None
    pictogram_thumb_path: str | None = None

    @field_validator("unit")
    @classmethod
    def validate_unit(cls, value: str) -> str:
        unit = value.strip().lower()
        if unit not in {"g", "l", "ks"}:
            raise ValueError("Unit must be one of: g, l, ks")
        return unit


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    unit: str | None = Field(default=None, min_length=1, max_length=32)
    min_stock: int | None = Field(default=None, ge=0)
    current_stock: int | None = Field(default=None, ge=0)
    amount_per_piece_base: int | None = Field(default=None, ge=1)
    pictogram_path: str | None = None
    pictogram_thumb_path: str | None = None

    @field_validator("unit")
    @classmethod
    def validate_unit(cls, value: str | None) -> str | None:
        if value is None:
            return None
        unit = value.strip().lower()
        if unit not in {"g", "l", "ks"}:
            raise ValueError("Unit must be one of: g, l, ks")
        return unit


class MediaPhotoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sort_order: int
    mime_type: str
    size_bytes: int
    file_path: str
    thumb_path: str
    created_at: datetime | None


class InventoryMovementBase(BaseModel):
    movement_type: InventoryMovementType
    quantity: int = Field(ge=1)
    quantity_pieces: int = Field(default=0, ge=0)
    document_date: date | None = None
    document_reference: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=2000)


class InventoryMovementCreate(InventoryMovementBase):
    document_date: date


class InventoryMovementRead(InventoryMovementBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_id: int
    item_name: str | None = None
    unit: str | None = None
    card_id: int | None = None
    card_item_id: int | None = None
    card_number: str | None = None
    document_number: str | None
    created_at: datetime | None


class InventoryCardItemBase(BaseModel):
    ingredient_id: int = Field(ge=1)
    quantity_base: int = Field(ge=1)
    quantity_pieces: int = Field(default=0, ge=0)
    note: str | None = Field(default=None, max_length=2000)


class InventoryCardItemCreate(InventoryCardItemBase):
    pass


class InventoryCardItemRead(InventoryCardItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    card_id: int
    ingredient_name: str | None = None
    unit: str | None = None
    created_at: datetime | None


class InventoryCardBase(BaseModel):
    card_type: InventoryCardType
    card_date: date
    supplier: str | None = Field(default=None, max_length=255)
    reference: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=2000)


class InventoryCardCreate(InventoryCardBase):
    items: list[InventoryCardItemCreate] = Field(min_length=1)


class InventoryCardRead(InventoryCardBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str
    created_at: datetime | None
    updated_at: datetime | None


class InventoryCardDetailRead(InventoryCardRead):
    items: list[InventoryCardItemRead]


class InventoryAuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entity: str
    resource_id: int
    action: str
    detail: str
    created_at: datetime | None


class InventoryItemRead(InventoryItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime | None
    updated_at: datetime | None


class InventoryItemDetailRead(InventoryItemRead):
    movements: list[InventoryMovementRead]


class InventoryItemWithAuditRead(InventoryItemDetailRead):
    audit_logs: list[InventoryAuditLogRead]


ALLOWED_PORTAL_ROLES = {
    "admin",
    "pokojská",
    "údržba",
    "recepce",
    "snídaně",
    "sklad",
    "udrzba",
    "snidane",
    "pokojska",
}


class PortalUserBasePayload(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    roles: list[str] = Field(min_length=1)
    phone: str | None = Field(default=None, max_length=16)
    note: str | None = Field(default=None, max_length=4000)

    @field_validator("roles")
    @classmethod
    def validate_roles(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for role in value:
            normalized = role.strip().lower()
            if normalized not in ALLOWED_PORTAL_ROLES:
                raise ValueError(f"Role must be one of: {', '.join(sorted(ALLOWED_PORTAL_ROLES))}")
            canonical = normalize_role(normalized)
            if canonical not in cleaned:
                cleaned.append(canonical)
        if not cleaned:
            raise ValueError("At least one role is required")
        return cleaned

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        email = value.strip().lower()
        import re

        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            raise ValueError("Email must be valid")
        return email

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        phone = value.strip()
        if not phone:
            return None
        import re

        if not re.match(r"^\+[1-9]\d{1,14}$", phone):
            raise ValueError("Phone must be in E.164 format")
        return phone


class PortalUserCreate(PortalUserBasePayload):
    first_name: str = Field(default="New", min_length=1, max_length=120)
    last_name: str = Field(default="User", min_length=1, max_length=120)
    roles: list[str] = Field(default_factory=lambda: ["recepce"], min_length=1)
    password: str = Field(min_length=8, max_length=255)


class PortalUserUpdate(PortalUserBasePayload):
    pass


class PortalUserPasswordSet(BaseModel):
    password: str = Field(min_length=8, max_length=255)


class PortalUserStatusUpdate(BaseModel):
    is_active: bool


class PortalUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str
    email: str
    role: str
    roles: list[str]
    phone: str | None
    note: str | None
    is_active: bool
    created_at: datetime | None
    updated_at: datetime | None
    last_login_at: datetime | None


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class PortalLoginRequest(BaseModel):
    email: str
    password: str


class LogoutResponse(BaseModel):
    ok: bool = True


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class PortalPasswordChangeRequest(BaseModel):
    old_password: str = Field(min_length=8, max_length=255)
    new_password: str = Field(min_length=8, max_length=255)


class AuthProfileRead(BaseModel):
    email: str
    first_name: str
    last_name: str
    phone: str | None = None
    note: str | None = None
    roles: list[str] = Field(default_factory=list)
    actor_type: str


class AuthProfileUpdate(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=16)
    note: str | None = Field(default=None, max_length=4000)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        phone = value.strip()
        if not phone:
            return None
        import re

        if not re.match(r"^\+[1-9]\d{1,14}$", phone):
            raise ValueError("Phone must be in E.164 format")
        return phone


class SelectRoleRequest(BaseModel):
    role: str = Field(min_length=1, max_length=32)


class AuthIdentityResponse(BaseModel):
    email: str
    role: str
    roles: list[str] = []
    active_role: str | None = None
    permissions: list[str]
    actor_type: str


class DeviceRegisterRequest(BaseModel):
    device_id: str = Field(min_length=3, max_length=128)
    display_name: str | None = Field(default=None, max_length=255)
    bootstrap_key: str = Field(min_length=8, max_length=255)


class DeviceRegisterResponse(BaseModel):
    device_id: str
    display_name: str
    status: str
    device_secret: str
    registered_at: datetime


class DeviceChallengeRequest(BaseModel):
    device_id: str = Field(min_length=3, max_length=128)
    device_secret: str = Field(min_length=16, max_length=255)


class DeviceChallengeResponse(BaseModel):
    challenge_id: str
    challenge: str
    expires_at: datetime


class DeviceVerifyRequest(BaseModel):
    device_id: str = Field(min_length=3, max_length=128)
    device_secret: str = Field(min_length=16, max_length=255)
    challenge_id: str = Field(min_length=8, max_length=64)
    signature: str = Field(min_length=32, max_length=256)


class DeviceVerifyResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    expires_at: datetime


class DeviceStatusResponse(BaseModel):
    device_id: str
    display_name: str
    status: str
    registered_at: datetime
    last_seen_at: datetime | None
    token_expires_at: datetime | None = None


class AdminProfileRead(BaseModel):
    email: str
    display_name: str
    password_changed_at: datetime | None
    updated_at: datetime | None


class AdminProfileUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)


class AdminPasswordChangeRequest(BaseModel):
    old_password: str = Field(min_length=8, max_length=255)
    new_password: str = Field(min_length=8, max_length=255)


class SmtpSettingsUpsert(BaseModel):
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    username: str = Field(min_length=1, max_length=255)
    password: str | None = Field(default=None, max_length=1024)
    use_tls: bool = True
    use_ssl: bool = False


class SmtpSettingsRead(BaseModel):
    host: str
    port: int
    username: str
    use_tls: bool
    use_ssl: bool
    password_masked: str


class SmtpOperationalStatusRead(BaseModel):
    configured: bool
    smtp_enabled: bool
    delivery_mode: str
    can_send_real_email: bool
    last_tested_at: datetime | None = None
    last_test_success: bool | None = None
    last_test_recipient: str | None = None
    last_test_error: str | None = None


class SmtpTestEmailRequest(BaseModel):
    recipient: str = Field(min_length=3, max_length=255)


class SmtpTestEmailResponse(BaseModel):
    ok: bool = True
    delivery_mode: str
    message: str


class InventoryBootstrapStatusRead(BaseModel):
    enabled: bool
    environment: str
