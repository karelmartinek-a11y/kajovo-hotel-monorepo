"""The host and portable product expose the same supported voice contract."""
from dagmar_server.api_core import VoiceSessionRead
from dagmar_server.browser_contract import schema

SUPPORTED_ROUTES = {
    "/api-key", "/calls", "/calls/{identity}/close", "/config", "/sessions",
    "/sessions/{identity}/playback-ready", "/sessions/{session_id}",
    "/sessions/{session_id}/heartbeat", "/sessions/{session_id}/registry-plan",
}


def test_supported_voice_routes_and_session_contract():
    from app.main import app

    assert {path.removeprefix("/voice") for path in schema()["paths"] if path.startswith("/voice/")} == SUPPORTED_ROUTES
    prefix = "/api/v1/admin/voice-core"
    assert {path.removeprefix(prefix) for path in app.openapi()["paths"] if path.startswith(prefix + "/")} == SUPPORTED_ROUTES
    assert set(VoiceSessionRead.model_fields) == {
        "logical_call_id", "sdp", "model", "session_id", "connection_state",
        "memory", "technologies", "managed_functions", "managed_mcp_servers", "managed_mcp_status", "mail", "renew", "closed",
    }
