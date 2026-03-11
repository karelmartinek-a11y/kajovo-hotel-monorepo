import base64
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, ed25519
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.aliases import AliasChoices
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.models import Device, DeviceStatus
from app.db.session import get_db
from app.security.device_crypto import compute_device_token_hash

router = APIRouter(tags=["device"])


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _b64decode_any(value: str) -> bytes:
    raw = (value or "").strip()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing base64 value")
    try:
        return base64.b64decode(raw, validate=True)
    except Exception:
        padding = "=" * ((4 - (len(raw) % 4)) % 4)
        try:
            return base64.urlsafe_b64decode((raw + padding).encode("ascii"))
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid base64") from exc


def _b64encode(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def _load_public_key(public_key_raw: str) -> tuple[bytes, str]:
    raw = (public_key_raw or "").strip()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing public key")

    key = None
    if "BEGIN PUBLIC KEY" in raw:
        try:
            key = serialization.load_pem_public_key(raw.encode("utf-8"))
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid public key") from exc
    else:
        key_bytes = _b64decode_any(raw)
        try:
            key = serialization.load_der_public_key(key_bytes)
        except Exception:
            try:
                key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), key_bytes)
            except Exception as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid public key") from exc

    if isinstance(key, ec.EllipticCurvePublicKey):
        alg = "ECDSA_P256"
    elif isinstance(key, ed25519.Ed25519PublicKey):
        alg = "ED25519"
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported public key type")

    der = key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return der, alg


def _verify_signature(*, public_key_der: bytes, nonce: bytes, signature: bytes, alg: str | None) -> bool:
    try:
        key = serialization.load_der_public_key(public_key_der)
    except Exception:
        return False

    normalized_alg = (alg or "").upper()
    try:
        if isinstance(key, ec.EllipticCurvePublicKey) or normalized_alg in {"ECDSA_P256", "ECDSA", "P256"}:
            if not isinstance(key, ec.EllipticCurvePublicKey):
                return False
            key.verify(signature, nonce, ec.ECDSA(hashes.SHA256()))
            return True
        if isinstance(key, ed25519.Ed25519PublicKey) or normalized_alg == "ED25519":
            if not isinstance(key, ed25519.Ed25519PublicKey):
                return False
            key.verify(signature, nonce)
            return True
    except Exception:
        return False

    return False


def _get_device_by_id(db: Session, device_id: str) -> Device | None:
    return db.execute(select(Device).where(Device.device_id == device_id)).scalar_one_or_none()


def _require_device_id(device_id: str | None, x_device_id: str | None) -> str:
    did = (device_id or "").strip() or (x_device_id or "").strip()
    if not did:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing device_id")
    if len(did) < 8 or len(did) > 128:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid device_id")
    return did


def _device_status_response(device: Device) -> "DeviceStatusOut":
    return DeviceStatusOut(
        status=device.status,
        activatedAt=device.activated_at.isoformat() if device.activated_at else None,
        display_name=device.display_name,
        device_id=device.device_id,
    )


class DeviceRegisterIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    device_id: str = Field(validation_alias=AliasChoices("device_id", "deviceId"), min_length=8, max_length=128)
    display_name: str | None = Field(
        default=None,
        validation_alias=AliasChoices("display_name", "displayName"),
        min_length=1,
        max_length=120,
    )
    public_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("device_public_key", "publicKey", "public_key", "public_key_b64"),
    )
    device_info: Any | None = Field(default=None, validation_alias=AliasChoices("device_info", "deviceInfo"))


class DeviceStatusOut(BaseModel):
    status: str
    activatedAt: str | None = None
    display_name: str | None = None
    device_id: str | None = None


class DeviceChallengeIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    device_id: str = Field(validation_alias=AliasChoices("device_id", "deviceId"), min_length=8, max_length=128)


class DeviceChallengeOut(BaseModel):
    nonce: str
    issuedAt: str
    challenge: str


class DeviceVerifyIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    nonce: str = Field(min_length=8, validation_alias=AliasChoices("nonce", "challenge"))
    signature: str = Field(min_length=8)
    device_id: str | None = Field(default=None, validation_alias=AliasChoices("device_id", "deviceId"))


class DeviceVerifyOut(BaseModel):
    deviceToken: str
    status: str
    device_token: str | None = None
    display_name: str | None = None


@router.post("/device/register", response_model=DeviceStatusOut)
def device_register(payload: DeviceRegisterIn, db: Session = Depends(get_db)) -> DeviceStatusOut:
    device = _get_device_by_id(db, payload.device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="REGISTRATION_DISABLED")

    display_name = payload.display_name.strip() if payload.display_name else None
    public_key_der = None
    public_key_alg = None
    if payload.public_key:
        public_key_der, public_key_alg = _load_public_key(payload.public_key)

    device.last_seen_at = _utc_now()
    if display_name and not device.display_name:
        device.display_name = display_name
    if public_key_der is not None and (device.public_key is None or device.public_key_alg is None):
        device.public_key = public_key_der
        device.public_key_alg = public_key_alg
    if payload.device_info is not None:
        device.device_info_json = json.dumps(payload.device_info, ensure_ascii=False)
    db.add(device)
    db.commit()
    db.refresh(device)
    return _device_status_response(device)


@router.get("/device/status", response_model=DeviceStatusOut)
def device_status(
    request: Request,
    device_id: str | None = None,
    x_device_id: str | None = Header(default=None, alias="X-Device-Id"),
    db: Session = Depends(get_db),
) -> DeviceStatusOut:
    del request
    did = _require_device_id(device_id, x_device_id)
    device = _get_device_by_id(db, did)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not registered")

    device.last_seen_at = _utc_now()
    db.add(device)
    db.commit()
    db.refresh(device)
    return _device_status_response(device)


@router.get("/device/{device_id}/status", response_model=DeviceStatusOut)
def device_status_compat(
    request: Request,
    device_id: str,
    db: Session = Depends(get_db),
) -> DeviceStatusOut:
    return device_status(request=request, device_id=device_id, db=db)


@router.post("/device/challenge", response_model=DeviceChallengeOut)
def device_challenge(payload: DeviceChallengeIn, db: Session = Depends(get_db)) -> DeviceChallengeOut:
    device = _get_device_by_id(db, payload.device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not registered")
    if device.status == DeviceStatus.REVOKED.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Device revoked")
    if device.status != DeviceStatus.ACTIVE.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Device not active")
    if not device.public_key:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Device public key missing")

    nonce = _b64encode(secrets.token_bytes(32))
    issued_at = _utc_now()
    device.last_challenge_nonce = nonce
    device.last_challenge_issued_at = issued_at
    device.last_seen_at = issued_at
    db.add(device)
    db.commit()

    return DeviceChallengeOut(
        nonce=nonce,
        issuedAt=issued_at.isoformat(),
        challenge=nonce,
    )


@router.post("/device/verify", response_model=DeviceVerifyOut)
def device_verify(
    payload: DeviceVerifyIn,
    x_device_id: str | None = Header(default=None, alias="X-Device-Id"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DeviceVerifyOut:
    did = _require_device_id(payload.device_id, x_device_id)
    device = _get_device_by_id(db, did)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not registered")
    if device.status == DeviceStatus.REVOKED.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Device revoked")
    if device.status != DeviceStatus.ACTIVE.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Device not active")
    if not device.public_key or not device.public_key_alg:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Device public key missing")
    if not device.last_challenge_nonce or not device.last_challenge_issued_at:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Challenge not found")

    nonce_bytes = _b64decode_any(payload.nonce)
    expected_nonce = _b64decode_any(device.last_challenge_nonce)
    if not secrets.compare_digest(expected_nonce, nonce_bytes):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Challenge mismatch")

    issued_at = device.last_challenge_issued_at
    if issued_at.tzinfo is None:
        issued_at = issued_at.replace(tzinfo=timezone.utc)
    if _utc_now() - issued_at > timedelta(seconds=settings.device_challenge_max_age_seconds):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Challenge expired")

    signature_bytes = _b64decode_any(payload.signature)
    if not _verify_signature(
        public_key_der=device.public_key,
        nonce=nonce_bytes,
        signature=signature_bytes,
        alg=device.public_key_alg,
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")

    token = secrets.token_urlsafe(48)
    device.token_hash = compute_device_token_hash(token, settings.device_token_pepper or None)
    device.last_challenge_nonce = None
    device.last_challenge_issued_at = None
    device.last_seen_at = _utc_now()
    db.add(device)
    db.commit()

    return DeviceVerifyOut(
        deviceToken=token,
        device_token=token,
        status=device.status,
        display_name=device.display_name,
    )
