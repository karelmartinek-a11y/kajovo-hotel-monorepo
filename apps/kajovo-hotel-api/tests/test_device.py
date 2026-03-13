import base64
import json
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.security.device_crypto import compute_device_token_hash

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
    request = urllib.request.Request(
        url=f"{base_url}{path}",
        data=data,
        headers=headers or {},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, json.loads(raw) if raw else None


def seed_device(
    db_path: Path,
    *,
    device_id: str,
    status: str,
    display_name: str | None = None,
) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO devices (device_id, status, display_name, roles_json)
            VALUES (?, ?, ?, '[]')
            """,
            (device_id, status, display_name),
        )
        connection.commit()


def test_unknown_device_registration_is_blocked(api_base_url: str) -> None:
    status, body = raw_request(
        api_base_url,
        "/device/register",
        method="POST",
        payload={"device_id": "unknown-device-01", "display_name": "Front Desk Tablet"},
        headers={"Content-Type": "application/json"},
    )
    assert status == 403
    assert body == {"detail": "REGISTRATION_DISABLED"}


def test_known_device_can_register_and_read_status(api_base_url: str, api_db_path: Path) -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")

    seed_device(api_db_path, device_id="known-device-01", status="PENDING")

    status, body = raw_request(
        api_base_url,
        "/device/register",
        method="POST",
        payload={
            "device_id": "known-device-01",
            "display_name": "Housekeeping Phone",
            "public_key": public_key_pem,
            "device_info": {"platform": "android"},
        },
        headers={"Content-Type": "application/json"},
    )
    assert status == 200
    assert isinstance(body, dict)
    assert body["status"] == "PENDING"
    assert body["display_name"] == "Housekeeping Phone"
    assert body["device_id"] == "known-device-01"

    status, body = raw_request(
        api_base_url,
        "/device/status?device_id=known-device-01",
    )
    assert status == 200
    assert isinstance(body, dict)
    assert body["status"] == "PENDING"


def test_active_device_challenge_verify_issues_token(api_base_url: str, api_db_path: Path) -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")

    seed_device(api_db_path, device_id="active-device-01", status="ACTIVE", display_name="Front Desk")

    register_status, _ = raw_request(
        api_base_url,
        "/device/register",
        method="POST",
        payload={
            "device_id": "active-device-01",
            "display_name": "Front Desk",
            "public_key": public_key_pem,
        },
        headers={"Content-Type": "application/json"},
    )
    assert register_status == 200

    status, challenge = raw_request(
        api_base_url,
        "/device/challenge",
        method="POST",
        payload={"device_id": "active-device-01"},
        headers={"Content-Type": "application/json"},
    )
    assert status == 200
    assert isinstance(challenge, dict)
    nonce = str(challenge["nonce"])

    signature = private_key.sign(base64.b64decode(nonce), ec.ECDSA(hashes.SHA256()))
    signature_b64 = base64.b64encode(signature).decode("ascii")

    status, verified = raw_request(
        api_base_url,
        "/device/verify",
        method="POST",
        payload={
            "device_id": "active-device-01",
            "nonce": nonce,
            "signature": signature_b64,
        },
        headers={"Content-Type": "application/json"},
    )
    assert status == 200
    assert isinstance(verified, dict)
    assert verified["status"] == "ACTIVE"
    token = str(verified["deviceToken"])
    assert token

    with sqlite3.connect(api_db_path) as connection:
        row = connection.execute(
            "SELECT token_hash, last_challenge_nonce, last_challenge_issued_at FROM devices WHERE device_id = ?",
            ("active-device-01",),
        ).fetchone()
    assert row is not None
    assert row[0] == compute_device_token_hash(token)
    assert row[1] is None
    assert row[2] is None


def test_revoked_device_cannot_request_challenge(api_base_url: str, api_db_path: Path) -> None:
    seed_device(api_db_path, device_id="revoked-device-01", status="REVOKED")

    status, body = raw_request(
        api_base_url,
        "/device/challenge",
        method="POST",
        payload={"device_id": "revoked-device-01"},
        headers={"Content-Type": "application/json"},
    )
    assert status == 409
    assert body == {"detail": "Device revoked"}
