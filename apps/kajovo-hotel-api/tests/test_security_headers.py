import json
import urllib.request

import pytest

from app.config import get_settings


def test_security_headers(api_base_url: str) -> None:
    request = urllib.request.Request(f"{api_base_url}/health")
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read().decode("utf-8")
        headers = response.headers

    payload = json.loads(body)
    assert payload.get("status") == "ok"

    settings = get_settings()
    assert headers["Content-Security-Policy"] == settings.content_security_policy
    assert headers["Referrer-Policy"] == "no-referrer"
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["Permissions-Policy"] == "geolocation=()"

    if settings.environment.lower() == "production":
        assert headers["Strict-Transport-Security"].startswith("max-age=")
    else:
        assert "Strict-Transport-Security" not in headers


def test_cors_whitelist_respects_allowed_origins(api_base_url: str) -> None:
    settings = get_settings()
    if not settings.cors_allow_origins:
        pytest.skip("CORS whitelist not configured")

    sample_origins = settings.cors_allow_origins[:3]
    for origin in sample_origins:
        request = urllib.request.Request(
            f"{api_base_url}/health",
            headers={"Origin": origin},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            assert response.headers.get("Access-Control-Allow-Origin") == origin
            assert response.headers.get("Access-Control-Allow-Credentials") == "true"

    request = urllib.request.Request(
        f"{api_base_url}/health",
        headers={"Origin": "https://evil.example.com"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        assert "Access-Control-Allow-Origin" not in response.headers
