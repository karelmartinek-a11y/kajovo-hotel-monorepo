"""Compatibility import for Dagmar-owned orchestration; no hotel implementation."""
import sys
from dagmar_server import orchestration as implementation
sys.modules[__name__] = implementation
