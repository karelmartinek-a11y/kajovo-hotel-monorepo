"""Versioned, bounded wire contract. Content never enters ordinary logging."""
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4
import re

from pydantic import BaseModel, ConfigDict, Field

SCHEMA = 1
LIMITS = {"technical": 2_000_000_000, "text": 3_000_000_000,
          "audio": 9_000_000_000, "incident": 1_000_000_000}
MAX_CHUNK = 1_048_576
ID_PATTERN = r"^[a-zA-Z0-9_-]{1,128}$"


def utc():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return uuid4().hex


class Closed(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Event(Closed):
    schema_version: Literal[1] = 1
    event_id: str = Field(default_factory=uid, pattern=ID_PATTERN)
    source: Literal["browser", "server", "provider", "mcp", "memory"]
    sequence: int = Field(ge=0)
    timestamp: datetime
    monotonic_ms: float = Field(ge=0)
    event_type: str = Field(pattern=r"^[a-zA-Z0-9_.-]{1,100}$")
    severity: Literal["info", "warning", "error"] = "info"
    connection_id: str | None = Field(default=None, pattern=ID_PATTERN)
    provider_call_id: str | None = Field(default=None, max_length=128)
    provider_event_id: str | None = Field(default=None, max_length=128)
    response_id: str | None = Field(default=None, max_length=128)
    item_id: str | None = Field(default=None, max_length=128)
    turn_id: str | None = Field(default=None, max_length=128)
    function_id: str | None = Field(default=None, max_length=128)
    operation_id: str | None = Field(default=None, max_length=128)
    delivery_id: str | None = Field(default=None, max_length=128)
    request_id: str | None = Field(default=None, max_length=128)
    remote_request_id: str | None = Field(default=None, max_length=128)
    segment_id: str | None = Field(default=None, pattern=ID_PATTERN)
    generation: int | None = Field(default=None, ge=1)
    attributes: dict = Field(default_factory=dict)
    content: dict | None = None


# Metadata from unknown producers is discarded, not implicitly trusted as safe.
META_KEYS = frozenset("model status code phase locations exception_class http_status duration_ms attempt ready enabled muted ended track_id mime codecs bytes dropped_bytes complete reason received_at input_tokens output_tokens total_tokens cached_tokens modality release revision constraints settings peer_state ice_state channel_state playback_state pending count sequence gap duplicates missing_usage input_token_details output_token_details usage bitrate sample_rate channels connection_state audio_context_state packets_lost jitter round_trip_time audio_level echo_return_loss echo_return_loss_enhancement speaker_gate capture_start_ms capture_end_ms boundary_partial checksum source_id final user_agent category failures".split())
SECRET_KEYS = frozenset("authorization proxy_authorization cookie set_cookie api_key apikey password passwd secret access_token refresh_token bearer confirmation_token smtp_token signed_url download_url attachment_url".split())
SECRET_KEY = re.compile(r"(?:token|secret|password|passwd|api.?key|authorization|cookie)", re.I)
SECRET_TEXT = re.compile(r"(?i)(?:Bearer\s+[a-z0-9._~+/=-]+|sk-(?:proj-)?[a-z0-9_-]{8,}|(?:password|heslo|api[_ -]?key|refresh[_ -]?token|confirmation[_ -]?token)\s*[:=]\s*[^\s,;]+)")
URL_SECRET = re.compile(r"https?://[^\s<>\"']+", re.I)


def redact_text(value: str) -> str:
    value = SECRET_TEXT.sub("[REDACTED]", value)
    def url(match):
        from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
        parts = urlsplit(match.group())
        if parts.username or parts.password:
            return "[REDACTED_URL]"
        query = parse_qsl(parts.query, keep_blank_values=True)
        if any(SECRET_KEY.search(k) or k.lower() in {"signature", "sig", "credential", "key"} for k, _ in query):
            return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode([(k, "[REDACTED]") for k, _ in query]), ""))
        return match.group()
    return URL_SECRET.sub(url, value)


def redact(value, depth=0):
    if depth > 16:
        return "[DEPTH_LIMIT]"
    if isinstance(value, dict):
        return {str(k)[:128]: "[REDACTED]" if SECRET_KEY.search(str(k)) or str(k).casefold().replace("-", "_") in SECRET_KEYS else redact(v, depth + 1) for k, v in list(value.items())[:256]}
    if isinstance(value, list):
        return [redact(v, depth + 1) for v in value[:256]]
    if isinstance(value, str):
        return redact_text(value[:100_000])
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return "[UNSUPPORTED]"


def metadata(value):
    return {k: redact(v) for k, v in value.items() if k in META_KEYS}


def safe_exception(exc: BaseException, phase: str, code="collection_failed"):
    import traceback
    # Locations only: no exception repr, source lines, locals, provider body or binds.
    frames = traceback.extract_tb(exc.__traceback__)[-8:]
    return {"phase": phase, "code": code, "exception_class": type(exc).__name__,
            "locations": [{"file": frame.filename.rsplit("/", 1)[-1], "line": frame.lineno, "function": frame.name} for frame in frames]}
