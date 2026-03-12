from __future__ import annotations

import json
from typing import Any

SENSITIVE_KEYS = {
    "password",
    "old_password",
    "new_password",
    "confirm_password",
    "device_secret",
    "secret",
    "secret_hash",
    "bootstrap_key",
    "token",
    "token_hash",
    "signature",
    "password_encrypted",
}


def sanitize_for_audit(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, nested in value.items():
            normalized_key = str(key).strip().lower()
            if normalized_key in SENSITIVE_KEYS or normalized_key.endswith("_token"):
                sanitized[str(key)] = "***"
            else:
                sanitized[str(key)] = sanitize_for_audit(nested)
        return sanitized
    if isinstance(value, list):
        return [sanitize_for_audit(item) for item in value]
    return value


def audit_detail_json(value: Any) -> str:
    return json.dumps(sanitize_for_audit(value), ensure_ascii=False, sort_keys=True)
