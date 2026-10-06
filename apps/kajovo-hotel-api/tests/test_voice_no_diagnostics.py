"""Technical voice traffic stays outside business audit and content logging."""
import logging
import threading

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

from app import observability
from app.db.models import AuditTrail, Base


def request(path, method='POST'):
    return Request({'type': 'http', 'method': method, 'path': path, 'headers': [], 'query_string': b''})


@pytest.mark.parametrize('suffix', ['/calls', '/calls/id/close', '/sessions', '/sessions/id', '/sessions/id/heartbeat', '/sessions/id/playback-ready'])
def test_technical_voice_operations_are_not_audit_changes(suffix):
    for method in ('POST', 'DELETE'):
        assert not observability._should_audit(request('/api/v1/admin/voice-core' + suffix, method), 200)


def test_semantic_memory_read_write_and_security_audit():
    route=request('/api/v1/admin/voice-memory/operations')
    assert not observability._should_audit(route, 200, {'request': {'operation': 'note_list'}})
    assert observability._should_audit(route, 200, {'request': {'operation': 'note_create'}})
    assert observability._should_audit(request('/api/auth/change-password'), 200)
    assert observability._should_audit(request('/api/v1/admin/profile', 'PUT'), 200)
    assert observability._should_audit(request('/api/v1/admin/settings/smtp', 'PUT'), 200)
    assert observability._should_audit(request('/api/v1/admin/settings/smtp/test-email'), 200)
    assert observability._should_audit(request('/api/v1/users/1/unlock'), 403)
    assert observability._should_audit(request('/api/v1/admin/voice-core/config', 'PUT'), 200)


def test_heartbeat_is_silent_and_audit_commit_is_awaited_in_worker(tmp_path, monkeypatch, caplog):
    engine=create_engine('sqlite:///' + str(tmp_path/'audit.db'), connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    factory=sessionmaker(engine)
    monkeypatch.setattr(observability, 'SessionLocal', factory)
    monkeypatch.setattr(observability, 'parse_identity', lambda req: ('fixture','fixture','admin'))
    app=FastAPI()
    app.add_middleware(observability.RequestContextMiddleware)
    threads=[]
    original=observability._write_audit
    def write(values):
        threads.append(threading.get_ident())
        original(values)
    monkeypatch.setattr(observability, '_write_audit', write)
    loop_thread=[]
    @app.post('/api/v1/admin/voice-core/sessions/id/heartbeat')
    async def heartbeat():
        loop_thread.append(threading.get_ident())
        return {'ready':True}
    @app.put('/api/v1/admin/voice-core/config')
    async def config():
        loop_thread.append(threading.get_ident())
        return {'revision':1}
    with TestClient(app) as client:
        assert client.post('/api/v1/admin/voice-core/sessions/id/heartbeat').status_code==200
        with factory() as db:
            assert db.scalar(select(func.count()).select_from(AuditTrail))==0
        assert client.put('/api/v1/admin/voice-core/config', json={'prompt':'PRIVATE-CONTENT'}).status_code==200
        with factory() as db:
            rows=db.scalars(select(AuditTrail)).all()
            assert len(rows)==1 and rows[0].detail is None
    assert len(threads)==1 and threads[0] not in loop_thread
    assert not any(r.name=='kajovo.api' and r.levelno<logging.WARNING for r in caplog.records)
    engine.dispose()


def test_formatter_bounds_sdk_errors_and_repeated_error_filter():
    record=logging.LogRecord('mcp.client', logging.ERROR, '', 1, 'PRIVATE-CONTENT %s', ('secret-token',), None)
    record.context={'request_id':'fixture','arguments':{'secret':'PRIVATE'},'prompt':'PRIVATE'}
    encoded=observability.JsonFormatter().format(record)
    assert 'PRIVATE' not in encoded and 'secret-token' not in encoded
    record.context={str(i): ['x'*400]*30 for i in range(40)}
    assert len(observability.JsonFormatter().format(record).encode()) <= 4096
    limiter=observability.RepeatedErrorFilter()
    assert limiter.filter(record)
    assert not limiter.filter(record)


def test_portable_app_has_calls_and_no_diagnostic_routes_or_store():
    from dagmar_server.application import DagmarApplication
    from dagmar_server.ports import RuntimePorts
    from dagmar_server.settings import DagmarSettings
    product=DagmarApplication(RuntimePorts(None,DagmarSettings(),lambda owner:None))
    app=FastAPI()
    app.include_router(product.core)
    assert '/calls' in app.openapi()['paths']
    assert not any('diagnostic' in path for path in app.openapi()['paths'])
    assert not hasattr(product,'diagnostics')


def test_unexpected_request_error_keeps_safe_code_and_correlation(monkeypatch):
    errors=[]
    monkeypatch.setattr(observability.logger, 'error', lambda message, *, extra: errors.append((message,extra['context'])))
    monkeypatch.setattr(observability, 'parse_identity', lambda req: ('fixture','fixture','admin'))
    app=FastAPI()
    app.add_middleware(observability.RequestContextMiddleware)
    @app.get('/fixture')
    async def broken():
        raise ValueError('PRIVATE-CONTENT')
    with TestClient(app) as client:
        with pytest.raises(ValueError, match='PRIVATE-CONTENT'):
            client.get('/fixture', headers={'x-request-id':'safe-correlation'})
    assert errors[-1][0]=='request.failed'
    assert errors[-1][1]['code']=='unhandled_request'
    assert errors[-1][1]['request_id']=='safe-correlation'
    record=logging.LogRecord('kajovo.api', logging.ERROR, '', 1, errors[-1][0], (), None)
    record.context=errors[-1][1]
    assert 'PRIVATE-CONTENT' not in observability.JsonFormatter().format(record)


@pytest.mark.parametrize('name', ['mcp.client', 'httpx', 'httpcore.connection', 'websockets.client'])
def test_sdk_info_is_dropped_and_failures_are_safe_and_repeat_bounded(name):
    safe = observability.SafeTransportFilter()
    info = logging.LogRecord(name, logging.INFO, '', 1, 'PRIVATE token=%s', ('secret',), None)
    assert not safe.filter(info)
    assert 'transport.failed' not in observability.JsonFormatter().format(info)
    limiter = observability.RepeatedErrorFilter()
    for index in range(2):
        error = logging.LogRecord(name, logging.ERROR, '', 1, 'PRIVATE %s', (str(index),), None)
        error.context = {'url': 'secret', 'headers': {'Authorization': 'secret'}}
        assert safe.filter(error)
        assert limiter.filter(error) is (index == 0)
        encoded = observability.JsonFormatter().format(error)
        assert 'external.transport.failed' in encoded and 'PRIVATE' not in encoded and 'secret' not in encoded
