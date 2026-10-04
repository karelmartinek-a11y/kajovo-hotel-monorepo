"""Authenticated hotel API integration, no paid provider or external writes."""
import base64
import io
import json
import os
import tarfile

import pytest
from tests.test_voice_core import voice_host as core_host

from app.config import get_settings
from app.services.voice_diagnostics import store

voice_host = core_host
BASE = "/api/v1/admin/voice-core/diagnostics"


@pytest.fixture
def host(voice_host, tmp_path, monkeypatch):
    key = tmp_path / "key"
    key.write_text(base64.b64encode(os.urandom(32)).decode())
    monkeypatch.setattr(get_settings(), "voice_diagnostic_root", str(tmp_path / "diagnostics"))
    monkeypatch.setattr(get_settings(), "voice_diagnostic_key_file", str(key))
    store.cache_clear()
    yield voice_host
    store.cache_clear()


def test_auth_csrf_ownership_revocation_and_no_content_logging(host, caplog):
    client, factory, login = host
    assert client.get(BASE+"/calls").status_code == 401
    login("portal","recepce")
    assert client.get(BASE+"/calls").status_code == 403
    login()
    assert client.post(BASE+"/calls", headers={"x-csrf-token":"wrong"}).status_code == 403
    call = client.post(BASE+"/calls").json()["logical_call_id"]
    segment = client.post(BASE+f"/calls/{call}/segments",json={"capture_ms":10}).json()
    info={**segment,"track_id":"mic","source_id":"microphone","mime":"audio/mp4","sequence":0,"capture_start_ms":10,"capture_end_ms":20}
    upload=client.put(BASE+f"/calls/{call}/chunks/chunk",content=b"audio-private-canary",headers={"x-dagmar-chunk":json.dumps(info)})
    assert upload.status_code == 200
    assert "audio-private-canary" not in caplog.text
    assert upload.headers["cache-control"] == "no-store"
    # A new authenticated session may administer evidence but cannot ingest to another active call.
    login()
    assert client.put(BASE+f"/calls/{call}/chunks/forged",content=b"x",headers={"x-dagmar-chunk":json.dumps(info)}).status_code == 404
    assert client.get(BASE+f"/calls/{call}").status_code == 200
    with factory() as db:
        from app.db.models import AuthSession
        for row in db.query(AuthSession).all():
            row.revoked_at = __import__('app.time_utils',fromlist=['utc_now']).utc_now()
        db.commit()
    assert client.get(BASE+f"/calls/{call}").status_code == 401


def test_record_manifest_export_pin_delete_real_http(host):
    client, _, login = host
    login()
    call = client.post(BASE+"/calls").json()["logical_call_id"]
    segment = client.post(BASE+f"/calls/{call}/segments",json={"capture_ms":10}).json()
    info={**segment,"track_id":"mic","source_id":"microphone","mime":"audio/mp4","sequence":0,"capture_start_ms":10,"capture_end_ms":20}
    assert client.put(BASE+f"/calls/{call}/chunks/chunk",content=b"audio-private-canary",headers={"x-dagmar-chunk":json.dumps(info)}).status_code == 200
    assert client.post(BASE+f"/calls/{call}/segments/{segment['segment_id']}/stop",json={"capture_ms":20,"complete":True}).status_code == 200
    assert client.post(BASE+f"/calls/{call}/close").status_code == 200
    response=client.post(BASE+f"/calls/{call}/export")
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    with tarfile.open(fileobj=io.BytesIO(response.content)) as archive:
        manifest=json.load(archive.extractfile("manifest.json"))
        assert manifest["schema_version"] == 1
        assert archive.extractfile("objects/chunk.bin").read() == b"audio-private-canary"
    assert client.post(BASE+f"/calls/{call}/pin").json()["pinned"]
    assert client.delete(BASE+f"/calls/{call}").json()["deleted"]
    assert client.get(BASE+f"/calls/{call}").status_code == 404


def test_sideband_capture_fencing_usage_and_mail_correlation(host):
    import asyncio
    from app.services.voice_diagnostics import Collector

    diagnostic=store()
    call=diagnostic.create_call('owner')['logical_call_id']
    diagnostic.connection(call,'owner','connection','gpt-realtime-2.1',4)
    collector=Collector(call,'owner','connection','gpt-realtime-2.1')

    async def scenario():
        collector.start()
        collector.emit({'type':'response.created','response':{'id':'before'}})
        await collector.queue.join()
        segment=diagnostic.start(call,'owner',0)
        collector.emit({'type':'response.done','response':{'id':'before','status':'completed','output':[{'content':[{'text':'pre-debug-private-canary'}]}]}})
        collector.emit({'type':'mcp.request.start','request_id':'local-mail','request':{'query':'ordinary-mail','authorization':'Bearer secret-canary'}})
        collector.emit({'type':'mcp.request.result','request_id':'local-mail','remote_request_id':'remote-mail','result':{'body':'ordinary-mail-content','refresh_token':'secret-canary'}})
        collector.emit({'type':'response.created','response':{'id':'during'}})
        collector.emit({'type':'response.done','response':{'id':'during','status':'cancelled','usage':None,'output':[]}})
        collector.emit({'type':'curator.done','model':'gpt-4.1-mini-2025-04-14','response':{'id':'curator-response','status':'completed','usage':{'input_tokens':10,'output_tokens':2,'total_tokens':12,'secret_body':'secret-canary'}}})
        await collector.queue.join()
        diagnostic.stop(call,'owner',segment['segment_id'],10000,complete=True)
        collector.emit({'type':'mcp.request.result','request_id':'local-mail','result':{'body':'post-off-private-canary'}})
        await collector.queue.join()
        await collector.close()
    asyncio.run(scenario())
    payloads=[payload for row,payload in diagnostic.objects_for_export(call) if row['kind']=='content']
    joined=b' '.join(payloads)
    assert b'ordinary-mail-content' in joined and b'[REDACTED]' in joined
    assert b'pre-debug-private-canary' not in joined and b'post-off-private-canary' not in joined and b'secret-canary' not in joined
    manifest=diagnostic.manifest(call)
    assert not manifest['duplicates']
    assert any(value['remote_request_id']=='remote-mail' for value in manifest['events'])
    usage={value['response_id']:value for value in manifest['usage']}
    assert usage['during']['status']=='cancelled' and usage['during']['usage'] is None
    assert usage['curator-response']['model']=='gpt-4.1-mini-2025-04-14'
    assert 'secret_body' not in usage['curator-response']['usage']
