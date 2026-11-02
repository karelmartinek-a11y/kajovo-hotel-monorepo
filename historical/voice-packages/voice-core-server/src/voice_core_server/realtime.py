import json
from typing import Protocol

import httpx

from .contracts import MODELS, VoiceCoreConfig, VoiceError
from .policy import session_config

MODEL_UNAVAILABLE_CODES = {"model_not_found", "model_not_available", "unsupported_model"}


class RealtimeSessionProvider(Protocol):
    async def create(self, sdp: str, config: VoiceCoreConfig, api_key: str) -> tuple[str, str]: ...


class RealtimeSessionClient:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None):
        self.transport = transport

    async def create(self, sdp: str, config: VoiceCoreConfig, api_key: str) -> tuple[str, str]:
        models = (config.manual_model,) if config.model_mode == "manual" else MODELS
        async with httpx.AsyncClient(timeout=25, transport=self.transport) as client:
            for model in models:
                try:
                    response = await client.post("https://api.openai.com/v1/realtime/calls",
                        headers={"Authorization": f"Bearer {api_key}"},
                        files={"sdp": (None, sdp, "application/sdp"),
                               "session": (None, json.dumps(session_config(config, model)), "application/json")})
                except httpx.TimeoutException:
                    raise VoiceError("provider_timeout") from None
                except httpx.HTTPError:
                    raise VoiceError("provider_unavailable") from None
                if response.is_success:
                    if not response.text.startswith("v=0"):
                        raise VoiceError("session_creation_failed")
                    return response.text, model
                try:
                    error = response.json().get("error", {})
                    code = error.get("code") if isinstance(error, dict) else None
                except (ValueError, AttributeError):
                    code = None
                if isinstance(code, str) and code in MODEL_UNAVAILABLE_CODES:
                    if config.model_mode == "automatic":
                        continue
                    raise VoiceError("model_unavailable")
                if response.status_code == 401:
                    raise VoiceError("invalid_api_key")
                if response.status_code == 429:
                    raise VoiceError("rate_limited")
                raise VoiceError("provider_unavailable" if response.status_code >= 500 else "session_creation_failed")
        raise VoiceError("model_unavailable")
