"""Compatibility import for Dagmar-owned config; no hotel implementation."""
import sys
from dagmar_server import config as implementation
sys.modules[__name__] = implementation
