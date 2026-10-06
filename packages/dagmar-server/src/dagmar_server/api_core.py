from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from sqlalchemy import update
from sqlalchemy.orm import Session
from voice_core_server import VoiceCoreConfig, VoiceError, catalog

from .ports import get_settings
from .models import VoiceCoreSettings, LogicalCall
from .ports import get_db
from .ports import require_session
from .config import (
    VoiceConfigAdapter,
    VoiceSecretAdapter,
    get_record,
)
from .registry_contract import RegistryView
from .ports import manager


class VoiceAuthAdapter:
    def __init__(self, request: Request):
        self.request = request

    def authorize(self) -> str:
        session = require_session(self.request)
        if not session.get("voice_authorized"):
            raise HTTPException(403, detail="Administrator access required")
        return str(session["email"])


def require_voice_admin(request: Request) -> None:
    VoiceAuthAdapter(request).authorize()


router = APIRouter(prefix="", tags=["voice-core"],
                   dependencies=[Depends(require_voice_admin)])
Db = Annotated[Session, Depends(get_db)]


class VoiceCatalog(BaseModel):
    models: list[str]
    voices: list[str]
    languages: list[dict[str, str]]


class VoiceConfigRead(VoiceCoreConfig):
    revision: int
    configured: bool
    catalog: VoiceCatalog


class VoiceConfigWrite(VoiceCoreConfig):
    revision: int = Field(ge=0)


class VoiceKeyWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: SecretStr = Field(min_length=1, max_length=512)


class VoiceSessionWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    logical_call_id: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9_-]{1,128}$")
    sdp: str = Field(min_length=8, max_length=65536)
    revision: int = Field(ge=0)


class VoiceSessionRead(BaseModel):
    logical_call_id: str | None = None
    sdp: str
    model: str
    session_id: str | None = None
    connection_state: Literal["connecting", "ready", "waiting"] = "connecting"
    memory: Literal["connecting", "ready", "unavailable"] = "unavailable"
    technologies: str = "unavailable"
    managed_functions: list[str] = Field(default_factory=list)
    renew: bool = False
    closed: bool = False


class VoiceSessionStatus(BaseModel):
    logical_call_id: str | None = None
    session_id: str
    connection_state: Literal["connecting", "ready", "waiting"] = "connecting"
    memory: Literal["connecting", "ready", "unavailable"] = "unavailable"
    technologies: str
    renew: bool
    closed: bool


def read_config(db: Session) -> VoiceConfigRead:
    record = get_record(db)
    return VoiceConfigRead(**record.config_json, revision=record.revision,
                           configured=bool(record.encrypted_api_key), catalog=catalog())


def safe_error(exc: VoiceError) -> HTTPException:
    status = {"missing_api_key": 409, "secret_store_unavailable": 503,
              "invalid_api_key": 400, "model_unavailable": 400, "rate_limited": 429}.get(exc.category, 502)
    return HTTPException(status, detail={"code": exc.category})


@router.get("/config", response_model=VoiceConfigRead)
def get_config(db: Db):
    return read_config(db)


@router.put("/config", response_model=VoiceConfigRead)
def put_config(payload: VoiceConfigWrite, db: Db):
    get_record(db)
    result = db.execute(update(VoiceCoreSettings).where(VoiceCoreSettings.id == 1,
        VoiceCoreSettings.revision == payload.revision).values(
            config_json=payload.model_dump(exclude={"revision"}), revision=payload.revision + 1))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, detail={"code": "configuration_conflict"})
    db.commit()
    db.expire_all()
    return read_config(db)


@router.put("/api-key", response_model=VoiceConfigRead)
def put_key(payload: VoiceKeyWrite, db: Db):
    value = payload.api_key.get_secret_value().strip()
    if not value or any(character.isspace() for character in value):
        raise HTTPException(422, detail={"code": "invalid_key_format"})
    try:
        VoiceSecretAdapter(db).save(value)
    except VoiceError as exc:
        raise safe_error(exc) from None
    return read_config(db)


@router.delete("/api-key", response_model=VoiceConfigRead)
def delete_key(db: Db):
    VoiceSecretAdapter(db).delete()
    return read_config(db)


@router.post("/sessions", response_model=VoiceSessionRead)
async def create_session(payload: VoiceSessionWrite, db: Db, request: Request):
    record = get_record(db)
    if payload.revision != record.revision:
        raise HTTPException(409, detail={"code": "configuration_conflict"})
    if not payload.sdp.startswith("v=0"):
        raise HTTPException(422, detail={"code": "invalid_sdp"})
    try:
        key = VoiceSecretAdapter(db).read()
        try:
            identity = payload.logical_call_id
            owner = str(require_session(request)["session_id"])
            if not identity:
                from uuid import uuid4
                identity = uuid4().hex
                db.add(LogicalCall(id=identity, owner_session_id=owner))
                db.commit()
            call = db.get(LogicalCall, identity)
            if not call or call.owner_session_id != owner or not call.open:
                raise HTTPException(404, detail={"code": "call_not_found"})
            answer = await manager.create(payload.sdp, VoiceConfigAdapter(db).read(), key,
                str(require_session(request)["session_id"]), get_settings().ha_mcp_token, logical_call_id=identity)
            answer['logical_call_id'] = identity
            return answer
        except (VoiceError, HTTPException):
            raise
        except Exception:
            raise VoiceError("provider_unavailable") from None
    except VoiceError as exc:
        raise safe_error(exc) from None


def owned_bridge(session_id: str, request: Request):
    bridge = manager.get(session_id, str(require_session(request)["session_id"]))
    if bridge is None:
        raise HTTPException(404, detail={"code": "voice_session_not_found"})
    return bridge


@router.get("/sessions/{session_id}", response_model=VoiceSessionStatus)
def session_status(session_id: str, request: Request):
    return owned_bridge(session_id, request).public_status()


@router.get("/sessions/{session_id}/registry-plan", response_model=RegistryView)
def registry_plan(session_id: str, request: Request):
    return owned_bridge(session_id, request).registry.view()


@router.post("/sessions/{session_id}/heartbeat", response_model=VoiceSessionStatus)
def session_heartbeat(session_id: str, request: Request):
    import time
    bridge = owned_bridge(session_id, request)
    bridge.last_heartbeat = time.monotonic()
    return bridge.public_status()


@router.delete("/sessions/{session_id}", response_model=VoiceSessionStatus)
async def close_session(session_id: str, request: Request):
    bridge = owned_bridge(session_id, request)
    await bridge.close()
    return bridge.public_status()
