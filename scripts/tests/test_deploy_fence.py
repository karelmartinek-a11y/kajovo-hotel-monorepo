"""Actual shell fences fail closed even where Bash disables errexit."""
import json
import os
import subprocess
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = (ROOT / 'infra/ops/deploy-production.sh').read_text()
SHA = 'a' * 40
NONCE = 'b' * 32


@pytest.mark.parametrize('mode', ['set +e; compose_cmd up -d api', 'if compose_cmd up -d api; then exit 0; else exit 1; fi'])
@pytest.mark.parametrize('update', [{'phase': 'rolled_back'}, {'transaction_id': 'c' * 32}, {'deadline_epoch': 0}, {}])
def test_revoked_expired_or_replaced_transaction_never_calls_docker(tmp_path, mode, update):
    state = tmp_path / 'state.json'
    state.write_text(json.dumps({'phase': 'active', 'sha': SHA, 'transaction_id': NONCE,
                                'deadline_epoch': time.time() + 60, **update}))
    calls = tmp_path / 'calls'
    docker = tmp_path / 'docker'
    docker.write_text('#!/bin/sh\nprintf called >> "$FENCE_CALLS"\n')
    docker.chmod(0o755)
    checker = SCRIPT[SCRIPT.index('check_release_fence() {'):SCRIPT.index('\ncheck_release_fence\n')]
    compose = SCRIPT[SCRIPT.index('compose_cmd() {'):SCRIPT.index('\nwait_for_container_health()')]
    environment = {**os.environ, 'PATH': str(tmp_path) + ':' + os.environ['PATH'],
                   'HOTEL_RELEASE_STATE_FILE': str(state), 'HOTEL_RELEASE_SHA': SHA,
                   'HOTEL_RELEASE_ID': NONCE, 'DEPLOY_SOURCE_SHA': SHA, 'FENCE_CALLS': str(calls),
                   'COMPOSE_PROJECT_NAME': 'fixture', 'COMPOSE_FILE_BASE': 'base', 'COMPOSE_FILE_HOST': 'host',
                   'COMPOSE_FILE_IMAGES': 'images', 'ENV_FILE': 'private'}
    result = subprocess.run(['bash', '-c', 'set -eu\n' + checker + '\n' + compose + '\n' + mode],
                            env=environment, capture_output=True)
    assert result.returncode == (1 if update else 0)
    assert calls.exists() is (not update)


def test_managed_release_never_recreates_roles_database_or_data_volumes():
    # A healthy runtime and its actual DB revision are required by root prepare.
    for removed in ('CREATE ROLE', 'ALTER ROLE', 'CREATE DATABASE', 'docker volume rm', 'down -v',
                    'git reset', 'git clean', 'sql_do='):
        assert removed not in SCRIPT
    assert 'alembic upgrade head' in SCRIPT


def test_postgres_helper_uses_container_password_and_preserves_stdin(tmp_path):
    psql = tmp_path / 'psql'
    psql.write_text('#!/usr/bin/env python3\nimport os,sys\nassert os.environ["PGPASSWORD"] == os.environ["CONTAINER_PASSWORD"]\nassert sys.stdin.read() == "SELECT 1;\\n"\n')
    psql.chmod(0o755)
    helper = SCRIPT[SCRIPT.index('postgres_cmd() {'):SCRIPT.index('\nwait_for_container_health()')]
    # Compose exec transfers argv/stdin; the host's PGPASSWORD is not propagated.
    compose_stub = """compose_cmd() {
      shift 3
      env -u PGPASSWORD POSTGRES_PASSWORD="$CONTAINER_PASSWORD" "$@"
    }
"""
    env = {**os.environ, 'PATH': str(tmp_path) + ':' + os.environ['PATH'],
           'PGPASSWORD': 'wrong-host-password', 'CONTAINER_PASSWORD': "literal$PRIVATE ' slash\\tail"}
    result = subprocess.run(['bash', '-c', compose_stub + helper + '\npostgres_cmd psql -U fixture -d fixture'],
                            env=env, input='SELECT 1;\n', capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_remote_helper_is_bound_to_reviewed_root_code(monkeypatch):
    import sys
    import hashlib
    sys.path.insert(0, str(ROOT / 'scripts'))
    import github_deploy_via_ssh as transport
    commands = []
    monkeypatch.setattr(transport, 'run_remote', commands.append)
    transport.cmd_check_helper()
    for name in ('hotel_release.py', 'release_images.py'):
        digest = hashlib.sha256((ROOT / 'scripts' / name).read_bytes()).hexdigest()
        assert digest in commands[0] and '/usr/local/lib/kajovo-hotel-release/' + name in commands[0]
    assert 'stat -c %u' in commands[0] and 'stat -c %a' in commands[0]
