"""Compatibility import for Dagmar-owned curator; no hotel implementation."""
import sys
from dagmar_server import curator as implementation
sys.modules[__name__] = implementation
