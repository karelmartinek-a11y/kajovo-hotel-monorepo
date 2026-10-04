"""Compatibility import for Dagmar-owned mail_confirmation; no hotel implementation."""
import sys
from dagmar_server import mail_confirmation as implementation
sys.modules[__name__] = implementation
