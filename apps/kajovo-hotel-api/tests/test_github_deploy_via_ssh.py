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
    assert '/etc/home-assistant-mcp-public/signing-key.sha256' in script
    assert 'hashlib.sha256(key.encode()).hexdigest() != expected' in script
    assert script.index('fingerprint mismatch') < script.index('> "$deploy_root/.coordinated-ready"')


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
            return {'workflow_runs': [{'head_sha': 'new', 'head_branch': 'main', 'status': 'completed', 'conclusion': 'success'}]}
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


def test_post_acceptance_cleanup_refuses_to_touch_rollback_early(tmp_path, monkeypatch):
    path = Path(__file__).resolve().parents[3] / 'scripts/cleanup_accepted_release.py'
    spec = importlib.util.spec_from_file_location('accepted_cleanup', path)
    cleanup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cleanup)
    state = tmp_path / 'state.json'
    state.write_text(json.dumps({'phase': 'active'}))
    monkeypatch.setattr(cleanup.subprocess, 'check_output', lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError('early Docker access')))
    import pytest
    with pytest.raises(RuntimeError, match='final_acceptance_required_before_prune'):
        cleanup.cleanup(state)


def test_post_acceptance_cleanup_preserves_current_and_only_removes_unused_captured_images(tmp_path, monkeypatch):
    path = Path(__file__).resolve().parents[3] / 'scripts/cleanup_accepted_release.py'
    spec = importlib.util.spec_from_file_location('accepted_cleanup', path)
    cleanup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cleanup)
    releases = tmp_path / 'releases'
    current = releases / ('a' * 40)
    (current / 'infra').mkdir(parents=True)
    (current / 'keep.txt').write_text('current known good')
    stale = releases / ('b' * 40)
    stale.mkdir()
    (stale / 'remove.txt').write_text('obsolete')
    backup = tmp_path / 'backup'
    backup.mkdir()
    (backup / 'containers.json').write_text(json.dumps([{'Image': image} for image in ['old-unused', 'old-used', 'current-api']]))
    state = tmp_path / 'state.json'
    state.write_text(json.dumps({'phase': 'accepted', 'hotel_sha': 'a' * 40, 'backup': str(backup)}))
    monkeypatch.setattr(cleanup, 'RELEASE_ROOT', releases)
    def output(command):
        if command[:2] == ['docker', 'inspect']:
            return json.dumps([{'Config': {'Labels': {'com.docker.compose.project.working_dir': str(current / 'infra')}}}] * 3).encode()
        if command[:3] == ['docker', 'image', 'ls']:
            return b'old-unused\nold-used\ncurrent-api\n'
        return b'live-container' if command[-1] in ['ancestor=old-used', 'ancestor=current-api'] else b''
    monkeypatch.setattr(cleanup.subprocess, 'check_output', output)
    removals = []
    monkeypatch.setattr(cleanup.subprocess, 'run', lambda command, **kwargs: removals.append(command))
    cleanup.cleanup(state)
    assert (current / 'keep.txt').read_text() == 'current known good'
    assert not stale.exists()
    assert removals == [['docker', 'image', 'rm', 'old-unused']]
    (backup / 'containers.json').unlink()
    state.write_text(json.dumps({'phase': 'accepted_cleanup_pending', 'hotel_sha': 'a' * 40, 'backup': str(backup)}))
    cleanup.cleanup(state)
    assert removals == [['docker', 'image', 'rm', 'old-unused']]
    assert (current / 'keep.txt').exists()


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
