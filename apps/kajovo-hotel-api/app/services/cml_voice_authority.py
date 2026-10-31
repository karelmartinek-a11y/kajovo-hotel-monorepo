"""Current CML web authority for original voice background work, without cookies."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from uuid import UUID

import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy.exc import IntegrityError

from app.db.models import CmlVoiceAuthority as AuthorityRow
from app.security.cml_assertion import ISSUER
from app.services.cml_identity import resolve_identity

ENDPOINT = "https://kajovocml.hcasc.cz/internal/web-voice-authority"


class VoiceAuthorityDenied(ValueError):
    pass


def binding(claims):
    sid, epoch, subject, native_id = (claims.get(key) for key in ("sid", "epoch", "sub", "nativeId"))
    if (not isinstance(sid, str) or str(UUID(sid)) != sid or type(epoch) is not int
            or epoch < 1 or claims.get("iss") != ISSUER or claims.get("aud") != "hotel" or claims.get("role") != "admin"
            or claims.get("method") not in {"GET", "HEAD", "POST", "DELETE"}
            or not re.match(r"^/cml-web/api/v1/admin/voice-core/(?:calls|sessions)(?:[/?]|$)", str(claims.get("path", "")))):
        raise VoiceAuthorityDenied("voice_authority_denied")
    if subject == "KRMAR78":
        if native_id is not None:
            raise VoiceAuthorityDenied("voice_authority_denied")
    elif (not isinstance(subject, str) or not subject.startswith("user:")
          or str(UUID(subject[5:])) != subject[5:] or not isinstance(native_id, str)
          or not re.fullmatch(r"[1-9][0-9]{0,17}", native_id)):
        raise VoiceAuthorityDenied("voice_authority_denied")
    return {"sid": sid, "epoch": epoch, "sub": subject, "nativeId": native_id}


class CmlVoiceAuthority:
    def __init__(self, factory, key_loader, *, client=None):
        self.factory, self.key_loader = factory, key_loader
        self.client = client if client is not None else httpx.Client(timeout=2.0, follow_redirects=False, trust_env=False)

    def close(self):
        self.client.close()

    def available(self):
        try:
            self._key()
            return True
        except Exception:
            return False

    def _key(self):
        value = base64.b64decode(self.key_loader(), validate=True)
        if len(value) != 32:
            raise VoiceAuthorityDenied("voice_authority_unavailable")
        return value

    @staticmethod
    def _aad(value):
        return b"kajovo-cml-voice-authority/1:" + json.dumps(value, sort_keys=True, separators=(",", ":")).encode()

    def _seal(self, token, value):
        nonce = os.urandom(12)
        return base64.b64encode(nonce + AESGCM(self._key()).encrypt(nonce, token.encode(), self._aad(value))).decode()

    def _open(self, row, value):
        payload = base64.b64decode(row.token_cipher, validate=True)
        token = AESGCM(self._key()).decrypt(payload[:12], payload[12:], self._aad(value)).decode()
        if not hmac.compare_digest(hashlib.sha256(token.encode()).hexdigest(), row.token_hash):
            raise VoiceAuthorityDenied("voice_authority_denied")
        return token

    def _current(self, token, value):
        with self.client.stream("POST", ENDPOINT, headers={"Authorization": "Bearer " + token}, json=value) as response:
            if response.status_code != 200:
                raise VoiceAuthorityDenied("voice_authority_denied")
            chunks, size = [], 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > 4096:
                    raise VoiceAuthorityDenied("voice_authority_denied")
                chunks.append(chunk)
            result = json.loads(b"".join(chunks))
            if not isinstance(result, dict) or set(result) != {"active"} or result["active"] is not True:
                raise VoiceAuthorityDenied("voice_authority_denied")

    @staticmethod
    def _local(db, value):
        identity = resolve_identity(db, {**value, "role": "admin"}, "admin")
        if not identity["public"]["admin"] or identity["public"]["active_role"] != "admin":
            raise VoiceAuthorityDenied("voice_authority_denied")
        return identity["state"]["_kajovo_auth_session"]

    @staticmethod
    def _same(row, value, digest):
        expires = row.expires_at.replace(tzinfo=timezone.utc) if row.expires_at.tzinfo is None else row.expires_at
        if (row.subject != value["sub"] or row.native_id != value["nativeId"]
                or row.epoch != value["epoch"] or not hmac.compare_digest(row.token_hash, digest)
                or expires <= datetime.now(timezone.utc)):
            raise VoiceAuthorityDenied("voice_authority_denied")

    def admit(self, claims, token, *, create=False):
        """Called only after the original HTTP signature and nonce were verified."""
        try:
            value = binding(claims)
            if create and (claims["method"] != "POST" or claims["path"].split("?", 1)[0] != "/cml-web/api/v1/admin/voice-core/calls"):
                raise VoiceAuthorityDenied("voice_authority_denied")
            if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
                raise VoiceAuthorityDenied("voice_authority_denied")
            digest = hashlib.sha256(token.encode()).hexdigest()
            if not hmac.compare_digest(digest, claims.get("voiceAuthorityHash", "")):
                raise VoiceAuthorityDenied("voice_authority_denied")
            with self.factory() as db:
                self._local(db, value)
                row = db.get(AuthorityRow, value["sid"])
                if row:
                    self._same(row, value, digest)
                    self._open(row, value)
                elif not create:
                    raise VoiceAuthorityDenied("voice_authority_required")
            self._current(token, value)
            with self.factory() as db:
                identity = self._local(db, value)
                row = db.get(AuthorityRow, value["sid"])
                if row is None:
                    if not create:
                        raise VoiceAuthorityDenied("voice_authority_required")
                    db.add(AuthorityRow(sid=value["sid"], subject=value["sub"], native_id=value["nativeId"],
                                        epoch=value["epoch"], token_hash=digest, token_cipher=self._seal(token, value),
                                        expires_at=datetime.now(timezone.utc) + timedelta(hours=8)))
                    try:
                        db.commit()
                    except IntegrityError:
                        db.rollback()
                    row = db.get(AuthorityRow, value["sid"])
                self._same(row, value, digest)
                self._open(row, value)
                return identity
        except Exception:
            raise VoiceAuthorityDenied("voice_authority_denied") from None

    def identity(self, owner):
        if not isinstance(owner, str) or not owner.startswith("cml:"):
            return None
        try:
            sid = owner[4:]
            if str(UUID(sid)) != sid:
                return None
            with self.factory() as db:
                row = db.get(AuthorityRow, sid)
                if row is None:
                    return None
                value = {"sid": row.sid, "epoch": row.epoch, "sub": row.subject, "nativeId": row.native_id}
                self._same(row, value, row.token_hash)
                token = self._open(row, value)
            self._current(token, value)
            with self.factory() as db:
                return self._local(db, value)
        except Exception:
            return None


@lru_cache(maxsize=1)
def default_authority():
    from app.config import get_settings
    from app.db.session import SessionLocal
    return CmlVoiceAuthority(SessionLocal, lambda: get_settings().voice_master_key)


def close_default_authority():
    if default_authority.cache_info().currsize:
        default_authority().close()
        default_authority.cache_clear()
