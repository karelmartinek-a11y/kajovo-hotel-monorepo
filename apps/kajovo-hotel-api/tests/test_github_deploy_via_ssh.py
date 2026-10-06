import importlib.util
import json
from pathlib import Path


def _load_deploy_module():
    script_path = Path(__file__).resolve().parents[3] / "scripts/github_deploy_via_ssh.py"
    spec = importlib.util.spec_from_file_location("github_deploy_via_ssh", script_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_pre_upload_cleanup_preserves_runtime_data_and_running_images() -> None:
    script = _load_deploy_module().pre_upload_cleanup_script()

    assert "kajovo-deploy-*.tar.gz" in script
    assert "releases[1:]" in script
    assert "docker builder prune -af" in script
    assert "docker image prune -af" in script
    assert "docker volume" not in script
    assert "docker system prune" not in script


def test_ssh_connection_uses_keepalive(monkeypatch) -> None:
    module = _load_deploy_module()
    monkeypatch.setenv("HOTEL_DEPLOY_HOST", "example.test")
    monkeypatch.setenv("HOTEL_DEPLOY_USER", "deploy")
    monkeypatch.setenv("HOTEL_DEPLOY_PORT", "22")
    monkeypatch.setenv("SSH_IDENTITY_FILE", "/tmp/key")

    command, command_env = module.ssh_base()

    assert command_env is None
    assert "ServerAliveInterval=30" in command
    assert "ServerAliveCountMax=20" in command


def test_certificate_verification_requires_validity_beyond_thirty_days() -> None:
    script = _load_deploy_module().certificate_verification_script()

    assert "certbot renew" not in script
    assert "hotel.hcasc.cz:443" in script
    assert "-servername hotel.hcasc.cz" in script
    assert "-verify_return_error" in script
    assert "/etc/letsencrypt" not in script
    assert "openssl x509" in script
    assert "-checkend 2592000" in script


def test_web_push_vapid_configuration_is_forwarded_to_remote_deploy(tmp_path, monkeypatch) -> None:
    module = _load_deploy_module()
    expected = {
        "KAJOVO_API_WEB_PUSH_VAPID_PUBLIC_KEY": "public-key",
        "KAJOVO_API_WEB_PUSH_VAPID_PRIVATE_KEY": "private-key",
        "KAJOVO_API_WEB_PUSH_VAPID_SUBJECT": "mailto:admin@example.test",
    }
    for key, value in expected.items():
        monkeypatch.setenv(key, value)

    payload_path = tmp_path / "deploy-vars.json"
    module.write_remote_vars(payload_path)
    payload = json.loads(payload_path.read_text(encoding="utf-8"))

    assert {key: payload[key] for key in expected} == expected
    script = module.remote_script_text()
    for key in expected:
        assert f'"{key}": payload.get("{key}", "")' in script


def test_deploy_preserves_mcp_secret_and_restricts_existing_env_permissions(tmp_path, monkeypatch) -> None:
    script = _load_deploy_module().remote_script_text()
    assert 'umask 077' in script
    env_path = tmp_path / 'infra' / '.env'
    env_path.parent.mkdir()
    env_path.write_text('KAJAVOICEHA_MCP_TOKEN=contract-fixture-token\nUNCHANGED=value\n')
    env_path.chmod(0o644)
    vars_path = tmp_path / 'deploy-vars.json'
    vars_path.write_text(json.dumps({'HOTEL_ADMIN_EMAIL': 'admin@example.test'}))
    monkeypatch.setenv('DEPLOY_ROOT', str(tmp_path))
    monkeypatch.setenv('DEPLOY_VARS_PATH', str(vars_path))
    python_update = script.split("python3 - <<'PY'\n", 1)[1].split('\nPY\n', 1)[0]
    exec(compile(python_update, '<deployment-env-update>', 'exec'), {})
    assert env_path.stat().st_mode & 0o777 == 0o600
    lines = dict(line.split('=', 1) for line in env_path.read_text().splitlines())
    assert lines['KAJAVOICEHA_MCP_TOKEN'] == 'contract-fixture-token'
    assert lines['UNCHANGED'] == 'value'
    assert lines['KAJOVO_API_ADMIN_EMAIL'] == 'admin@example.test'
