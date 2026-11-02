"""Bounded content-free errors through the existing Python logger."""
import logging


def failure(component: str, correlation_id: str, code: str = 'unavailable', *, retryable: bool = False):
    logging.getLogger('dagmar.voice').warning('voice.operation.failed', extra={'context': {
        'component': component, 'request_id': correlation_id, 'code': code, 'retryable': retryable,
    }})
