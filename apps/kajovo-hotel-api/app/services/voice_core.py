import base64
import binascii
import logging
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from voice_core_server import VoiceCoreConfig, VoiceError

from app.config import get_settings
from app.db.models import VoiceCoreSettings

logger = logging.getLogger("kajovo.voice")
AAD = b"voice-core:openai-api-key:v1"


class VoiceTelemetry:
    def emit(self, event: str, attributes: dict[str, str | int | float]) -> None:
        logger.info(event, extra={"context": attributes})


def master_key() -> bytes:
    try:
        key = base64.b64decode(get_settings().voice_master_key, validate=True)
        if len(key) != 32:
            raise ValueError()
        return key
    except (ValueError, binascii.Error):
        raise VoiceError("secret_store_unavailable") from None


def get_record(db: Session) -> VoiceCoreSettings:
    record = db.get(VoiceCoreSettings, 1)
    if record is None:
        record = VoiceCoreSettings(id=1, config_json=VoiceCoreConfig().model_dump(), revision=0)
        db.add(record)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        record = db.scalar(select(VoiceCoreSettings).where(VoiceCoreSettings.id == 1))
    return record


class VoiceConfigAdapter:
    def __init__(self, db: Session):
        self.db = db

    def read(self) -> VoiceCoreConfig:
        return VoiceCoreConfig.model_validate(get_record(self.db).config_json)


class VoiceSecretAdapter:
    def __init__(self, db: Session):
        self.db = db

    def configured(self) -> bool:
        return bool(get_record(self.db).encrypted_api_key)

    def read(self) -> str:
        key = master_key()
        cipher = get_record(self.db).encrypted_api_key
        if not cipher:
            raise VoiceError("missing_api_key")
        try:
            payload = base64.b64decode(cipher, validate=True)
            return AESGCM(key).decrypt(payload[:12], payload[12:], AAD).decode()
        except (ValueError, InvalidTag, UnicodeError):
            raise VoiceError("secret_store_unavailable") from None

    def save(self, value: str) -> None:
        key = master_key()
        nonce = os.urandom(12)
        cipher = base64.b64encode(nonce + AESGCM(key).encrypt(nonce, value.encode(), AAD)).decode()
        get_record(self.db)
        self.db.execute(update(VoiceCoreSettings).where(VoiceCoreSettings.id == 1).values(
            encrypted_api_key=cipher, revision=VoiceCoreSettings.revision + 1))
        self.db.commit()

    def delete(self) -> None:
        get_record(self.db)
        self.db.execute(update(VoiceCoreSettings).where(VoiceCoreSettings.id == 1).values(
            encrypted_api_key=None, revision=VoiceCoreSettings.revision + 1))
        self.db.commit()
