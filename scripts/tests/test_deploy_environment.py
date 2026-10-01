"""Execute the real private environment writer against runtime canaries."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import github_deploy_via_ssh as transport


@pytest.mark.parametrize('password', ["literal$UNEXPECTED # quote' slash\\tail", "slash\\'quote", '$$literal', ''])
def test_live_database_and_private_values_survive_real_compose_interpolation(tmp_path, monkeypatch, password):
    if not shutil.which('docker'):
        pytest.skip('Docker Compose CLI unavailable')
    root = tmp_path / 'release'
    (root / 'infra').mkdir(parents=True)
    source_env = tmp_path / 'live.env'
    source_env.write_text('POSTGRES_PASSWORD=obsolete\nKAJOVO_API_SMTP_ENCRYPTION_KEY=obsolete\nKAJOVO_API_MCP_SIGNING_KEY=old\n')
    api = {'Config': {'Labels': {'com.docker.compose.project.environment_file': str(source_env)},
                      'Env': ['KAJOVO_API_VOICE_MASTER_KEY=unchanged-master',
                              'KAJOVO_API_DATABASE_URL=postgresql+psycopg://user:' + password + '@postgres/db',
                              'KAJOVO_API_SMTP_ENCRYPTION_KEY=' + password,
                              'KAJOVO_API_MCP_SIGNING_KEY=removed']}}
    pg = {'Config': {'Env': ['POSTGRES_PASSWORD=' + password, 'POSTGRES_DB=live_db', 'POSTGRES_USER=live_user',
                            'POSTGRES_HOST_AUTH_METHOD=trust' if not password else 'POSTGRES_HOST_AUTH_METHOD=']}}
    payload = tmp_path / 'vars.json'
    payload.write_text(json.dumps({'KAJOVO_API_VOICE_MASTER_KEY': 'unchanged-master',
                                   'HOTEL_ADMIN_PASSWORD': password}))
    monkeypatch.setenv('DEPLOY_STAGING', str(root))
    monkeypatch.setenv('DEPLOY_VARS_PATH', str(payload))
    script = transport.remote_script_text().split("<<'PYENV'\n", 1)[1].split('\nPYENV', 1)[0]
    original = subprocess.check_output

    def inspect(command, **kwargs):
        assert command[:2] == ['docker', 'inspect']
        return json.dumps([pg if command[-1].endswith('postgres-1') else api]).encode()
    with monkeypatch.context() as patch:
        patch.setattr(subprocess, 'check_output', inspect)
        exec(compile(script, '<private-runtime-env-writer>', 'exec'), {})
    target = root / 'infra/.env'
    assert target.stat().st_mode & 0o777 == 0o600
    assert 'MCP' not in target.read_text() and 'obsolete' not in target.read_text()
    compose = root / 'compose.json'
    compose.write_text(json.dumps({'services': {'fixture': {'image': 'alpine', 'environment': {
        'PASSWORD': '${POSTGRES_PASSWORD}', 'USER': '${POSTGRES_USER}', 'DB': '${POSTGRES_DB}',
        'SMTP': '${KAJOVO_API_SMTP_ENCRYPTION_KEY}', 'URL': '${KAJOVO_API_DATABASE_URL}'}}}}))
    result = original(['docker', 'compose', '--env-file', str(target), '-f', str(compose), 'config', '--environment'],
                      env={**os.environ, 'UNEXPECTED': 'must-never-substitute'}, text=True)
    values = dict(line.split('=', 1) for line in result.splitlines() if '=' in line)
    assert values['POSTGRES_PASSWORD'] == password
    assert values['KAJOVO_API_SMTP_ENCRYPTION_KEY'] == password
    assert values['KAJOVO_API_DATABASE_URL'] == api['Config']['Env'][1].split('=', 1)[1]
    assert values['POSTGRES_USER'] == 'live_user' and values['POSTGRES_DB'] == 'live_db'
