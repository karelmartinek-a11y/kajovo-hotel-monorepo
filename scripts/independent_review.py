"""Verify actual multi-agent review evidence against the complete candidate tree.

Only the two evidence documents are excluded to avoid a self-referential digest.
Source, tests, configuration, workflows, instructions and all other docs are bound.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

EVIDENCE = 'docs/native-mcp-independent-review.json'
EXCLUDED = {EVIDENCE.encode(), b'docs/native-mcp-independent-review.md'}
BASELINES = {'hotel': '0aa675d2c8d5af471bcb55953b58ddbe0ea67893',
             'agentha': '251902e614012e84c9b5f86d2a672641ee733bde'}
AREAS = {'A': 'protocol', 'B': 'security', 'C': 'ha_safety', 'D': 'deployment',
         'E': 'legacy_absence', 'F': 'test_gaps'}
SEVERITIES = {'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'}


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


def source_fingerprint(root: Path, ref='HEAD') -> str:
    entries = subprocess.check_output(['git', '-C', str(root), 'ls-tree', '-r', '-z', '--full-tree', ref])
    records = [entry for entry in entries.split(b'\0') if entry and entry.split(b'\t', 1)[1] not in EXCLUDED]
    return hashlib.sha256(b'\0'.join(sorted(records)) + b'\0').hexdigest()


def validate(data, repo, fingerprint):
    require(data.get('schema') == 'independent_codex_forensic_review.v1', 'review_schema_required')
    require(data.get('kind') == 'Independent Codex multi-agent forensic review', 'independent_review_required')
    require(data.get('result') == 'PASS', 'independent_review_not_pass')
    sources = data.get('reviewed_sources', {})
    require(set(sources) == set(BASELINES), 'cumulative_review_sources_required')
    for name, baseline in BASELINES.items():
        source = sources[name]
        require(source.get('baseline') == baseline, 'cumulative_review_baseline_mismatch')
        require(re.fullmatch(r'[a-f0-9]{40}', source.get('sha', '')) is not None, 'reviewed_sha_required')
        require(re.fullmatch(r'[a-f0-9]{64}', source.get('source_fingerprint', '')) is not None, 'reviewed_fingerprint_required')
    require(repo in sources and sources[repo]['source_fingerprint'] == fingerprint, 'candidate_source_not_reviewed')
    reviewers = data.get('reviewers', [])
    require(len(reviewers) == 6 and {r.get('area') for r in reviewers} == set(AREAS), 'six_independent_reviewers_required')
    identities = [r.get('agent_id') for r in reviewers]
    require(all(isinstance(identity, str) and identity.strip() for identity in identities) and len(set(identities)) == 6,
            'distinct_independent_agents_required')
    expected = {name: source['source_fingerprint'] for name, source in sources.items()}
    for reviewer in reviewers:
        require(reviewer.get('scope') == AREAS[reviewer['area']], 'review_area_mismatch')
        require(reviewer.get('result') == 'PASS' and reviewer.get('reviewed_fingerprints') == expected,
                'final_candidate_review_required')
        require(isinstance(reviewer.get('evidence'), str) and bool(reviewer['evidence'].strip()), 'review_evidence_required')
    counts = dict.fromkeys(SEVERITIES, 0)
    identifiers = set()
    require(isinstance(data.get('findings'), list), 'review_findings_required')
    for finding in data['findings']:
        identifier, severity = finding.get('id'), finding.get('severity')
        require(identifier and identifier not in identifiers and severity in SEVERITIES, 'finding_identity_invalid')
        identifiers.add(identifier)
        require(finding.get('status') in {'resolved', 'open'}, 'finding_status_required')
        if finding['status'] == 'resolved':
            fix, tests, verified = finding.get('fix'), finding.get('regression_tests'), finding.get('verified_by')
            require(isinstance(fix, str) and bool(fix.strip())
                    and isinstance(tests, list) and bool(tests)
                    and all(isinstance(test, str) and bool(test.strip()) for test in tests)
                    and isinstance(verified, list) and bool(verified)
                    and all(isinstance(area, str) and area in AREAS for area in verified),
                    'finding_resolution_evidence_required')
        else:
            counts[severity] += 1
            require(severity == 'LOW' and finding.get('security') is False and finding.get('correctness') is False
                    and finding.get('production_reliability') is False and bool(finding.get('documented_reason')),
                    'open_blocking_review_finding')
    require(data.get('open_counts') == counts, 'review_findings_count_mismatch')
    return data


def verify(root: Path, repo, ref='HEAD'):
    body = subprocess.check_output(['git', '-C', str(root), 'show', f'{ref}:{EVIDENCE}'])
    return validate(json.loads(body), repo, source_fingerprint(root, ref))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', choices=BASELINES, required=True)
    parser.add_argument('--ref', default='HEAD')
    args = parser.parse_args()
    verify(Path(__file__).resolve().parents[1], args.repo, args.ref)
    print('Independent Codex multi-agent forensic review: exact candidate source PASS; CRITICAL/HIGH/MEDIUM 0')
