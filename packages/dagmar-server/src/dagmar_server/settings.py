"""Dagmar configuration independent of host environment names."""
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

class DagmarSettings(BaseModel):
    model_config = ConfigDict(extra='forbid')
    voice_context_prune_tokens: int = Field(default=24000, ge=8000, le=80000)
    voice_smart_frame_max_chars: int = Field(default=60000, ge=8000, le=100000)
    voice_memory_context_max_tokens: int = Field(default=2000, ge=500, le=12000)
    voice_memory_curator_model: str = 'gpt-4.1-mini-2025-04-14'
    voice_memory_batch_seconds: int = Field(default=90, ge=15, le=300)
    voice_memory_max_calls_per_hour: int = Field(default=40, ge=1, le=120)
    # Candidate only: default off until a measured provider/audio comparison fits the shared paid budget.
    voice_input_noise_reduction: Literal['near_field','far_field'] | None = None
    voice_master_key: str = Field(default='', repr=False)
    ha_mcp_token: str = Field(default='', repr=False)
    mail_mcp_token: str = Field(default='', repr=False)
    mail_mcp_url: str = 'https://apimail.hcasc.cz/mcp'
