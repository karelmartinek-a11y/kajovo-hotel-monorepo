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
    assert "shutil.rmtree" not in script
    assert "docker builder prune -af" in script
    assert "docker image prune -af" not in script
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


def test_remote_environment_remains_private_before_move_and_secret_updates() -> None:
    script = _load_deploy_module().remote_script_text()
    preserve = 'chmod 600 "$preserve_dir/infra/.env"'
    publish = 'mv "$preserve_dir/infra/.env" "$deploy_root/infra/.env"'
    private = 'chmod 600 "$deploy_root/infra/.env"'
    assert script.index(preserve) < script.index(publish)
    assert script.index(private) < script.index('export DEPLOY_VARS_PATH="$vars_json"')


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


def test_mcp_secret_has_one_server_owned_authority(tmp_path, monkeypatch):
    module = _load_deploy_module()
    monkeypatch.setenv('KAJOVO_API_MCP_SIGNING_KEY', 'must-not-upload-this-canary')
    path = tmp_path / 'payload.json'
    module.write_remote_vars(path)
    assert 'KAJOVO_API_MCP_SIGNING_KEY' not in json.loads(path.read_text())
    script = module.remote_script_text()
    assert 'mcp-signing-key.sha256' in script
    assert 'hashlib.sha256(key.encode()).hexdigest() != expected' in script
    assert script.index('fingerprint mismatch') < script.index('"$deploy_root/infra/ops/deploy-production.sh"')


def test_absent_mcp_url_has_environment_specific_compose_default(monkeypatch):
    import yaml
    root = Path(__file__).resolve().parents[3]
    monkeypatch.delenv('KAJOVO_API_MCP_SERVER_URL', raising=False)
    for env, endpoint in [('prod', 'https://hotel.hcasc.cz/mcp/home-assistant'),
                          ('staging', 'https://kajovohotel-staging.hcasc.cz/mcp/home-assistant')]:
        config = yaml.safe_load((root / f'infra/compose.{env}.yml').read_text())
        expression = config['services']['api']['environment']['KAJOVO_API_MCP_SERVER_URL']
        import re
        match = re.fullmatch(r'\$\{([A-Z_]+):-([^}]+)\}', expression)
        assert match
        import os
        assert (os.environ.get(match[1]) or match[2]) == endpoint


def test_release_review_is_independent_of_green_ci(monkeypatch):
    module = _load_deploy_module()
    script_path = Path(__file__).resolve().parents[3] / 'scripts/check_release_review.py'
    spec = importlib.util.spec_from_file_location('release_review', script_path)
    review = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(review)
    def api(path):
        if path.endswith('/commits/main'):
            return {'sha': 'new'}
        if 'actions/workflows' in path:
            return {'workflow_runs': [{'head_branch': 'main', 'conclusion': 'success'}]}
        if path.endswith('/reviews'):
            return []
        return {'merged': True, 'merge_commit_sha': 'new', 'head': {'sha': 'topic'}}
    monkeypatch.setattr(review, 'api', api)
    import pytest
    with pytest.raises(AssertionError, match='completed_head_review_required'):
        review.verify('new', '123')
