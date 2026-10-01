"""Execute the shell fence against delayed worker/rollback races."""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def fence(tmp_path):
    # macOS lacks util-linux flock; this equivalent CLI locks the inherited fd.
    executable = tmp_path / 'flock'
    executable.write_text('#!' + sys.executable + '\nimport fcntl,sys\nfcntl.flock(int(sys.argv[-1]), fcntl.LOCK_EX)\n')
    executable.chmod(0o755)
    (tmp_path / 'runtime.lock').touch()
    source = (ROOT / 'infra/ops/deploy-production.sh').read_text()
    fence = source[source.index('TRANSACTION_PUBLIC_DIR='):source.index('require_cmd()')]
    marker = tmp_path / 'mutated'
    script = 'set -eu\nDEPLOY_SOURCE_SHA=' + 'a' * 40 + '\n' + fence + '\ntouch "' + str(marker) + '"'
    environment = {**os.environ, 'PATH': str(tmp_path) + ':' + os.environ['PATH'], 'TRANSACTION_PUBLIC_DIR': str(tmp_path)}
    # The real Linux image supplies python3; use this test interpreter locally.
    python = tmp_path / 'python3'
    python.symlink_to(sys.executable)
    return script, environment, marker


@pytest.mark.parametrize('phase,sha', [('rolled_back', 'a' * 40), ('rolling_back', 'a' * 40), ('accepted', 'a' * 40), ('active', 'b' * 40)])
def test_revoked_or_wrong_sha_worker_cannot_mutate_runtime(tmp_path, fence, phase, sha):
    script, environment, marker = fence
    (tmp_path / 'transaction.json').write_text(json.dumps({'phase': phase, 'hotel_sha': sha}))
    result = subprocess.run(['bash', '-c', script], env=environment, capture_output=True)
    assert result.returncode != 0
    assert b'transaction revoked' in result.stderr
    assert not marker.exists()


def test_delayed_worker_rechecks_revocation_after_exclusive_fence(tmp_path, fence):
    import fcntl
    script, environment, marker = fence
    status = tmp_path / 'transaction.json'
    status.write_text(json.dumps({'phase': 'active', 'hotel_sha': 'a' * 40}))
    with (tmp_path / 'runtime.lock').open('r') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        worker = subprocess.Popen(['bash', '-c', script], env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        time.sleep(.1)
        assert worker.poll() is None
        status.write_text(json.dumps({'phase': 'rolled_back', 'hotel_sha': 'a' * 40}))
        fcntl.flock(lock, fcntl.LOCK_UN)
    _, error = worker.communicate(timeout=5)
    assert worker.returncode != 0
    assert b'transaction revoked' in error
    assert not marker.exists()


def test_active_exact_worker_can_continue(tmp_path, fence):
    script, environment, marker = fence
    (tmp_path / 'transaction.json').write_text(json.dumps({'phase': 'active', 'hotel_sha': 'a' * 40}))
    subprocess.run(['bash', '-c', script], env=environment, check=True)
    assert marker.exists()
