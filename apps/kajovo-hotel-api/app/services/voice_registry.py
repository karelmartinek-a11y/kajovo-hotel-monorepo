"""Compatibility import for Dagmar-owned registry; no hotel implementation."""
import sys
from dagmar_server import registry as implementation
sys.modules[__name__] = implementation
