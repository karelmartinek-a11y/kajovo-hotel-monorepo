"""Compatibility import for Dagmar-owned smart; no hotel implementation."""
import sys
from dagmar_server import smart as implementation
sys.modules[__name__] = implementation
