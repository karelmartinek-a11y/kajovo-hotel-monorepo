"""Compatibility import for Dagmar-owned memory_contract; no hotel implementation."""
import sys
from dagmar_server import memory_contract as implementation
sys.modules[__name__] = implementation
