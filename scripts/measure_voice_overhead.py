"""Repeatable isolated HTTP/SQLite metadata workload; no provider or physical audio.

Run on a checkout with its source directories on PYTHONPATH. The old checkout
adds the metadata requests its browser made with debug Off. Functional traffic
is identical on both versions. CPU is process time, latency is in-process HTTP.
"""
import argparse
import base64
import contextlib
import io
import json
import logging
import statistics
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker

from app import observability
from app.db.models import AuditTrail, Base


def measure():
    with tempfile.TemporaryDirectory() as directory:
        engine = create_engine('sqlite:///' + directory + '/audit.sqlite3', connect_args={'check_same_thread': False})
        Base.metadata.create_all(engine)
        factory = sessionmaker(engine)
        observability.SessionLocal = factory
        observability.parse_identity = lambda request: ('fixture', 'fixture', 'admin')
        output = io.StringIO()
        handler = logging.StreamHandler(output)
        handler.setFormatter(observability.JsonFormatter())
        observability.logger.handlers = [handler]
        observability.logger.propagate = False
        observability.logger.setLevel(logging.INFO)
        writes = [0]

        @event.listens_for(engine, 'after_cursor_execute')
        def statement(conn, cursor, query, parameters, context, many):
            if query.lstrip().split(' ', 1)[0].upper() in {'INSERT', 'UPDATE', 'DELETE'}:
                writes[0] += 1

        app = FastAPI()
        app.add_middleware(observability.RequestContextMiddleware)
        prefix = '/api/v1/admin/voice-core'

        @app.post(prefix + '/sessions/fixture/heartbeat')
        def heartbeat():
            return {'closed': False, 'renew': False, 'technologies': 'ready'}

        @app.post(prefix + '/sessions/fixture/playback-ready')
        def playback():
            return {'ready': True}

        @app.put(prefix + '/config')
        def config():
            return {'revision': 1}

        store = None
        try:
            from dagmar_server.diagnostics import Diagnostics
            from dagmar_server.diagnostic_api import router_for
        except ImportError:
            pass
        else:
            store = Diagnostics(Path(directory) / 'diagnostics', base64.b64encode(b'x' * 32).decode())
            original = store.db

            @contextlib.contextmanager
            def counted():
                with original() as db:
                    def trace(query):
                        if query.lstrip().split(' ', 1)[0].upper() in {'INSERT', 'UPDATE', 'DELETE'}:
                            writes[0] += 1
                    db.set_trace_callback(trace)
                    yield db
            store.db = counted
            app.include_router(router_for(lambda: store, lambda request: 'fixture'), prefix=prefix)

        requests, latencies = 0, []
        with TestClient(app) as client:
            def request(path, method='POST', body=None):
                nonlocal requests
                start = time.perf_counter()
                response = client.request(method, prefix + path, json=body)
                latencies.append((time.perf_counter() - start) * 1000)
                requests += 1
                assert response.status_code == 200, response.status_code
                return response.json()
            started, cpu = time.perf_counter(), time.process_time()
            call = request('/diagnostics/calls')['logical_call_id'] if store else None
            for cycle in range(40):
                request('/sessions/fixture/heartbeat')
                request('/sessions/fixture/playback-ready')
                if cycle % 4 == 0:
                    request('/config', 'PUT', {'revision': 0})
                if store:
                    events = [{'sequence': cycle * 8 + i, 'event_id': f'e{cycle}_{i}', 'source': 'browser',
                        'timestamp': datetime.now(timezone.utc).isoformat(), 'monotonic_ms': cycle * 250,
                        'event_type': 'playback.play', 'attributes': {}} for i in range(8)]
                    request(f'/diagnostics/calls/{call}/events', body={'events': events})
            if store:
                request(f'/diagnostics/calls/{call}/close')
            cpu, elapsed = time.process_time() - cpu, time.perf_counter() - started
        with factory() as db:
            audits = db.scalar(select(func.count()).select_from(AuditTrail))
        result = {'functional_requests': 90, 'requests': requests, 'log_bytes': len(output.getvalue().encode()),
            'audit_rows': audits, 'sql_write_statements': writes[0], 'cpu_seconds': round(cpu, 4),
            'elapsed_seconds': round(elapsed, 4), 'median_http_ms': round(statistics.median(latencies), 3),
            'p95_http_ms': round(sorted(latencies)[int(len(latencies) * .95)], 3)}
        engine.dispose()
        return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    results = [measure() for _ in range(3)]
    args.output.write_text(json.dumps({'kind': 'synthetic_in_process_metadata_debug_off', 'runs': results}, indent=2) + '\n')
    print(json.dumps(results))
