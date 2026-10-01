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


def test_remote_environment_is_active_private_and_master_key_preserved():
    script = _load_deploy_module().remote_script_text()
    assert "docker', 'inspect', 'kajovo-prod-api-1'" in script
    assert 'com.docker.compose.project.environment_file' in script
    assert "if master and supplied and master != supplied:" in script
    assert 'umask 077' in script and 'target.chmod(0o600)' in script
    assert script.index('PYENV') < script.index('kajovo-hotel-release prepare')
    assert 'rm -rf "$deploy_root"' not in script


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


def test_removed_integration_configuration_is_not_uploaded(tmp_path, monkeypatch):
    module = _load_deploy_module()
    monkeypatch.setenv('KAJOVO_API_MCP_SIGNING_KEY', 'private-canary-never-upload')
    monkeypatch.setenv('KAJOVO_API_MCP_SERVER_URL', 'https://removed.invalid')
    path = tmp_path / 'payload.json'
    module.write_remote_vars(path)
    assert not any('MCP' in key for key in json.loads(path.read_text()))
    assert 'private-canary-never-upload' not in path.read_text()
    assert 'home-assistant-mcp-public' not in module.remote_script_text()


def test_release_review_requires_content_bound_independent_evidence(monkeypatch):
    script_path = Path(__file__).resolve().parents[3] / 'scripts/check_release_review.py'
    monkeypatch.syspath_prepend(str(script_path.parent))
    spec = importlib.util.spec_from_file_location('release_review', script_path)
    review = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(review)
    requests = []
    def api(path):
        requests.append(path)
        if path.endswith('/commits/main'):
            return {'sha': 'new'}
        if 'actions/workflows' in path:
            return {'workflow_runs': [{'id': 123, 'head_sha': 'new', 'head_branch': 'main', 'status': 'completed', 'conclusion': 'success'}]}
        if path.endswith('/pulls/125'):
            return {'merged': True, 'merge_commit_sha': 'new'}
        raise AssertionError('No external reviewer or paid review API may be queried')
    monkeypatch.setattr(review, 'api', api)
    monkeypatch.setattr(review, 'verify_independent', lambda *args: (_ for _ in ()).throw(RuntimeError('independent_review_not_pass')))
    import pytest
    with pytest.raises(RuntimeError, match='independent_review_not_pass'):
        review.verify('new', '125')
    validated = []
    monkeypatch.setattr(review, 'verify_independent', lambda *args: validated.append(args))
    review.verify('new', '125')
    assert validated[0][1:] == ('hotel', 'new')
    assert all('/reviews' not in path and 'graphql' not in path for path in requests)


def test_release_requires_latest_successful_exact_main_ci_for_every_workflow(monkeypatch):
    path = Path(__file__).resolve().parents[3] / 'scripts/check_release_review.py'
    monkeypatch.syspath_prepend(str(path.parent))
    spec = importlib.util.spec_from_file_location('release_ci', path)
    review = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(review)
    monkeypatch.setattr(review, 'verify_independent', lambda *args: None)
    import pytest
    for blocked_workflow in review.REQUIRED_WORKFLOWS:
        for failure in [{'head_sha': 'other', 'head_branch': 'main', 'status': 'completed', 'conclusion': 'success'},
                        {'head_sha': 'sha', 'head_branch': 'topic', 'status': 'completed', 'conclusion': 'success'},
                        {'head_sha': 'sha', 'head_branch': 'main', 'status': 'in_progress', 'conclusion': None},
                        {'head_sha': 'sha', 'head_branch': 'main', 'status': 'completed', 'conclusion': 'failure'}]:
            def api(endpoint):
                if endpoint.endswith('/commits/main'):
                    return {'sha': 'sha'}
                if 'actions/workflows' in endpoint:
                    run = failure if blocked_workflow in endpoint else {'head_sha': 'sha', 'head_branch': 'main', 'status': 'completed', 'conclusion': 'success'}
                    return {'workflow_runs': [run]}
                return {'merged': True, 'merge_commit_sha': 'sha'}
            monkeypatch.setattr(review, 'api', api)
            with pytest.raises(RuntimeError, match='exact_main_ci_required'):
                review.verify('sha', '125')
