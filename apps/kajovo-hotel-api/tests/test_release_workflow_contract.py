"""Release source trust, cumulative validation and conditional fail-closed checks."""
import ast
import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[3]


def workflow(name):
    return yaml.load((ROOT / '.github/workflows' / name).read_text(), Loader=yaml.BaseLoader)


def deploy_job():
    return workflow('deploy-production.yml')['jobs']['deploy-production']


def deploy_allowed(event, ref='refs/heads/main', branch='main', result='success', repository='hotel/repo'):
    config = workflow('deploy-production.yml')
    if event not in config['on']:
        return False
    condition = config['jobs']['candidate']['if'].replace('&&', ' and ').replace('||', ' or ').strip()
    tree = ast.parse(condition, mode='eval')
    allowed = (ast.Expression, ast.BoolOp, ast.And, ast.Or, ast.Compare, ast.Eq, ast.NotEq,
               ast.Attribute, ast.Name, ast.Constant, ast.Load)
    assert all(isinstance(node, allowed) for node in ast.walk(tree))
    github = SimpleNamespace(ref=ref, event_name=event, repository='hotel/repo', event=SimpleNamespace(
        workflow_run=SimpleNamespace(conclusion=result, head_branch=branch,
                                     head_repository=SimpleNamespace(full_name=repository))))
    return eval(compile(tree, '<workflow trust condition>', 'eval'), {'__builtins__': {}}, {'github': github})


@pytest.mark.parametrize('event,ref,branch,result,repo,expected', [
    ('workflow_dispatch', 'refs/heads/main', 'main', 'success', 'hotel/repo', True),
    ('workflow_dispatch', 'refs/heads/topic', 'main', 'success', 'hotel/repo', False),
    ('workflow_dispatch', 'refs/tags/release', 'main', 'success', 'hotel/repo', False),
    ('schedule', 'refs/heads/main', 'main', 'success', 'hotel/repo', False),
    ('repository_dispatch', 'refs/heads/main', 'main', 'success', 'hotel/repo', False),
    ('workflow_run', 'refs/heads/main', 'main', 'success', 'hotel/repo', True),
    ('workflow_run', 'refs/heads/main', 'main', 'failure', 'hotel/repo', False),
    ('workflow_run', 'refs/heads/main', 'main', 'cancelled', 'hotel/repo', False),
    ('workflow_run', 'refs/heads/main', 'topic', 'success', 'hotel/repo', False),
    ('workflow_run', 'refs/heads/main', 'main', 'success', 'foreign/repo', False),
    ('workflow_run', 'refs/heads/topic', 'main', 'success', 'hotel/repo', False),
    ('pull_request', 'refs/heads/main', 'main', 'success', 'hotel/repo', False),
])
def test_only_trusted_main_deployment_context_is_eligible(event, ref, branch, result, repo, expected):
    assert deploy_allowed(event, ref, branch, result, repo) is expected


def test_unverified_candidate_never_supplies_the_gate_code_or_production_secrets():
    config = workflow('deploy-production.yml')
    for name in ('prepare-release', 'deploy-production'):
        job = config['jobs'][name]
        steps = job['steps']
        gate = next(i for i, step in enumerate(steps) if 'scripts/check_release_review.py' in step.get('run', ''))
        checkouts = [(i, step['with']['ref']) for i, step in enumerate(steps)
                     if step.get('uses', '').startswith('actions/checkout@')]
        assert checkouts[0][1] == '${{ github.sha }}' and checkouts[0][0] < gate
        assert not any('scripts/' in step.get('run', '') for step in steps[:checkouts[0][0]])
        assert not any('secrets.' in value for value in job.get('env', {}).values())
        for step in steps[:gate + 1]:
            assert not any('secrets.' in value for value in step.get('env', {}).values())
        secret_steps = [i for i, step in enumerate(steps)
                        if any('secrets.' in value for value in step.get('env', {}).values())]
        assert all(index > gate for index in secret_steps)
        if name == 'prepare-release':
            assert not secret_steps and 'environment' not in job
        if name == 'deploy-production':
            assert checkouts[1][0] > gate and checkouts[1][1] == '${{ env.DEPLOY_SHA }}'
            bundle = next(i for i, step in enumerate(steps) if 'release_images.py verify' in step.get('run', ''))
            assert checkouts[1][0] < bundle < min(secret_steps)


def test_verified_environment_handoff_preserves_multiline_values_without_printing(tmp_path):
    step = next(step for step in deploy_job()['steps'] if 'GITHUB_ENV' in step.get('run', '')
                and 'hotel_env_' in step.get('run', ''))
    target = tmp_path / 'runner.env'
    key = 'synthetic-key-line-1\nsynthetic-key-line-2\n'
    env = {**os.environ, 'GITHUB_ENV': str(target), 'HOTEL_DEPLOY_KEY': key,
           'KAJOVO_API_VOICE_MASTER_KEY': 'synthetic-voice-canary'}
    result = subprocess.run(['bash', '-euo', 'pipefail', '-c', step['run']], env=env,
                            capture_output=True, text=True)
    assert result.returncode == 0 and result.stdout == result.stderr == ''
    assert key in target.read_text() and 'synthetic-voice-canary' in target.read_text()
    assert target.stat().st_mode & 0o777 == 0o600
    assert not any('MCP' in key for key in step['env'])


def test_container_git_trust_uses_only_exact_workspace_before_source_gate(tmp_path):
    steps = deploy_job()['steps']
    trust = next(i for i, step in enumerate(steps)
                 if step.get('name') == 'Trust exact workspace for container Git verification')
    checkout = next(i for i, step in enumerate(steps)
                    if step.get('uses', '').startswith('actions/checkout@'))
    gate = next(i for i, step in enumerate(steps)
                if 'scripts/check_release_review.py' in step.get('run', ''))
    assert checkout < trust < gate
    script = steps[trust]['run']
    assert script == 'git config --global --add safe.directory "$GITHUB_WORKSPACE"'
    home = tmp_path / 'isolated-home'
    home.mkdir()
    env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
    env.update(HOME=str(home), GIT_CONFIG_NOSYSTEM='1', LANG='C')
    repos = [tmp_path / 'reviewed workspace', tmp_path / 'untrusted workspace']
    for repo in repos:
        subprocess.run(['git', 'init', '--quiet', str(repo)], env=env, check=True)
        subprocess.run(['git', '-C', str(repo), '-c', 'user.name=Trust fixture',
                        '-c', 'user.email=trust@example.test', 'commit', '--allow-empty',
                        '--quiet', '-m', 'Synthetic trust scope'], env=env, check=True)
    env.update(GIT_TEST_ASSUME_DIFFERENT_OWNER='1', GITHUB_WORKSPACE=str(repos[0]))
    def inspect(repo):
        return subprocess.run(['git', '-C', str(repo), 'ls-tree', 'HEAD'], env=env,
                              capture_output=True, text=True)
    for repo in repos:
        before = inspect(repo)
        assert before.returncode == 128 and 'dubious ownership' in before.stderr
    result = subprocess.run(['bash', '-euo', 'pipefail', '-c', script], env=env,
                            capture_output=True, text=True)
    assert result.returncode == 0 and result.stdout == result.stderr == ''
    assert inspect(repos[0]).returncode == 0
    candidate = subprocess.run(['git', '-C', str(repos[0]), 'checkout', '--detach', 'HEAD'],
                               env=env, capture_output=True, text=True)
    assert candidate.returncode == 0 and inspect(repos[0]).returncode == 0
    other = inspect(repos[1])
    assert other.returncode == 128 and 'dubious ownership' in other.stderr


def test_one_main_authority_and_direct_push_needs_no_pull_request():
    assert 'main' in workflow('ci-gates.yml')['on']['push']['branches']
    core = workflow('ci-core.yml')
    assert 'pull_request' in core['on'] and 'push' not in core['on']
    assert core['jobs']['validate']['uses'] == './.github/workflows/ci-gates.yml'
    assert 'concurrency' not in core
    for name in ('ci-full.yml', 'release.yml'):
        assert set(workflow(name)['on']) == {'workflow_dispatch'}
    deploy = workflow('deploy-production.yml')
    assert deploy['on']['workflow_run']['workflows'] == ['CI Gates - Kajovo Hotel']
    assert deploy['on']['workflow_dispatch']['inputs']['review_pr']['required'] == 'false'
    spec = importlib.util.spec_from_file_location('workflow_release_gate', ROOT / 'scripts/check_release_review.py')
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(ROOT / 'scripts'))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.pop(0)
    assert module.REQUIRED_WORKFLOWS == ['ci-gates.yml']


@pytest.mark.parametrize('command', [
    'ci:text-integrity', 'ci:frontend-manifest', 'ci:legacy-guards', 'ci:runtime-integrity',
])
def test_authoritative_gate_executes_each_required_integrity_check(command):
    steps = workflow('ci-gates.yml')['jobs']['guardrails']['steps']
    assert any(re.search(r'\bpnpm\s+' + re.escape(command) + r'(?:\s|$)', step.get('run', '')) for step in steps)


@pytest.mark.parametrize('bad_result', ['failure', 'cancelled', 'skipped', '', None])
def test_actual_aggregate_script_cannot_pass_any_required_job_failure(tmp_path, bad_result):
    aggregate = workflow('ci-gates.yml')['jobs']['release-gate']
    assert aggregate['if'] == 'always()'
    script = next(step['run'] for step in aggregate['steps'] if 'check_ci_required_jobs.py' in step.get('run', ''))
    assert 'python scripts/check_ci_required_jobs.py' in script
    spec = importlib.util.spec_from_file_location('ci_aggregate', ROOT / 'scripts/check_ci_required_jobs.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert set(aggregate['needs']) == set(module.REQUIRED_JOBS)
    outputs = {flag: 'true' for flag in module.FLAGS}
    outputs['review_profile'] = 'full'
    for job in module.REQUIRED_JOBS:
        needs = {name: {'result': 'success', 'outputs': {}} for name in module.REQUIRED_JOBS}
        needs['scope']['outputs'] = outputs
        needs[job]['result'] = bad_result
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/check_ci_required_jobs.py')],
                                cwd=tmp_path, env={**os.environ, 'GITHUB_SHA': 'a' * 40, 'NEEDS_JSON': json.dumps(needs)},
                                capture_output=True, text=True)
        assert result.returncode != 0
        assert not list(tmp_path.glob('artifacts/release-gate/*.json'))


def test_validation_cancellation_and_runtime_transaction_are_separate():
    config = workflow('ci-gates.yml')
    group = config['concurrency']['group']
    assert 'github.ref' in group and 'github.run_id' in group
    assert config['concurrency']['cancel-in-progress'] == "${{ github.event_name != 'workflow_dispatch' }}"
    deploy = workflow('deploy-production.yml')
    assert deploy['concurrency']['cancel-in-progress'] == 'false'
    assert 'github.sha' not in deploy['concurrency']['group']
    assert not any('/cancel' in step.get('run', '') for job in config['jobs'].values()
                   for step in job.get('steps', []))


def test_hotel_accepts_after_live_checks_and_restores_on_failure():
    config = workflow('deploy-production.yml')
    assert set(config['on']) == {'workflow_run', 'workflow_dispatch'}
    assert config['jobs']['prepare-release']['needs'] == 'candidate'
    assert deploy_job()['needs'] == 'prepare-release'
    assert deploy_job()['if'] == "needs.prepare-release.outputs.ready == 'true'"
    steps = deploy_job()['steps']
    activate = next(i for i, s in enumerate(steps) if s.get('id') == 'activate')
    accept = next(i for i, s in enumerate(steps) if 'github_deploy_via_ssh.py accept' in s.get('run', ''))
    checks = [i for i, s in enumerate(steps) if 'verify_live_' in s.get('run', '')]
    assert checks and activate < min(checks) <= max(checks) < accept
    restore = next(s for s in steps if 'github_deploy_via_ssh.py rollback' in s.get('run', ''))
    assert restore['if'] == "failure() && steps.activate.outcome != 'skipped'"
    text = (ROOT / '.github/workflows/deploy-production.yml').read_text()
    assert 'COORDINATED' not in text and 'MCP' not in text


def test_android_consumer_validation_is_separate_from_hotel_deploy_gate():
    config = workflow('ci-gates.yml')
    assert 'android-contract' not in config['jobs'] and 'android-contract' not in config['jobs']['release-gate']['needs']
    native = workflow('android-ci.yml')
    for event in ('push', 'pull_request'):
        assert 'apps/kajovo-hotel-api/openapi.json' in native['on'][event]['paths']
        assert 'packages/shared/src/**' in native['on'][event]['paths']
    steps = native['jobs']['native-android']['steps']
    assert any('testDebugUnitTest' in step.get('run', '') for step in steps)
    assert any('connectedDebugAndroidTest' in step.get('with', {}).get('script', '') for step in steps)
