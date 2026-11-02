"""The voice product belongs to CML; no Hotel session can revive it."""
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def test_old_voice_get_redirects_and_mutations_are_terminal():
    app = create_app()
    client = TestClient(app, follow_redirects=False)
    for path in ("/api/v1/admin/voice-core/config", "/api/v1/admin/voice-core/calls", "/api/v1/admin/voice-memory/operations"):
        response = client.get(path)
        assert response.status_code == 303
        assert response.headers["location"] == "https://kajovocml.hcasc.cz/#account-voice"
        assert client.post(path, json={}).status_code == 410
    assert not any("voice-core" in path or "voice-memory" in path for path in app.openapi()["paths"])
    assert not hasattr(app.state, "dagmar")


def test_production_images_have_no_voice_package_or_provider_adapter():
    root = Path(__file__).resolve().parents[3]
    for relative in ("kajovo-hotel-api/Dockerfile", "kajovo-hotel-admin/Dockerfile"):
        source = (root / "apps" / relative).read_text()
        assert "packages/dagmar" not in source
        assert "packages/voice-core" not in source


def test_active_deploy_does_not_pass_voice_credentials_to_hotel():
    root = Path(__file__).resolve().parents[3]
    for relative in ("infra/compose.prod.yml", "infra/compose.staging.yml", ".github/workflows/deploy-production.yml"):
        source = (root / relative).read_text()
        assert "KAJOVO_API_VOICE_" not in source
        assert "VOICE_MEMORY_CONTEXT_MAX_TOKENS" not in source
