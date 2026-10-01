"""Verify actual multi-agent review evidence against the complete candidate tree.

Source fingerprints bind complete tracked trees, excluding only the two evidence
documents. Scoped reviews derive cumulative changes from a content-verified review
ancestor; arbitrary labels or a push event cannot reduce the required review.
JSON identity/evidence is consistency checking, not authentication of execution.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

from ci_scope import EXCLUDED_EVIDENCE, changed_paths, classify

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


def _read_evidence(root, ref):
    body = subprocess.check_output(['git', '-C', str(root), 'show', f'{ref}:{EVIDENCE}'], stderr=subprocess.DEVNULL)
    return json.loads(body)


def _find_anchor(root, repo, ref, seen):
    # Evidence commits are immutable Git objects. A declared anchor is never
    # accepted merely because it is named by candidate evidence.
    revisions = subprocess.check_output(
        ['git', '-C', str(root), 'rev-list', f'{ref}^', '--', EVIDENCE],
        stderr=subprocess.DEVNULL, text=True).splitlines()
    for revision in revisions:
        if revision in seen:
            continue
        try:
            proof = _verify(root, repo, revision, seen | {ref}, allow_inherit=False)
            return revision, proof
        except (RuntimeError, ValueError, KeyError, TypeError, subprocess.CalledProcessError):
            continue
    return None


def review_scope(root, repo='hotel', ref='HEAD', seen=None):
    seen = set() if seen is None else seen
    try:
        found = _find_anchor(root, repo, ref, seen)
        anchor, proof = found if found else (None, None)
    except subprocess.CalledProcessError:
        anchor = None
    if not anchor:
        return {'profile': 'full', 'anchor': None, 'changed_paths': [], 'reason': 'no_content_verified_review_ancestor'}
    paths = [path for path in changed_paths(root, anchor, ref) if path not in EXCLUDED_EVIDENCE]
    routed = classify(paths)
    return {'profile': routed['review_profile'], 'anchor': anchor,
            'changed_paths': paths, 'reason': ','.join(routed['reasons']),
            'carried_sources': {'agentha': reviewed_mcp_source(proof)}}


def reviewed_mcp_source(data):
    source = (data.get('reviewed_sources', {}).get('agentha')
              or data.get('carried_sources', {}).get('agentha'))
    require(isinstance(source, dict) and source.get('baseline') == BASELINES['agentha']
            and re.fullmatch(r'[a-f0-9]{40}', source.get('sha', '')) is not None
            and re.fullmatch(r'[a-f0-9]{64}', source.get('source_fingerprint', '')) is not None,
            'verified_mcp_source_required')
    return source


def validate_targeted(data, repo, fingerprint, actual_scope):
    require(repo == 'hotel', 'targeted_review_hotel_only')
    require(data.get('schema') == 'independent_codex_forensic_review.v2', 'scoped_review_schema_required')
    require(data.get('kind') == 'Independent Codex multi-agent forensic review', 'independent_review_required')
    require(data.get('result') == 'PASS', 'independent_review_not_pass')
    declared = data.get('scope', {})
    require(actual_scope['profile'] == 'targeted', 'targeted_review_risk_scope_invalid')
    require(declared.get('profile') == 'targeted' and declared.get('anchor') == actual_scope['anchor']
            and declared.get('changed_paths') == actual_scope['changed_paths'], 'cumulative_review_scope_mismatch')
    require(data.get('carried_sources') == actual_scope.get('carried_sources')
            and actual_scope.get('carried_sources') is not None, 'verified_cross_repository_anchor_required')
    reviewed_mcp_source(data)
    sources = data.get('reviewed_sources', {})
    require(set(sources) == {'hotel'}, 'targeted_review_sources_invalid')
    source = sources['hotel']
    require(source.get('baseline') == BASELINES['hotel'], 'cumulative_review_baseline_mismatch')
    require(re.fullmatch(r'[a-f0-9]{40}', source.get('sha', '')) is not None, 'reviewed_sha_required')
    require(source.get('source_fingerprint') == fingerprint, 'candidate_source_not_reviewed')
    areas = {'U': 'client_contract', 'F': 'test_gaps'}
    reviewers = data.get('reviewers', [])
    require(len(reviewers) == 2 and {item.get('area') for item in reviewers} == set(areas),
            'two_targeted_reviewers_required')
    identities = [item.get('agent_id') for item in reviewers]
    require(all(isinstance(identity, str) and identity.strip() for identity in identities)
            and len(set(identities)) == 2, 'distinct_independent_agents_required')
    for item in reviewers:
        require(item.get('scope') == areas[item['area']] and item.get('result') == 'PASS'
                and item.get('reviewed_fingerprints') == {'hotel': fingerprint}, 'final_candidate_review_required')
        require(isinstance(item.get('evidence'), str) and bool(item['evidence'].strip()), 'review_evidence_required')
    # Reuse the full finding validator without reducing severity/resolution rules.
    findings = data.get('findings')
    require(isinstance(findings, list), 'review_findings_required')
    counts = dict.fromkeys(SEVERITIES, 0)
    identifiers = set()
    for finding in findings:
        identifier, severity = finding.get('id'), finding.get('severity')
        require(identifier and identifier not in identifiers and severity in SEVERITIES, 'finding_identity_invalid')
        identifiers.add(identifier)
        require(finding.get('status') in {'resolved', 'open'}, 'finding_status_required')
        if finding['status'] == 'resolved':
            fix, tests, verified = finding.get('fix'), finding.get('regression_tests'), finding.get('verified_by')
            require(isinstance(fix, str) and bool(fix.strip()) and isinstance(tests, list) and bool(tests)
                    and all(isinstance(test, str) and bool(test.strip()) for test in tests)
                    and isinstance(verified, list) and bool(verified)
                    and all(area in areas for area in verified), 'finding_resolution_evidence_required')
        else:
            counts[severity] += 1
            require(severity == 'LOW' and finding.get('security') is False and finding.get('correctness') is False
                    and finding.get('production_reliability') is False and bool(finding.get('documented_reason')),
                    'open_blocking_review_finding')
    require(data.get('open_counts') == counts, 'review_findings_count_mismatch')
    return data


def _verify(root, repo, ref, seen, allow_inherit=True):
    fingerprint = source_fingerprint(root, ref)
    try:
        data = _read_evidence(root, ref)
    except (ValueError, subprocess.CalledProcessError):
        data = None
    if isinstance(data, dict) and data.get('schema') == 'independent_codex_forensic_review.v1':
        try:
            return validate(data, repo, fingerprint)
        except RuntimeError:
            pass
    if repo != 'hotel':
        require(data is not None, 'full_independent_review_required')
        return validate(data, repo, fingerprint)
    actual_scope = review_scope(root, repo, ref, seen | {ref})
    if actual_scope['profile'] == 'none' and allow_inherit:
        return {'schema': 'inherited_independent_review.v1', 'result': 'PASS',
                'profile': 'none', 'scope': actual_scope, 'source_fingerprint': fingerprint,
                'carried_sources': actual_scope['carried_sources']}
    if actual_scope['profile'] == 'targeted':
        require(data is not None, 'targeted_independent_review_required')
        return validate_targeted(data, repo, fingerprint, actual_scope)
    require(data is not None, 'full_independent_review_required')
    return validate(data, repo, fingerprint)


def verify(root: Path, repo, ref='HEAD'):
    return _verify(root, repo, ref, set())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', choices=BASELINES, required=True)
    parser.add_argument('--ref', default='HEAD')
    args = parser.parse_args()
    result = verify(Path(__file__).resolve().parents[1], args.repo, args.ref)
    profile = result.get('scope', {}).get('profile', 'full')
    detail = 'content-verified ancestry PASS' if profile == 'none' else 'exact candidate source PASS'
    print(f'Independent Codex forensic review: {detail}; profile {profile}; CRITICAL/HIGH/MEDIUM 0')
