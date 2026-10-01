"""The release workflow preserves source trust, complete checks and cutover fencing."""
import ast
import importlib.util
import os
import re
import subprocess
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
    condition = deploy_job()['if'].replace('&&', ' and ').replace('||', ' or ').strip()
    tree = ast.parse(condition, mode='eval')
    allowed = (ast.Expression, ast.BoolOp, ast.And, ast.Or, ast.Compare, ast.Eq,
               ast.Attribute, ast.Name, ast.Constant, ast.Load)
    assert all(isinstance(node, allowed) for node in ast.walk(tree)), 'unsupported trust condition'
    github = SimpleNamespace(ref=ref, event_name=event, repository='hotel/repo', event=SimpleNamespace(
        workflow_run=SimpleNamespace(conclusion=result, head_branch=branch,
                                     head_repository=SimpleNamespace(full_name=repository))))
    return eval(compile(tree, '<workflow trust condition>', 'eval'), {'__builtins__': {}}, {'github': github})


@pytest.mark.parametrize('event,ref,branch,result,repo,expected', [
    ('workflow_dispatch', 'refs/heads/main', 'main', 'success', 'hotel/repo', True),
    ('workflow_dispatch', 'refs/heads/topic', 'main', 'success', 'hotel/repo', False),
    ('workflow_dispatch', 'refs/tags/release', 'main', 'success', 'hotel/repo', False),
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
    job = deploy_job()
    steps = job['steps']
    gate = next(i for i, step in enumerate(steps) if 'scripts/check_release_review.py' in step.get('run', ''))
    checkouts = [(i, step['with']['ref']) for i, step in enumerate(steps)
                 if step.get('uses', '').startswith('actions/checkout@')]
    assert checkouts[0] == (0, '${{ github.sha }}')
    assert checkouts[1][0] > gate
    assert checkouts[1][1] == '${{ env.DEPLOY_SHA }}'
    assert not any('secrets.' in value for value in job['env'].values())
    for step in steps[:gate + 1]:
        assert not any('secrets.' in value for value in step.get('env', {}).values())
    secret_steps = [i for i, step in enumerate(steps)
                    if any('secrets.' in value for value in step.get('env', {}).values())]
    assert secret_steps and min(secret_steps) > checkouts[1][0]


def test_verified_environment_handoff_preserves_multiline_values_without_printing(tmp_path):
    step = next(step for step in deploy_job()['steps'] if 'GITHUB_ENV' in step.get('run', '')
                and 'hotel_env_' in step.get('run', ''))
    target = tmp_path / 'runner.env'
    key = 'synthetic-key-line-1\nsynthetic-key-line-2\n'
    env = {**os.environ, 'GITHUB_ENV': str(target), 'HOTEL_DEPLOY_KEY': key,
           'KAJOVO_API_VOICE_MASTER_KEY': 'synthetic-voice-canary'}
    result = subprocess.run(['bash', '-euo', 'pipefail', '-c', step['run']], env=env,
                            capture_output=True, text=True)
    assert result.returncode == 0
    assert result.stdout == result.stderr == ''
    body = target.read_text()
    assert key in body and 'synthetic-voice-canary' in body
    assert target.stat().st_mode & 0o777 == 0o600
    assert 'KAJOVO_API_MCP_SIGNING_KEY' not in step['env']


def test_one_main_authority_and_direct_push_needs_no_pull_request():
    assert 'main' in workflow('ci-gates.yml')['on']['push']['branches']
    for name in ('ci-full.yml', 'release.yml'):
        assert 'push' not in workflow(name)['on']
    assert 'pull_request' in workflow('ci-core.yml')['on']
    deploy = workflow('deploy-production.yml')
    assert deploy['on']['workflow_run']['workflows'] == ['CI Gates - Kajovo Hotel']
    assert deploy['on']['workflow_dispatch']['inputs']['review_pr']['required'] == 'false'
    spec = importlib.util.spec_from_file_location('workflow_release_gate', ROOT / 'scripts/check_release_review.py')
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    import sys
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


@pytest.mark.parametrize('failed_job', [
    'api-runtime-image', 'web-tests', 'e2e-smoke', 'guardrails',
    'lint', 'typecheck', 'unit-tests', 'portable-voice-core', None,
])
def test_actual_aggregate_script_cannot_pass_any_required_job_failure(failed_job):
    aggregate = workflow('ci-gates.yml')['jobs']['release-gate']
    assert aggregate['if'] == 'always()'
    assert set(aggregate['needs']) == {
        'api-runtime-image', 'web-tests', 'e2e-smoke', 'guardrails',
        'lint', 'typecheck', 'unit-tests', 'portable-voice-core'}
    script = aggregate['steps'][0]['run']
    for job in aggregate['needs']:
        script = script.replace('${{ needs.' + job + '.result }}', 'failure' if job == failed_job else 'success')
    result = subprocess.run(['bash', '-euo', 'pipefail', '-c', script],
                            env={**os.environ, 'GITHUB_SHA': 'a' * 40}, capture_output=True, text=True)
    assert (result.returncode == 0) is (failed_job is None)
    assert ('All authoritative main CI jobs PASS' in result.stdout) is (failed_job is None)


@pytest.mark.parametrize('old_ref,new_ref', [
    ('refs/heads/main', 'refs/heads/main'), ('refs/heads/topic', 'refs/heads/main'),
])
def test_old_or_manual_source_cannot_cancel_newer_main_source(old_ref, new_ref):
    config = workflow('ci-gates.yml')
    group = config['concurrency']['group']
    def resolve(ref, sha):
        return group.replace('${{ github.ref }}', ref).replace('${{ github.sha }}', sha)
    assert resolve(old_ref, 'a' * 40) != resolve(new_ref, 'b' * 40)
    assert config['concurrency']['cancel-in-progress'] == 'false'
    assert not any('/cancel' in step.get('run', '') for job in config['jobs'].values()
                   for step in job.get('steps', []))


def test_hotel_waits_for_root_transaction_before_any_upload_or_runtime_mutation():
    steps = deploy_job()['steps']
    check = next(i for i, step in enumerate(steps) if 'check-transaction' in step.get('run', ''))
    deploy = next(i for i, step in enumerate(steps) if 'github_deploy_via_ssh.py deploy' in step.get('run', ''))
    assert check < deploy
    assert not any('cutover.py' in step.get('run', '') for step in steps)
