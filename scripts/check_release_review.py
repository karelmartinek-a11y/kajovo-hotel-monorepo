"""Release gate: exact current main CI plus content-bound independent review."""
import argparse
import json
import os
import subprocess
from urllib.request import Request, urlopen
from pathlib import Path

from independent_review import reviewed_mcp_source, verify as verify_independent

REQUIRED_WORKFLOWS = ['ci-gates.yml']


def api(path):
    try:
        return json.loads(subprocess.check_output(['gh', 'api', path]))
    except FileNotFoundError:
        token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
        if not token:
            raise RuntimeError('release_api_token_required') from None
        request = Request('https://api.github.com/' + path,
                          headers={'Authorization': f'Bearer {token}',
                                   'Accept': 'application/vnd.github+json',
                                   'X-GitHub-Api-Version': '2022-11-28'})
        with urlopen(request, timeout=30) as response:
            return json.load(response)


def verify(sha, pr=None, github_output=None):
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
    review = verify_independent(Path(__file__).resolve().parents[1], 'hotel', sha)
    profile = (review or {}).get('scope', {}).get('profile', 'full')
    mcp_sha = reviewed_mcp_source(review)['sha'] if review else None
    if github_output:
        if not mcp_sha or not isinstance(latest.get('id'), int) or latest['id'] <= 0:
            raise RuntimeError('verified_release_metadata_required')
        with open(github_output, 'a', encoding='utf-8') as output:
            output.write(f'ci_run_id={latest["id"]}\nreview_profile={profile}\nmcp_sha={mcp_sha}\nreviewed_mcp_sha={mcp_sha}\n')
    print(f'Exact current-main CI Gates and independent review policy PASS ({profile})')
    return latest.get('id')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sha', required=True)
    parser.add_argument('--pr', required=False)
    parser.add_argument('--github-output')
    args = parser.parse_args()
    verify(args.sha, args.pr, args.github_output)
