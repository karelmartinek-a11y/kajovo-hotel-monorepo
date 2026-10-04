"""Dagmar public registry projections; no hotel or persistence dependencies."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class PublicChange(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    action: Literal["create_room", "rename_room", "delete_room", "assign_devices", "remove_devices", "rename_devices"]
    status: str = Field(max_length=64)
    detached_devices: int | None = Field(default=None, ge=0)
    row: int | None = Field(default=None, ge=1)
    room_ref: str | None = Field(default=None, max_length=256)
    name: str | None = Field(default=None, max_length=160)
    old_name: str | None = Field(default=None, max_length=160)
    new_name: str | None = Field(default=None, max_length=160)
    old_location: str | None = Field(default=None, max_length=160)
    new_location: str | None = Field(default=None, max_length=160)


class PublicPlan(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(min_length=1, max_length=256)
    expires_at: str = Field(max_length=64)
    requires_confirmation: bool
    changes: list[PublicChange] = Field(min_length=1, max_length=1000)


class PublicRegistryResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    action: str | None = Field(default=None, max_length=64)
    status: str = Field(max_length=64)
    room_ref: str | None = Field(default=None, max_length=256)
    row: int | None = Field(default=None, ge=1)
    name: str | None = Field(default=None, max_length=160)
    location: str | None = Field(default=None, max_length=160)
    function: str | None = Field(default=None, max_length=256)
    message: str | None = Field(default=None, max_length=1000)
    old_name: str | None = Field(default=None, max_length=160)
    new_name: str | None = Field(default=None, max_length=160)
    old_location: str | None = Field(default=None, max_length=160)
    new_location: str | None = Field(default=None, max_length=160)
    detached_devices: int | None = Field(default=None, ge=0)


class RegistryView(BaseModel):
    plan: PublicPlan | None = None
    state: str = "idle"
    attempts: int = 0
    results: list[PublicRegistryResult] = Field(default_factory=list)


