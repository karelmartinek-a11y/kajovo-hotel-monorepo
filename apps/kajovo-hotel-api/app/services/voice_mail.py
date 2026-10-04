"""Compatibility import for Dagmar-owned mail; no hotel implementation."""
import sys
from dagmar_server import mail as implementation
sys.modules[__name__] = implementation
