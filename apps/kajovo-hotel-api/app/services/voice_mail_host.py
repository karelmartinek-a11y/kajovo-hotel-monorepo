"""Compatibility import for Dagmar-owned mail_host; no hotel implementation."""
import sys
from dagmar_server import mail_host as implementation
sys.modules[__name__] = implementation
