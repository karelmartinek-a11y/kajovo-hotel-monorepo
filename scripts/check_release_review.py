"""Independent release gates: exact main CI and completed, resolved code review."""
import argparse
import json
import subprocess


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', path]))


def verify(sha, pr):
    repo = 'karelmartinek-a11y/kajovo-hotel-monorepo'
    assert api(f'repos/{repo}/commits/main')['sha'] == sha, 'release_must_be_current_main'
    runs = api(f'repos/{repo}/actions/workflows/ci-gates.yml/runs?head_sha={sha}')['workflow_runs']
    assert any(r['head_branch'] == 'main' and r['conclusion'] == 'success' for r in runs), 'exact_main_ci_required'
    pull = api(f'repos/{repo}/pulls/{pr}')
    assert pull['merged'] and pull['merge_commit_sha'] == sha, 'reviewed_release_required'
    reviews = api(f'repos/{repo}/pulls/{pr}/reviews')
    assert any(r['commit_id'] == pull['head']['sha'] and r['state'] in ['APPROVED', 'COMMENTED']
               and r['user']['login'] == 'copilot-pull-request-reviewer[bot]'
               for r in reviews), 'completed_head_review_required'
    for number in {122, int(pr)}:
        query = 'query { repository(owner:"karelmartinek-a11y",name:"kajovo-hotel-monorepo") { pullRequest(number:NUMBER) { reviewThreads(first:100) { nodes { isResolved } pageInfo { hasNextPage } } } } }'.replace('NUMBER', str(number))
        data = json.loads(subprocess.check_output(['gh', 'api', 'graphql', '-f', 'query=' + query]))
        threads = data['data']['repository']['pullRequest']['reviewThreads']
        assert not threads['pageInfo']['hasNextPage'], 'review_pagination_required'
        assert all(t['isResolved'] for t in threads['nodes']), 'unresolved_review_findings'
    print('Exact SHA CI and completed/resolved review PASS')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sha', required=True)
    parser.add_argument('--pr', required=True)
    args = parser.parse_args()
    verify(args.sha, args.pr)
