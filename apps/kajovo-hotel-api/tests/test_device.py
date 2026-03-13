import hashlib
import hmac
import json
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path

ResponseData = dict[str, object] | list[dict[str, object]] | None


def raw_request(
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    payload: dict[str, object] | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, ResponseData]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    merged_headers = headers.copy() if headers else {}
    if payload is not None:
        merged_headers.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(
        url=f"{base_url}{path}",
        data=data,
        headers=merged_headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, json.loads(raw) if raw else None


def _secret_hash(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def seed_device(
    db_path: Path,
    *,
    device_id: str,
    status: str,
    device_secret: str,
    display_name: str | None = None,
) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO device_registrations
            (device_id, display_name, status, secret_hash)
            VALUES (?, ?, ?, ?)
            """,
            (device_id, display_name or device_id, status, _secret_hash(device_secret)),
        )
        connection.commit()


def test_device_registration_rejects_invalid_bootstrap_key(api_base_url: str) -> None:
    status, body = raw_request(
        api_base_url,
        "/api/v1/device/register",
        method="POST",
        payload={
            "device_id": "unknown-device-01",
            "display_name": "Front Desk Tablet",
            "bootstrap_key": "wrong-bootstrap-key",
        },
    )
    assert status == 403
    assert body == {"detail": "Invalid bootstrap key"}


def test_known_device_can_register_and_read_status(api_base_url: str) -> None:
    status, body = raw_request(
        api_base_url,
        "/api/v1/device/register",
        method="POST",
        payload={
            "device_id": "known-device-01",
            "display_name": "Housekeeping Phone",
            "bootstrap_key": "change-me-device-bootstrap-key",
        },
    )
    assert status == 200
    assert isinstance(body, dict)
    assert body["status"] == "active"
    assert body["display_name"] == "Housekeeping Phone"
    secret = str(body["device_secret"])

    status, status_body = raw_request(
        api_base_url,
        "/api/v1/device/status?device_id=known-device-01",
        headers={"x-device-secret": secret},
    )
    assert status == 200
    assert isinstance(status_body, dict)
    assert status_body["device_id"] == "known-device-01"
    assert status_body["status"] == "active"


def test_active_device_challenge_verify_issues_token(api_base_url: str, api_db_path: Path) -> None:
    device_secret = "device-secret-for-tests"
    seed_device(
        api_db_path,
        device_id="active-device-01",
        status="active",
        display_name="Front Desk",
        device_secret=device_secret,
    )

    status, challenge = raw_request(
        api_base_url,
        "/api/v1/device/challenge",
        method="POST",
        payload={"device_id": "active-device-01", "device_secret": device_secret},
    )
    assert status == 200
    assert isinstance(challenge, dict)

    signature = hmac.new(
        device_secret.encode("utf-8"),
        str(challenge["challenge"]).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    status, verified = raw_request(
        api_base_url,
        "/api/v1/device/verify",
        method="POST",
        payload={
            "device_id": "active-device-01",
            "device_secret": device_secret,
            "challenge_id": challenge["challenge_id"],
            "signature": signature,
        },
    )
    assert status == 200
    assert isinstance(verified, dict)
    token = str(verified["token"])
    assert token

    with sqlite3.connect(api_db_path) as connection:
        row = connection.execute(
            "SELECT token_hash FROM device_access_tokens WHERE device_id = ? ORDER BY id DESC LIMIT 1",
            ("active-device-01",),
        ).fetchone()
    assert row is not None
    assert row[0] == _secret_hash(token)


def test_revoked_device_cannot_request_challenge(api_base_url: str, api_db_path: Path) -> None:
    seed_device(
        api_db_path,
        device_id="revoked-device-01",
        status="revoked",
        device_secret="revoked-device-secret",
    )

    status, body = raw_request(
        api_base_url,
        "/api/v1/device/challenge",
        method="POST",
        payload={"device_id": "revoked-device-01", "device_secret": "revoked-device-secret"},
    )
    assert status == 403
    assert body == {"detail": "Device is not active"}
