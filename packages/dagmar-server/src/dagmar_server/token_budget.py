"""Explicit compatible token estimate; provider usage remains authoritative."""
from dataclasses import dataclass
from functools import lru_cache
import tiktoken

@dataclass(frozen=True)
class Measurement:
    tokens: int
    utf8_bytes: int
    encoding: str = "o200k_base"
    exact_provider_tokens: bool = False

@lru_cache(maxsize=1)
def encoding():
    return tiktoken.get_encoding("o200k_base")

def measure(value: str) -> Measurement:
    return Measurement(len(encoding().encode(value, disallowed_special=())), len(value.encode("utf-8")))
