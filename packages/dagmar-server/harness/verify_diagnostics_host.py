"""Minimal test-auth host; no alternative production login or hotel imports."""
import base64
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time

import httpx

HOST = '''
from fastapi import FastAPI, HTTPException
from dagmar_server.diagnostic_api import router_for
from dagmar_server.diagnostics import Diagnostics
import os
app=FastAPI()
store=Diagnostics(os.environ['DAGMAR_TEST_ROOT'],os.environ['DAGMAR_TEST_KEY'],release='isolated-copy-out')
def auth(request):
    if request.headers.get('x-test-principal')!='test-admin': raise HTTPException(401)
    if request.method!='GET' and request.headers.get('x-test-csrf')!='isolated': raise HTTPException(403)
    return 'test-admin'
app.include_router(router_for(lambda:store,auth))
'''


def main():
    with tempfile.TemporaryDirectory() as directory:
        root=Path(directory)
        (root/'host.py').write_text(HOST)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0))
            port=sock.getsockname()[1]
        env=dict(os.environ,DAGMAR_TEST_ROOT=str(root/'data'),DAGMAR_TEST_KEY=base64.b64encode(os.urandom(32)).decode())
        process=subprocess.Popen([sys.executable,'-m','uvicorn','host:app','--port',str(port),'--log-level','error'],cwd=root,env=env)
        try:
            with httpx.Client(base_url=f'http://127.0.0.1:{port}',timeout=2) as client:
                for _ in range(100):
                    try:
                        assert client.get('/diagnostics/calls').status_code==401
                        break
                    except httpx.ConnectError:
                        time.sleep(.05)
                else:
                    raise RuntimeError('host_not_ready')
                headers={'x-test-principal':'test-admin','x-test-csrf':'isolated'}
                call=client.post('/diagnostics/calls',headers=headers).json()['logical_call_id']
                segment=client.post(f'/diagnostics/calls/{call}/segments',json={'capture_ms':10},headers=headers).json()
                assert segment['generation']==1
                assert client.post(f'/diagnostics/calls/{call}/close',headers=headers).status_code==200
                export=client.post(f'/diagnostics/calls/{call}/export',headers=headers)
                assert export.status_code==200 and b'manifest.json' in export.content
                assert client.delete(f'/diagnostics/calls/{call}',headers=headers).status_code==200
        finally:
            process.terminate()
            process.wait(timeout=5)
        print('Isolated diagnostic host HTTP/auth/storage/export PASS')


if __name__=='__main__':
    main()
