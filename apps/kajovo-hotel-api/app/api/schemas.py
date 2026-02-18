from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class ReportCreate(BaseModel):
    title: str
    description: str | None = None


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    status: str
    created_at: datetime | None


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
