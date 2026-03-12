import hashlib
import hmac
import json
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import (
    DeviceChallengeRequest,
    DeviceChallengeResponse,
    DeviceRegisterRequest,
    DeviceRegisterResponse,
    DeviceStatusResponse,
    DeviceVerifyRequest,
    DeviceVerifyResponse,
)
from app.config import get_settings
from app.db.models import DeviceAccessToken, DeviceChallenge, DeviceRegistration
from app.db.session import get_db

router = APIRouter(prefix="/api/v1/device", tags=["device"])
DEVICE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._:-]{2,127}$")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _normalize_device_id(raw_device_id: str) -> str:
    device_id = raw_device_id.strip().lower()
    if not DEVICE_ID_PATTERN.match(device_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid device_id format")
    return device_id


def _require_device_by_secret(
    db: Session,
    *,
    device_id: str,
    device_secret: str,
) -> DeviceRegistration:
    normalized_device_id = _normalize_device_id(device_id)
    device = db.scalar(
        select(DeviceRegistration).where(DeviceRegistration.device_id == normalized_device_id)
    )
    if device is None or not secrets.compare_digest(device.secret_hash, _sha256(device_secret)):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid device credentials")
    if device.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device is not active")
    return device


def _resolve_device_from_bearer(
    db: Session,
    authorization: str | None,
) -> tuple[DeviceRegistration, DeviceAccessToken | None]:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    prefix = "bearer "
    if not authorization.lower().startswith(prefix):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bearer token")
    raw_token = authorization[len(prefix):].strip()
    if len(raw_token) < 24:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bearer token")

    now = _utc_now()
    token_hash = _sha256(raw_token)
    token = db.scalar(
        select(DeviceAccessToken).where(
            DeviceAccessToken.token_hash == token_hash,
            DeviceAccessToken.revoked_at.is_(None),
        )
    )
    if token is None or (_as_utc(token.expires_at) or now) <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token expired or invalid")

    device = db.scalar(
        select(DeviceRegistration).where(DeviceRegistration.device_id == token.device_id)
    )
    if device is None or device.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device is not active")
    return device, token


@router.post("/register", response_model=DeviceRegisterResponse)
def register_device(
    payload: DeviceRegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> DeviceRegisterResponse:
    settings = get_settings()
    if not secrets.compare_digest(payload.bootstrap_key, settings.device_bootstrap_key):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid bootstrap key")

    now = _utc_now()
    device_id = _normalize_device_id(payload.device_id)
    display_name = (payload.display_name or device_id).strip()[:255] or device_id
    plain_secret = secrets.token_urlsafe(32)
    secret_hash = _sha256(plain_secret)

    device = db.scalar(select(DeviceRegistration).where(DeviceRegistration.device_id == device_id))
    if device is None:
        device = DeviceRegistration(
            device_id=device_id,
            display_name=display_name,
            status="active",
            secret_hash=secret_hash,
            registered_at=now,
            last_seen_at=now,
        )
    else:
        device.display_name = display_name
        device.status = "active"
        device.secret_hash = secret_hash
        device.last_seen_at = now

    db.add(device)
    db.flush()
    db.query(DeviceAccessToken).filter(DeviceAccessToken.device_id == device_id).update(
        {DeviceAccessToken.revoked_at: now}
    )
    db.commit()

    request.state.audit_detail_override = json.dumps(
        {"device_id": device_id, "action": "register"},
        ensure_ascii=False,
    )
    return DeviceRegisterResponse(
        device_id=device_id,
        display_name=device.display_name,
        status=device.status,
        device_secret=plain_secret,
        registered_at=device.registered_at,
    )


@router.get("/status", response_model=DeviceStatusResponse)
def device_status(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    device_id: str | None = None,
    x_device_secret: str | None = Header(default=None),
) -> DeviceStatusResponse:
    now = _utc_now()
    token_expiry: datetime | None = None

    if authorization:
        device, token = _resolve_device_from_bearer(db, authorization)
        if token is not None:
            token.last_used_at = now
            token_expiry = token.expires_at
            db.add(token)
    else:
        if not device_id or not x_device_secret:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing device credentials")
        device = _require_device_by_secret(db, device_id=device_id, device_secret=x_device_secret)

    device.last_seen_at = now
    db.add(device)
    db.commit()
    return DeviceStatusResponse(
        device_id=device.device_id,
        display_name=device.display_name,
        status=device.status,
        registered_at=device.registered_at,
        last_seen_at=device.last_seen_at,
        token_expires_at=token_expiry,
    )


@router.post("/challenge", response_model=DeviceChallengeResponse)
def issue_challenge(
    payload: DeviceChallengeRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> DeviceChallengeResponse:
    settings = get_settings()
    now = _utc_now()
    device = _require_device_by_secret(
        db,
        device_id=payload.device_id,
        device_secret=payload.device_secret,
    )
    challenge_id = uuid.uuid4().hex
    challenge_value = secrets.token_hex(32)
    expires_at = now + timedelta(seconds=max(60, settings.device_challenge_ttl_seconds))

    db.add(
        DeviceChallenge(
            challenge_id=challenge_id,
            device_id=device.device_id,
            challenge=challenge_value,
            issued_at=now,
            expires_at=expires_at,
        )
    )
    device.last_seen_at = now
    db.add(device)
    db.commit()
    request.state.audit_detail_override = json.dumps(
        {"device_id": device.device_id, "action": "challenge"},
        ensure_ascii=False,
    )
    return DeviceChallengeResponse(
        challenge_id=challenge_id,
        challenge=challenge_value,
        expires_at=expires_at,
    )


@router.post("/verify", response_model=DeviceVerifyResponse)
def verify_challenge(
    payload: DeviceVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> DeviceVerifyResponse:
    settings = get_settings()
    now = _utc_now()
    device = _require_device_by_secret(
        db,
        device_id=payload.device_id,
        device_secret=payload.device_secret,
    )

    challenge = db.scalar(
        select(DeviceChallenge).where(
            DeviceChallenge.challenge_id == payload.challenge_id,
            DeviceChallenge.device_id == device.device_id,
            DeviceChallenge.consumed_at.is_(None),
        )
    )
    if challenge is None or (_as_utc(challenge.expires_at) or now) <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Challenge expired or invalid")

    expected_signature = hmac.new(
        payload.device_secret.encode("utf-8"),
        challenge.challenge.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not secrets.compare_digest(expected_signature, payload.signature.strip().lower()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid challenge signature")

    raw_token = secrets.token_urlsafe(48)
    expires_at = now + timedelta(seconds=max(300, settings.device_token_ttl_seconds))
    db.add(
        DeviceAccessToken(
            device_id=device.device_id,
            token_hash=_sha256(raw_token),
            issued_at=now,
            expires_at=expires_at,
            last_used_at=now,
        )
    )
    challenge.consumed_at = now
    device.last_seen_at = now
    db.add(challenge)
    db.add(device)
    db.commit()
    request.state.audit_detail_override = json.dumps(
        {"device_id": device.device_id, "action": "verify"},
        ensure_ascii=False,
    )
    return DeviceVerifyResponse(token=raw_token, expires_at=expires_at)
