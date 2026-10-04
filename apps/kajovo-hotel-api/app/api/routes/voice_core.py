"""Compatibility import; active routing is injected by the Dagmar adapter."""
import sys
from dagmar_server import api_core as implementation
sys.modules[__name__] = implementation
