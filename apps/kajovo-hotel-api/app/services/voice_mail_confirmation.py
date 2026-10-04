"""Mail-specific durable audio consent; content lives only in the live sideband."""
import base64
import hashlib
import json
import os
from datetime import datetime
from types import SimpleNamespace

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import update

from app.db.models import VoiceMailOperation
from app.security.auth import _as_utc
from app.services.voice_core import master_key
from app.services.voice_mail import MailError, validate_content
from app.services.voice_registry import RegistryConfirmation
from app.time_utils import utc_now


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def draft_hash(draft):
    # Exact JSON array from installation package src/mime.ts draftHash, UTF-8.
    values = [draft[k] for k in ("account", "from", "to", "cc", "bcc", "subject", "text_body", "html_body", "reply_to", "in_reply_to", "references")]
    return hashlib.sha256(json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def crypt_token(value, identity, *, decrypt=False):
    aad = ("voice-mail:candidate-token:v1:" + identity).encode()
    if decrypt:
        raw = base64.b64decode(value, validate=True)
        return AESGCM(master_key()).decrypt(raw[:12], raw[12:], aad).decode()
    nonce = os.urandom(12)
    return base64.b64encode(nonce + AESGCM(master_key()).encrypt(nonce, value.encode(), aad)).decode()


READBACK = {
    "cs": ("E-mail k odeslání.", "Od", "Komu", "Kopie", "Skrytá kopie", "Předmět", "Celý text", "Potvrzujete odeslání tohoto přesného e-mailu? Odpovězte ano nebo ne."),
    "en": ("Email to send.", "From", "To", "Cc", "Bcc", "Subject", "Full text", "Do you confirm sending this exact email? Answer yes or no."),
    "de": ("E-Mail zum Senden.", "Von", "An", "Kopie", "Blindkopie", "Betreff", "Vollständiger Text", "Bestätigen Sie das Senden genau dieser E-Mail? Antworten Sie ja oder nein."),
    "sk": ("E-mail na odoslanie.", "Od", "Komu", "Kópia", "Skrytá kópia", "Predmet", "Celý text", "Potvrdzujete odoslanie tohto presného e-mailu? Odpovedzte áno alebo nie."),
}


def script(draft, language):
    validate_content(draft)
    t = READBACK[language]
    fields = [draft["from"], ", ".join(draft["to"]), ", ".join(draft["cc"]), ", ".join(draft["bcc"]), draft["subject"], draft["text_body"]]
    text = t[0] + "\n" + "\n".join(label + ": " + value for label, value in zip(t[1:7], fields)) + "\n" + t[7]
    if len(text) > 4500:
        raise MailError("READBACK_TOO_LARGE_SHORTEN_DRAFT")
    return text


class MailConfirmation(RegistryConfirmation):
    """Reuse proven provider event ordering, with an independent mail journal/domain."""
    def __init__(self, owner, voice_id, factory):
        super().__init__(owner, voice_id, factory)
        self.operation_id = None
        self.preview = None
        self.playback_started = False
        self.playback_drained = False

    def begin_readback(self, response_id):
        self.playback_started = self.playback_drained = False
        return super().begin_readback(response_id)

    def persist(self, **fields):
        if not self.operation_id:
            return
        with self.factory() as db:
            row = db.get(VoiceMailOperation, self.operation_id)
            if row and not row.send_request_id:
                row.state = self.state
                for key, value in fields.items():
                    setattr(row, key, value)
                db.commit()

    def view(self):
        self.valid()
        return {"state": self.state, "attempts": self.attempts, "preview": self.preview if self.valid() else None}

    def prepare(self, candidate, draft, language, operation_id):
        self.invalidate()
        expires = datetime.fromisoformat(candidate["expires_at"].replace("Z", "+00:00"))
        if not expires.tzinfo or not 0 < (expires - utc_now()).total_seconds() <= 310:
            raise MailError("CONFIRMATION_EXPIRED")
        if candidate["draft_ref"] != draft["draft_ref"] or candidate["draft_version"] != draft["draft_version"] or candidate["body_hash"] != draft_hash(draft):
            raise MailError("VERSION_CONFLICT")
        for field, source in [("sender", "from"), ("to", "to"), ("cc", "cc"), ("bcc", "bcc"), ("subject", "subject")]:
            if candidate[field] != draft[source]:
                raise MailError("CONTRACT_MISMATCH")
        text = script(draft, language)
        encrypted = crypt_token(candidate["confirmation_token"], operation_id)
        with self.factory() as db:
            row = db.get(VoiceMailOperation, operation_id)
            if not row or row.owner_session_id != self.owner or row.state != "pending":
                raise MailError("INVALID_CONFIRMATION")
            row.candidate_id, row.draft_ref, row.draft_version = candidate["send_candidate_id"], draft["draft_ref"], draft["draft_version"]
            row.body_hash, row.encrypted_token, row.expires_at, row.state = candidate["body_hash"], encrypted, expires, "prepared"
            db.commit()
        self.operation_id = operation_id
        self.plan = SimpleNamespace(id=candidate["send_candidate_id"], expires_at=candidate["expires_at"], requires_confirmation=True)
        self.preview = {k: v for k, v in candidate.items() if k != "confirmation_token"}
        self.preview["text_body"] = draft["text_body"]
        self.text, self.language, self.state = text, language, "prepared"
        self.attempts, self.completed, self.response_id = 0, False, None
        self.next_audio_id = None
        self.readback_pending, self.expiry_pending = True, False

    def event(self, event):
        typ = event.get("type")
        if typ == "response.created":
            event = {**event, "response": {**event.get("response", {}), "metadata": {
                "kvha_readback": (event.get("response", {}).get("metadata") or {}).get("mail_readback")}}}
        if self.state in {"reading", "awaiting_confirmation", "confirmed"}:
            if typ == "output_audio_buffer.cleared":
                self.invalidate()
                return None
            if typ == "output_audio_buffer.started" and self.state in {"reading", "awaiting_confirmation"}:
                if event.get("response_id") != self.response_id:
                    self.invalidate()
                else:
                    self.playback_started = True
            if typ == "response.created" and self.state in {"reading", "awaiting_confirmation"} and event.get("response", {}).get("id") != self.response_id:
                self.invalidate()
                return None
        if typ == "output_audio_buffer.stopped":
            # A foreign/global drain alone cannot prove this candidate was played.
            if event.get("response_id") != self.response_id or not self.playback_started:
                return None
            self.playback_drained = True
            if not self.completed:
                return None
        action = super().event(event)
        if typ == "response.done" and self.completed and self.playback_started and self.playback_drained and self.state == "reading":
            super().event({"type": "output_audio_buffer.stopped", "response_id": self.response_id})
        return action

    def reserve(self, db, candidate_id, request_id):
        row = db.get(VoiceMailOperation, self.operation_id) if self.operation_id else None
        if not row or row.owner_session_id != self.owner or row.voice_session_id != self.voice_id or row.candidate_id != candidate_id:
            raise MailError("INVALID_CONFIRMATION")
        if row.send_request_id:
            raise MailError("SEND_ALREADY_RESERVED")
        if not self.valid() or self.state != "confirmed" or row.state != "confirmed" or not row.confirmation_id or (_as_utc(row.expires_at) or utc_now()) <= utc_now():
            raise MailError("VOICE_CONFIRMATION_REQUIRED")
        changed = db.execute(update(VoiceMailOperation).where(VoiceMailOperation.id == row.id,
            VoiceMailOperation.state == "confirmed", VoiceMailOperation.send_request_id.is_(None)).values(state="sending", send_request_id=request_id)).rowcount
        if changed != 1:
            raise MailError("SEND_ALREADY_RESERVED")
        return crypt_token(row.encrypted_token, row.id, decrypt=True)
