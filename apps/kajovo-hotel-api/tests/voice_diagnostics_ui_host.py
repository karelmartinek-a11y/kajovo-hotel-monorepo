"""Real hotel HTTP/auth and diagnostics; only paid provider is replaced in CI."""
import base64
import os
from pathlib import Path
import tempfile
import uuid

from app.config import get_settings
from app.main import create_app
from app.services.voice_smart import VoiceBridge, manager

root = Path(tempfile.mkdtemp(prefix="dagmar-diagnostics-ui-"))
key = root / "key"
key.write_text(base64.b64encode(os.urandom(32)).decode())
key.chmod(0o600)
get_settings().voice_diagnostic_root = str(root / "store")
get_settings().voice_diagnostic_key_file = str(key)
get_settings().voice_release_sha = "isolated-ui-test"
get_settings().voice_master_key = base64.b64encode(os.urandom(32)).decode()
app = create_app()


async def isolated_provider(sdp, config, key, owner, token, **kwargs):
    bridge=VoiceBridge(owner,"rtc_"+uuid.uuid4().hex,key,token,config,"isolated-provider")
    bridge.ready.set()
    bridge.technologies="unavailable"
    manager.sessions[bridge.id]=bridge
    return {"sdp":"v=0\r\nisolated-provider", "model":bridge.model, **bridge.public_status(),"managed_functions":[]}


app.state.dagmar.manager.create=isolated_provider


@app.on_event("shutdown")
def cleanup():
    import shutil
    shutil.rmtree(root)
