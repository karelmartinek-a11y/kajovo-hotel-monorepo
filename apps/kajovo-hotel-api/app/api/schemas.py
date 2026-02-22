from datetime import date, datetime

try:
    from enum import StrEnum
except ImportError:  # pragma: no cover
    from enum import Enum

    class StrEnum(str, Enum):
        pass


from pydantic import BaseModel, ConfigDict, Field


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


class BreakfastOrderCreate(BreakfastOrderBase):
    pass


class BreakfastOrderUpdate(BaseModel):
    service_date: date | None = None
    room_number: str | None = Field(default=None, min_length=1, max_length=32)
    guest_name: str | None = Field(default=None, min_length=1, max_length=255)
    guest_count: int | None = Field(default=None, ge=1, le=20)
    status: BreakfastStatus | None = None
    note: str | None = Field(default=None, max_length=2000)


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


class LostFoundItemType(StrEnum):
    LOST = "lost"
    FOUND = "found"


class LostFoundStatus(StrEnum):
    STORED = "stored"
    CLAIMED = "claimed"
    RETURNED = "returned"
    DISPOSED = "disposed"


class LostFoundItemBase(BaseModel):
    item_type: LostFoundItemType = LostFoundItemType.FOUND
    description: str = Field(min_length=3, max_length=4000)
    category: str = Field(min_length=1, max_length=64)
    location: str = Field(min_length=1, max_length=255)
    event_at: datetime
    status: LostFoundStatus = LostFoundStatus.STORED
    claimant_name: str | None = Field(default=None, max_length=255)
    claimant_contact: str | None = Field(default=None, max_length=255)
    handover_note: str | None = Field(default=None, max_length=2000)
    claimed_at: datetime | None = None
    returned_at: datetime | None = None


class LostFoundItemCreate(LostFoundItemBase):
    pass


class LostFoundItemUpdate(BaseModel):
    item_type: LostFoundItemType | None = None
    description: str | None = Field(default=None, min_length=3, max_length=4000)
    category: str | None = Field(default=None, min_length=1, max_length=64)
    location: str | None = Field(default=None, min_length=1, max_length=255)
    event_at: datetime | None = None
    status: LostFoundStatus | None = None
    claimant_name: str | None = Field(default=None, max_length=255)
    claimant_contact: str | None = Field(default=None, max_length=255)
    handover_note: str | None = Field(default=None, max_length=2000)
    claimed_at: datetime | None = None
    returned_at: datetime | None = None


class LostFoundItemRead(LostFoundItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime | None
    updated_at: datetime | None


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


class InventoryMovementType(StrEnum):
    IN = "in"
    OUT = "out"
    ADJUST = "adjust"


class InventoryItemBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    unit: str = Field(min_length=1, max_length=32)
    min_stock: int = Field(ge=0)
    current_stock: int = Field(ge=0)
    supplier: str | None = Field(default=None, max_length=255)


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    unit: str | None = Field(default=None, min_length=1, max_length=32)
    min_stock: int | None = Field(default=None, ge=0)
    current_stock: int | None = Field(default=None, ge=0)
    supplier: str | None = Field(default=None, max_length=255)


class InventoryMovementBase(BaseModel):
    movement_type: InventoryMovementType
    quantity: int = Field(ge=0)
    note: str | None = Field(default=None, max_length=2000)


class InventoryMovementCreate(InventoryMovementBase):
    pass


class InventoryMovementRead(InventoryMovementBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_id: int
    created_at: datetime | None


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




class PortalUserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=255)


class PortalUserPasswordSet(BaseModel):
    password: str = Field(min_length=8, max_length=255)


class PortalUserStatusUpdate(BaseModel):
    is_active: bool


class PortalUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: str
    is_active: bool
    created_at: datetime | None
    updated_at: datetime | None

class AdminLoginRequest(BaseModel):
    email: str
    password: str


class PortalLoginRequest(BaseModel):
    email: str
    password: str


class LogoutResponse(BaseModel):
    ok: bool = True


class AuthIdentityResponse(BaseModel):
    email: str
    role: str
    permissions: list[str]
    actor_type: str
