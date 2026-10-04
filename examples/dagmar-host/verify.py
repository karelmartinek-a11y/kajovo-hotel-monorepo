"""Read/write test-auth API, isolated provider, durable own DB, without paid calls."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from urllib.error import HTTPError

root=Path(__file__).resolve().parent
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0))
    port=sock.getsockname()[1]
with tempfile.TemporaryDirectory() as directory:
    env={**os.environ,'DAGMAR_DATA':directory,'DAGMAR_MOCK_PROVIDER':'1'}
    log=open(Path(directory)/'host.log','w')
    process=subprocess.Popen([sys.executable,'-m','uvicorn','server:app','--host','127.0.0.1','--port',str(port)],cwd=root,env=env,stdout=log,stderr=log)
    try:
        base=f'http://127.0.0.1:{port}'
        for attempt in range(100):
            try:
                urllib.request.urlopen(base+'/health',timeout=1).close()
                break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError('standalone_host_failed')
        def request(path, method='GET', body=None, owner='test-admin-a'):
            headers={'x-test-admin':owner,'x-test-csrf':'dagmar-test-only','Content-Type':'application/json'}
            data=None if body is None else json.dumps(body).encode()
            with urllib.request.urlopen(urllib.request.Request(base+path,data=data,headers=headers,method=method),timeout=15) as response:
                return json.load(response)
        assert request('/health')['mock_provider']
        try:
            request('/dagmar/config',owner='invalid')
            raise AssertionError('unauthorized_access')
        except HTTPError as exc:
            assert exc.code==401
        request('/dagmar/api-key','PUT',{'api_key':'test-only-mock-key'})
        call=request('/dagmar/calls','POST')['logical_call_id']
        segment=request('/dagmar/diagnostics/calls/'+call+'/segments','POST',{'capture_ms':0})
        assert segment['generation']==1
        session=request('/dagmar/sessions','POST',{'sdp':'v=0\r\ntest-offer','revision':1,'logical_call_id':call})
        sid=session['session_id']
        request('/dagmar/sessions/'+sid+'/playback-ready','POST')
        request('/dagmar/sessions/'+sid+'/playback-ready','POST')
        status=request('/dagmar/sessions/'+sid)
        assert status['memory']=='ready'
        note=request('/dagmar-memory/operations','POST',{'request':{'operation':'note_create','title':'Standalone fixture','kind':'list','content':None,'items':['Fixture']}})
        assert note['code']=='ok'
        assert request('/dagmar-memory/notes',owner='test-admin-b')['notes'][0]['id']==note['note']['id']
        request('/dagmar/sessions/'+sid,'DELETE')
        request('/dagmar/calls/'+call+'/close','POST')
        request('/dagmar/diagnostics/calls/'+call+'/close','POST')
        manifest=request('/dagmar/diagnostics/calls/'+call)
        assert manifest['call']['release']=='standalone-test'
        print('standalone own DB/auth/shared memory/mock native-provider protocol/diagnostics PASS')
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        log.close()
