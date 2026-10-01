"""Bind actual independent reviews to the complete hotel candidate source tree.

Only the two review evidence documents are excluded. Execution must be performed
by independent agents; JSON consistency alone is not proof of execution.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

from ci_scope import EXCLUDED_EVIDENCE, changed_paths, classify

EVIDENCE = 'docs/voice-core-independent-review.json'
EXCLUDED = {path.encode() for path in EXCLUDED_EVIDENCE}
BASELINES = {'hotel': 'a6e6a35335d683cefefb524f13ed23011ce80329'}
AREAS = {'A': 'protocol', 'B': 'security', 'C': 'isolation', 'D': 'deployment',
         'E': 'artifact_closure', 'F': 'test_gaps'}
TARGETED_AREAS = {'U': 'client_contract', 'F': 'test_gaps'}
SEVERITIES = {'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'}


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


def source_fingerprint(root: Path, ref='HEAD') -> str:
    entries = subprocess.check_output(['git', '-C', str(root), 'ls-tree', '-r', '-z', '--full-tree', ref])
    records = [entry for entry in entries.split(b'\0')
               if entry and entry.split(b'\t', 1)[1] not in EXCLUDED]
    return hashlib.sha256(b'\0'.join(sorted(records)) + b'\0').hexdigest()


def validate_findings(data, areas):
    counts = dict.fromkeys(SEVERITIES, 0)
    identifiers = set()
    require(isinstance(data.get('findings'), list), 'review_findings_required')
    for finding in data['findings']:
        require(isinstance(finding, dict), 'finding_identity_invalid')
        identifier, severity = finding.get('id'), finding.get('severity')
        require(isinstance(identifier, str) and identifier and identifier not in identifiers
                and severity in SEVERITIES, 'finding_identity_invalid')
        identifiers.add(identifier)
        require(finding.get('status') in {'resolved', 'open'}, 'finding_status_required')
        if finding['status'] == 'resolved':
            fix, tests, verified = finding.get('fix'), finding.get('regression_tests'), finding.get('verified_by')
            require(isinstance(fix, str) and bool(fix.strip())
                    and isinstance(tests, list) and bool(tests)
                    and all(isinstance(test, str) and bool(test.strip()) for test in tests)
                    and isinstance(verified, list) and bool(verified)
                    and all(isinstance(area, str) and area in areas for area in verified),
                    'finding_resolution_evidence_required')
        else:
            counts[severity] += 1
            require(severity == 'LOW' and finding.get('security') is False and finding.get('correctness') is False
                    and finding.get('production_reliability') is False and bool(finding.get('documented_reason')),
                    'open_blocking_review_finding')
    require(data.get('open_counts') == counts, 'review_findings_count_mismatch')


def validate(data, repo, fingerprint, areas=None):
    areas = AREAS if areas is None else areas
    require(repo == 'hotel', 'hotel_review_required')
    require(isinstance(data, dict) and data.get('schema') == 'independent_codex_forensic_review.v3',
            'review_schema_required')
    require(data.get('kind') == 'Independent Codex multi-agent forensic review', 'independent_review_required')
    require(data.get('result') == 'PASS', 'independent_review_not_pass')
    sources = data.get('reviewed_sources', {})
    require(set(sources) == {'hotel'}, 'hotel_review_source_required')
    source = sources['hotel']
    require(source.get('baseline') == BASELINES['hotel'], 'cumulative_review_baseline_mismatch')
    require(re.fullmatch(r'[a-f0-9]{40}', source.get('sha', '')) is not None, 'reviewed_sha_required')
    require(source.get('source_fingerprint') == fingerprint, 'candidate_source_not_reviewed')
    reviewers = data.get('reviewers', [])
    require(len(reviewers) == len(areas) and {r.get('area') for r in reviewers} == set(areas),
            'independent_reviewers_required')
    identities = [r.get('agent_id') for r in reviewers]
    require(all(isinstance(identity, str) and identity.strip() for identity in identities)
            and len(set(identities)) == len(areas), 'distinct_independent_agents_required')
    for reviewer in reviewers:
        require(reviewer.get('scope') == areas[reviewer['area']], 'review_area_mismatch')
        require(reviewer.get('result') == 'PASS'
                and reviewer.get('reviewed_fingerprints') == {'hotel': fingerprint},
                'final_candidate_review_required')
        require(isinstance(reviewer.get('evidence'), str) and bool(reviewer['evidence'].strip()),
                'review_evidence_required')
    validate_findings(data, areas)
    return data


def _read_evidence(root, ref):
    body = subprocess.check_output(['git', '-C', str(root), 'show', f'{ref}:{EVIDENCE}'],
                                   stderr=subprocess.DEVNULL)
    return json.loads(body)


def review_scope(root, repo='hotel', ref='HEAD'):
    require(repo == 'hotel', 'hotel_review_required')
    try:
        revisions = subprocess.check_output(
            ['git', '-C', str(root), 'rev-list', f'{ref}^', '--', EVIDENCE],
            stderr=subprocess.DEVNULL, text=True).splitlines()
    except subprocess.CalledProcessError:
        revisions = []
    for revision in revisions:
        try:
            # Only a complete verified review can anchor cumulative risk.
            validate(_read_evidence(root, revision), repo, source_fingerprint(root, revision))
            paths = [path for path in changed_paths(root, revision, ref) if path not in EXCLUDED_EVIDENCE]
            routed = classify(paths)
            return {'profile': routed['review_profile'], 'anchor': revision,
                    'changed_paths': paths, 'reason': ','.join(routed['reasons'])}
        except (RuntimeError, ValueError, KeyError, TypeError, subprocess.CalledProcessError):
            continue
    return {'profile': 'full', 'anchor': None, 'changed_paths': [],
            'reason': 'no_content_verified_review_ancestor'}


def verify(root: Path, repo='hotel', ref='HEAD'):
    fingerprint = source_fingerprint(root, ref)
    try:
        data = _read_evidence(root, ref)
    except (ValueError, subprocess.CalledProcessError):
        data = None
    try:
        return validate(data, repo, fingerprint)
    except (RuntimeError, TypeError, KeyError):
        pass
    actual = review_scope(root, repo, ref)
    if actual['profile'] == 'none':
        return {'schema': 'inherited_independent_review.v2', 'result': 'PASS', 'scope': actual,
                'source_fingerprint': fingerprint}
    require(data is not None, 'full_independent_review_required')
    if actual['profile'] == 'targeted':
        declared = data.get('scope', {})
        require(declared.get('profile') == actual['profile'] and declared.get('anchor') == actual['anchor']
                and declared.get('changed_paths') == actual['changed_paths'], 'cumulative_review_scope_mismatch')
        return validate(data, repo, fingerprint, TARGETED_AREAS)
    return validate(data, repo, fingerprint)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', choices=BASELINES, default='hotel')
    parser.add_argument('--ref', default='HEAD')
    args = parser.parse_args()
    result = verify(Path(__file__).resolve().parents[1], args.repo, args.ref)
    profile = result.get('scope', {}).get('profile', 'full')
    print(f'Independent Codex forensic review PASS; profile {profile}; CRITICAL/HIGH/MEDIUM 0')
