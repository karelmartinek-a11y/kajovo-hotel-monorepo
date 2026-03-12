import hashlib
import hmac
import json
import urllib.error
import urllib.request


def _json_request(
    *,
    api_base_url: str,
    path: str,
    payload: dict[str, object] | None = None,
    method: str = "POST",
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, object] | None]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    merged_headers = {"Content-Type": "application/json"}
    if headers:
        merged_headers.update(headers)
    req = urllib.request.Request(
        f"{api_base_url}{path}",
        data=data,
        method=method,
        headers=merged_headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, json.loads(raw) if raw else None


def test_device_register_challenge_verify_status(api_base_url: str) -> None:
    status, registered = _json_request(
        api_base_url=api_base_url,
        path="/api/v1/device/register",
        payload={
            "device_id": "housekeeping-01",
            "display_name": "Housekeeping tablet",
            "bootstrap_key": "change-me-device-bootstrap-key",
        },
    )
    assert status == 200
    assert registered is not None
    secret = str(registered["device_secret"])

    req = urllib.request.Request(
        f"{api_base_url}/api/v1/device/status?device_id=housekeeping-01",
        method="GET",
        headers={"x-device-secret": secret},
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        assert response.status == 200
        status_payload = json.loads(response.read().decode("utf-8"))
    assert status_payload["device_id"] == "housekeeping-01"
    assert status_payload["status"] == "active"

    status, challenge = _json_request(
        api_base_url=api_base_url,
        path="/api/v1/device/challenge",
        payload={"device_id": "housekeeping-01", "device_secret": secret},
    )
    assert status == 200
    assert challenge is not None

    signature = hmac.new(
        secret.encode("utf-8"),
        str(challenge["challenge"]).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    status, verified = _json_request(
        api_base_url=api_base_url,
        path="/api/v1/device/verify",
        payload={
            "device_id": "housekeeping-01",
            "device_secret": secret,
            "challenge_id": challenge["challenge_id"],
            "signature": signature,
        },
    )
    assert status == 200
    assert verified is not None
    token = str(verified["token"])

    bearer_req = urllib.request.Request(
        f"{api_base_url}/api/v1/device/status",
        method="GET",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(bearer_req, timeout=45) as response:
        assert response.status == 200
        bearer_status_payload = json.loads(response.read().decode("utf-8"))
    assert bearer_status_payload["device_id"] == "housekeeping-01"
    assert bearer_status_payload["token_expires_at"] is not None


def test_device_verify_rejects_bad_signature(api_base_url: str) -> None:
    status, registered = _json_request(
        api_base_url=api_base_url,
        path="/api/v1/device/register",
        payload={
            "device_id": "maintenance-01",
            "display_name": "Maintenance tablet",
            "bootstrap_key": "change-me-device-bootstrap-key",
        },
    )
    assert status == 200
    assert registered is not None
    secret = str(registered["device_secret"])

    status, challenge = _json_request(
        api_base_url=api_base_url,
        path="/api/v1/device/challenge",
        payload={"device_id": "maintenance-01", "device_secret": secret},
    )
    assert status == 200
    assert challenge is not None

    status, payload = _json_request(
        api_base_url=api_base_url,
        path="/api/v1/device/verify",
        payload={
            "device_id": "maintenance-01",
            "device_secret": secret,
            "challenge_id": challenge["challenge_id"],
            "signature": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        },
    )
    assert status == 401
    assert payload is not None
    assert payload.get("detail") == "Invalid challenge signature"


def test_device_register_rejects_invalid_bootstrap(api_base_url: str) -> None:
    status, payload = _json_request(
        api_base_url=api_base_url,
        path="/api/v1/device/register",
        payload={
            "device_id": "bad-device",
            "display_name": "Bad device",
            "bootstrap_key": "invalid-key",
        },
    )
    assert status == 403
    assert payload is not None
    assert payload.get("detail") == "Invalid bootstrap key"
