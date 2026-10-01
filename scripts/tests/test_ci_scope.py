"""Verify dependency closure and fail-closed routing using actual Git changes."""
import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
SPEC = importlib.util.spec_from_file_location('ci_scope_under_test', ROOT / 'scripts/ci_scope.py')
router = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(router)


def test_isolated_web_change_preserves_every_web_viewport_without_admin_duplicate():
    result = router.classify(['apps/kajovo-hotel-web/src/pages/BreakfastPage.css'])
    assert result['web'] and result['visual_web'] and result['runtime_images']
    assert not result['admin'] and not result['voice'] and not result['full']
    assert result['review_profile'] == 'targeted'


def test_shared_ui_propagates_to_both_frontends():
    result = router.classify(['packages/ui/src/Button.css'])
    assert all(result[key] for key in ('web', 'admin', 'visual_web', 'visual_admin'))
    assert not result['android']


@pytest.mark.parametrize('path', [
    'apps/kajovo-hotel-api/app/api/routes/breakfast.py',
    'apps/kajovo-hotel-api/openapi.json', 'packages/shared/src/generated/client.ts',
    'pnpm-lock.yaml', 'package.json', '.github/workflows/ci-gates.yml', 'AGENTS.md',
    'apps/kajovo-hotel-web/src/auth/session.ts', 'packages/voice-core/src/mcp.ts',
    'infra/docker-compose.yml', 'unexpected/root.txt', 'docs/how-to-deploy.md',
    'apps/kajovo-hotel-web/src/lib/new-helper.ts', 'packages/ui/package.json',
    'docs/native-mcp-impact-matrix.md', 'docs/ci-gates.md', 'docs/testing.md',
    'docs/api-contract.md', 'README.md', 'docs/new-policy.md',
    'apps/kajovo-hotel-web/src/main.tsx', 'apps/kajovo-hotel-admin/src/main.tsx',
    'apps/kajovo-hotel-admin/src/UsersAdmin.tsx', 'packages/ui/src/Button.tsx',
    'apps/kajovo-hotel-web/public/icon.svg', 'brand/logo.svg',
])
def test_unknown_shared_protocol_security_and_toolchain_changes_fail_closed(path):
    result = router.classify([path])
    assert result['full'] and result['android'] and result['api']
    assert result['review_profile'] == 'full'


def test_notes_keep_restoration_images_without_unrelated_browser_work():
    result = router.classify(['docs/notes/user-guide.md', 'docs/archive/history.md'])
    assert result['static']
    assert result['runtime_images']
    assert not any(result[key] for key in router.FLAGS if key not in {'static', 'runtime_images'})
    assert result['review_profile'] == 'none'


def test_rename_to_documentation_keeps_old_runtime_path_in_scope(tmp_path):
    def git(*args):
        return subprocess.check_output(['git', '-C', str(tmp_path), *args], text=True).strip()
    git('init', '-q')
    original = tmp_path / 'packages/voice-core/src/mcp.ts'
    original.parent.mkdir(parents=True)
    original.write_text('export const runtime = 1;')
    git('add', '.')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'initial')
    base = git('rev-parse', 'HEAD')
    (tmp_path / 'docs').mkdir()
    original.rename(tmp_path / 'docs/old.md')
    git('add', '-A')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'rename')
    result = router.scope(tmp_path, base, base_verified=True)
    assert result['full']
    assert result['changed_paths'] == ['docs/old.md', 'packages/voice-core/src/mcp.ts']


def test_missing_history_cannot_skip_required_checks(tmp_path):
    result = router.scope(tmp_path, 'a' * 40)
    assert all(result[key] for key in router.FLAGS)
    assert result['reasons'] == ['unverified_or_missing_git_history']


def test_github_outputs_contain_exact_booleans_and_profile(tmp_path):
    output = tmp_path / 'outputs'
    router.write_outputs(router.classify(['docs/notes/user-guide.md']), output)
    values = dict(line.split('=', 1) for line in output.read_text().splitlines())
    assert {values[flag] for flag in router.FLAGS} == {'true', 'false'}
    assert values['review_profile'] == values['review_scope'] == 'none'


def test_unvalidated_previous_code_push_forces_full_even_when_next_push_is_only_notes(tmp_path):
    def git(*args):
        return subprocess.check_output(['git', '-C', str(tmp_path), *args], text=True).strip()
    git('init', '-q')
    path = tmp_path / 'apps/kajovo-hotel-api/app/runtime.py'
    path.parent.mkdir(parents=True)
    path.write_text('runtime = "unvalidated"')
    git('add', '.')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'unvalidated code')
    base = git('rev-parse', 'HEAD')
    note = tmp_path / 'docs/notes/progress.md'
    note.parent.mkdir(parents=True)
    note.write_text('Evidence only.')
    git('add', '.')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'notes')
    result = router.scope(tmp_path, base)  # No authenticated successful baseline.
    assert all(result[key] for key in router.FLAGS)
    assert result['head'] == git('rev-parse', 'HEAD')


def test_only_latest_authoritative_exact_main_success_authenticates_base(monkeypatch):
    import io
    import json
    monkeypatch.setenv('GH_TOKEN', 'test-only-no-live-call')
    sha = 'a' * 40
    cases = [
        ({'status': 'completed', 'conclusion': 'success'}, True),
        ({'status': 'completed', 'conclusion': 'failure'}, False),
        ({'status': 'in_progress', 'conclusion': None}, False),
        ({'status': 'completed', 'conclusion': 'cancelled'}, False),
        ({'status': 'completed', 'conclusion': 'success', 'head_branch': 'topic'}, False),
        ({'status': 'completed', 'conclusion': 'success', 'head_sha': 'b' * 40}, False),
        ({'status': 'completed', 'conclusion': 'success', 'event': 'pull_request'}, False),
    ]
    def response(runs):
        def get(request, **_kwargs):
            url = request.full_url
            if 'ci-gates.yml' in url:
                body = {'workflow_runs': runs}
            elif 'deploy-production.yml' in url:
                body = {'workflow_runs': [{'head_sha': sha, 'head_branch': 'main', 'id': 123, 'status': 'completed'}]}
            else:
                body = {'jobs': [{'name': 'deploy-production', 'status': 'completed', 'conclusion': 'success'}]}
            return io.BytesIO(json.dumps(body).encode())
        return get
    for changed, expected in cases:
        run = {'head_sha': sha, 'head_branch': 'main', 'event': 'push', 'id': 1,
               'created_at': '2026-10-01T00:00:00Z', **changed}
        monkeypatch.setattr(router, 'urlopen', response([run]))
        assert router.base_ci_verified(sha) is expected
    previous = {'head_sha': sha, 'head_branch': 'main', 'event': 'push', 'id': 1,
                'created_at': '2026-10-01T00:00:00Z', 'status': 'completed', 'conclusion': 'success'}
    latest = {**previous, 'id': 2, 'created_at': '2026-10-01T00:01:00Z', 'conclusion': 'failure'}
    monkeypatch.setattr(router, 'urlopen', response([previous, latest]))
    assert not router.base_ci_verified(sha)


def test_missing_ci_credentials_cannot_authenticate_baseline(monkeypatch):
    monkeypatch.delenv('GH_TOKEN', raising=False)
    monkeypatch.delenv('GITHUB_TOKEN', raising=False)
    assert not router.base_ci_verified('a' * 40)


@pytest.mark.parametrize('production_job,expected', [
    (None, True),
    ({'name': 'deploy-production', 'status': 'completed', 'conclusion': 'skipped'}, True),
    ({'name': 'deploy-production', 'status': 'queued', 'conclusion': None}, True),
    ({'name': 'deploy-production', 'status': 'completed', 'conclusion': 'failure'}, True),
    ({'name': 'deploy-production', 'status': 'completed', 'conclusion': 'success'}, True),
])
def test_test_baseline_does_not_claim_runtime_acceptance_or_omit_restoration(monkeypatch, production_job, expected):
    import io
    import json
    monkeypatch.setenv('GH_TOKEN', 'fixture-no-live-call')
    sha = 'a' * 40
    def response(request, **_kwargs):
        if 'ci-gates.yml' in request.full_url:
            data = {'workflow_runs': [{'head_sha': sha, 'head_branch': 'main', 'event': 'push',
                                      'status': 'completed', 'conclusion': 'success'}]}
        elif 'deploy-production.yml' in request.full_url:
            data = {'workflow_runs': [{'head_sha': sha, 'head_branch': 'main', 'id': 123, 'status': 'completed'}]}
        else:
            data = {'jobs': [production_job] if production_job else []}
        return io.BytesIO(json.dumps(data).encode())
    monkeypatch.setattr(router, 'urlopen', response)
    assert router.base_ci_verified(sha) is expected


def test_notes_after_late_root_rollback_still_have_current_candidate_images():
    result = router.classify(["docs/notes/progress.md"])
    assert result["runtime_images"] is True
    assert result["deploy_required"] is False
    assert result["review_profile"] == "none"
