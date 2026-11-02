"""Compatibility import for Dagmar-owned memory; no hotel implementation."""
import sys
from dagmar_server import memory as implementation
sys.modules[__name__] = implementation
