from dataclasses import dataclass
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator

MODELS = ("gpt-realtime-2.1", "gpt-realtime-2")
VOICES = ("alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar")
LANGUAGES = {"cs": "Čeština", "en": "English", "de": "Deutsch", "sk": "Slovenčina"}


class VoiceCoreConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    model_mode: Literal["automatic", "manual"] = "automatic"
    manual_model: str | None = None
    response_length: Literal["short", "medium", "long"] = "medium"
    language_mode: Literal["automatic", "manual"] = "automatic"
    manual_language: str | None = None
    voice: str = "marin"

    @model_validator(mode="after")
    def supported_values(self):
        if self.voice not in VOICES:
            raise ValueError("Unsupported voice")
        if self.manual_model is not None and self.manual_model not in MODELS:
            raise ValueError("Unsupported model")
        if self.model_mode == "manual" and self.manual_model is None:
            raise ValueError("Manual model is required")
        if self.manual_language is not None and self.manual_language not in LANGUAGES:
            raise ValueError("Unsupported language")
        if self.language_mode == "manual" and self.manual_language is None:
            raise ValueError("Manual language is required")
        return self


class VoiceError(Exception):
    def __init__(self, category: str):
        self.category = category
        super().__init__(category)


class VoiceAuthProvider(Protocol):
    def authorize(self) -> str: ...


class VoiceConfigStore(Protocol):
    def read(self) -> VoiceCoreConfig: ...


class VoiceSecretStore(Protocol):
    def configured(self) -> bool: ...
    def read(self) -> str: ...
    def save(self, value: str) -> None: ...
    def delete(self) -> None: ...


class VoiceTelemetrySink(Protocol):
    def emit(self, event: str, attributes: dict[str, str | int | float]) -> None: ...


@dataclass(frozen=True)
class CapabilityContract:
    name: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]


class CapabilityProvider(Protocol):
    def contracts(self) -> tuple[CapabilityContract, ...]: ...


# Portable core installs no application-specific capability provider.
CAPABILITY_REGISTRY: tuple[CapabilityContract, ...] = ()


class McpServerConfig(BaseModel):
    """Server-owned remote capability definition; never a browser settings value."""
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    server_label: str
    server_url: str
    authorization: SecretStr = Field(default=SecretStr(""), repr=False)
    allowed_tools: list[str]
    require_approval: Literal['always', 'never'] | dict = 'always'
    server_description: str = ""

    @model_validator(mode='after')
    def secure_endpoint(self):
        from urllib.parse import urlsplit
        url = urlsplit(self.server_url)
        if url.scheme != 'https' or not url.hostname or url.username or url.password or url.fragment:
            raise ValueError('Remote MCP requires an HTTPS endpoint')
        if not self.allowed_tools or len(set(self.allowed_tools)) != len(self.allowed_tools):
            raise ValueError('An explicit unique allowlist is required')
        return self

    def session_tool(self) -> dict:
        values = self.model_dump(exclude={'authorization'})
        values['authorization'] = self.authorization.get_secret_value()
        return {'type': 'mcp', **values}


class McpCapabilityProvider(Protocol):
    def tools(self) -> list[dict]: ...
