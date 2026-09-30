from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from sqlalchemy import update
from sqlalchemy.orm import Session
from voice_core_server import RealtimeSessionClient, VoiceCoreConfig, VoiceError, catalog

from app.db.models import VoiceCoreSettings
from app.db.session import get_db
from app.security.auth import require_session
from app.services.smart_technologies import (
    TOOL_INSTRUCTIONS,
    SmartResult,
    SmartUpstreamError,
    VoiceToolCall,
    execute_tool,
    tool_definition,
)
from app.services.smart_technologies import (
    configured as smart_configured,
)
from app.services.voice_core import (
    VoiceConfigAdapter,
    VoiceSecretAdapter,
    VoiceTelemetry,
    get_record,
)


class VoiceAuthAdapter:
    def __init__(self, request: Request):
        self.request = request

    def authorize(self) -> str:
        session = require_session(self.request)
        if session.get("actor_type") != "admin" or session.get("role") != "admin":
            raise HTTPException(403, detail="Administrator access required")
        return str(session["email"])


def require_voice_admin(request: Request) -> None:
    VoiceAuthAdapter(request).authorize()


router = APIRouter(prefix="/api/v1/admin/voice-core", tags=["voice-core"],
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
    sdp: str = Field(min_length=8, max_length=65536)
    revision: int = Field(ge=0)


class VoiceSessionRead(BaseModel):
    sdp: str
    model: str


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
async def create_session(payload: VoiceSessionWrite, db: Db):
    record = get_record(db)
    if payload.revision != record.revision:
        raise HTTPException(409, detail={"code": "configuration_conflict"})
    if not payload.sdp.startswith("v=0"):
        raise HTTPException(422, detail={"code": "invalid_sdp"})
    try:
        key = VoiceSecretAdapter(db).read()
        sdp, model = await RealtimeSessionClient(VoiceTelemetry(),
            tools=[tool_definition()] if smart_configured() else None,
            tool_instructions=TOOL_INSTRUCTIONS if smart_configured() else "").create(
            payload.sdp, VoiceConfigAdapter(db).read(), key)
    except VoiceError as exc:
        raise safe_error(exc) from None
    return VoiceSessionRead(sdp=sdp, model=model)


@router.post("/tools", response_model=SmartResult, response_model_exclude_none=True)
async def call_tool(payload: VoiceToolCall, request: Request):
    session = require_session(request)
    try:
        return await execute_tool(payload, str(session["session_id"]))
    except SmartUpstreamError as exc:
        raise HTTPException(exc.status, detail={"code": exc.code}) from None
