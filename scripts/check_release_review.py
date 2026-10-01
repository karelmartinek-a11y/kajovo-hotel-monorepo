"""Release gate: exact current main CI plus content-bound independent review."""
import argparse
import json
import subprocess
from pathlib import Path

from independent_review import verify as verify_independent

REQUIRED_WORKFLOWS = ['ci-gates.yml']


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', path]))


def verify(sha, pr=None):
    repo = 'karelmartinek-a11y/kajovo-hotel-monorepo'
    if api(f'repos/{repo}/commits/main')['sha'] != sha:
        raise RuntimeError('release_must_be_current_main')
    for workflow in REQUIRED_WORKFLOWS:
        runs = api(f'repos/{repo}/actions/workflows/{workflow}/runs?head_sha={sha}')['workflow_runs']
        matching = [run for run in runs if run['head_branch'] == 'main' and run['head_sha'] == sha]
        latest = max(matching, key=lambda run: (run.get('created_at', ''), run.get('id', 0)), default={})
        if latest.get('status') != 'completed' or latest.get('conclusion') != 'success':
            raise RuntimeError('exact_main_ci_required')
    if pr:
        pull = api(f'repos/{repo}/pulls/{pr}')
        if not pull['merged'] or pull['merge_commit_sha'] != sha:
            raise RuntimeError('verified_release_pr_mismatch')
    verify_independent(Path(__file__).resolve().parents[1], 'hotel', sha)
    print('Exact current-main CI Gates and Independent Codex forensic review PASS')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sha', required=True)
    parser.add_argument('--pr', required=False)
    args = parser.parse_args()
    verify(args.sha, args.pr)
