"""Exercise content binding, cumulative risk and actual review evidence rules."""
import copy
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
SPEC = importlib.util.spec_from_file_location('review_under_test', ROOT / 'scripts/independent_review.py')
review = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review)


def manifest(fingerprint='a' * 64, areas=None):
    areas = review.AREAS if areas is None else areas
    return {
        'schema': 'independent_codex_forensic_review.v3',
        'kind': 'Independent Codex multi-agent forensic review', 'result': 'PASS',
        'reviewed_sources': {'hotel': {'baseline': review.BASELINES['hotel'], 'sha': 'a' * 40,
                                      'source_fingerprint': fingerprint}},
        'reviewers': [{'area': area, 'scope': scope, 'agent_id': 'independent-' + area,
                       'result': 'PASS', 'reviewed_fingerprints': {'hotel': fingerprint},
                       'evidence': 'Actual independent candidate inspection completed.'}
                      for area, scope in areas.items()],
        'findings': [], 'open_counts': dict.fromkeys(review.SEVERITIES, 0),
    }


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], stderr=subprocess.PIPE, text=True).strip()


def commit(root):
    git(root, 'add', '-A')
    git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Fixture')
    return git(root, 'rev-parse', 'HEAD')


@pytest.fixture
def candidate(tmp_path):
    git(tmp_path, 'init', '-q')
    for name in ('app/runtime.py', 'AGENTS.md', '.github/workflows/ci.yml', 'docs/runbook.md'):
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('initial candidate\n')
    commit(tmp_path)
    return tmp_path


def publish_review(root, data=None):
    fp = review.source_fingerprint(root)
    data = manifest(fp) if data is None else data
    data['reviewed_sources']['hotel']['sha'] = git(root, 'rev-parse', 'HEAD')
    path = root / review.EVIDENCE
    path.write_text(json.dumps(data))
    (path.with_suffix('.md')).write_text('Actual review evidence.')
    return commit(root)


def test_six_distinct_reviewers_are_bound_to_same_hotel_tree():
    assert review.validate(manifest(), 'hotel', 'a' * 64)['result'] == 'PASS'
    for key in ('agent_id', 'area'):
        data = manifest()
        data['reviewers'][1][key] = data['reviewers'][0][key]
        with pytest.raises(RuntimeError):
            review.validate(data, 'hotel', 'a' * 64)
    data = manifest()
    data['reviewers'][0]['reviewed_fingerprints']['hotel'] = 'b' * 64
    with pytest.raises(RuntimeError, match='final_candidate_review_required'):
        review.validate(data, 'hotel', 'a' * 64)


@pytest.mark.parametrize('field,value', [('result', 'PARTIAL'), ('findings', None), ('open_counts', None),
                                        ('schema', 'independent_codex_forensic_review.v1')])
def test_incomplete_or_obsolete_review_rejected(field, value):
    data = manifest()
    data[field] = value
    with pytest.raises(RuntimeError):
        review.validate(data, 'hotel', 'a' * 64)


@pytest.mark.parametrize('severity', ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
def test_open_security_correctness_or_runtime_findings_block_release(severity):
    data = manifest()
    data['findings'] = [{'id': 'X-1', 'severity': severity, 'status': 'open', 'security': True,
                         'correctness': False, 'production_reliability': False, 'documented_reason': 'Still open'}]
    data['open_counts'][severity] = 1
    with pytest.raises(RuntimeError, match='open_blocking_review_finding'):
        review.validate(data, 'hotel', 'a' * 64)


def test_resolution_requires_fix_regression_and_actual_verifier():
    data = manifest()
    row = {'id': 'D-HIGH-1', 'severity': 'HIGH', 'status': 'resolved', 'fix': 'Root runtime fencing',
           'regression_tests': ['test_expired_worker'], 'verified_by': ['D']}
    data['findings'] = [row]
    review.validate(data, 'hotel', 'a' * 64)
    for key in ('fix', 'regression_tests', 'verified_by'):
        bad = copy.deepcopy(data)
        bad['findings'][0].pop(key)
        with pytest.raises(RuntimeError, match='finding_resolution_evidence_required'):
            review.validate(bad, 'hotel', 'a' * 64)


@pytest.mark.parametrize('path', ['AGENTS.md', 'app/runtime.py', 'docs/runbook.md', '.github/workflows/ci.yml'])
def test_any_relevant_source_edit_invalidates_review(candidate, path):
    publish_review(candidate)
    review.verify(candidate)
    (candidate / path).write_text('unreviewed change')
    commit(candidate)
    with pytest.raises(RuntimeError, match='candidate_source_not_reviewed'):
        review.verify(candidate)


def test_only_two_review_evidence_files_are_excluded(candidate):
    publish_review(candidate)
    fp = review.source_fingerprint(candidate)
    (candidate / review.EVIDENCE).write_text('{}')
    (candidate / review.EVIDENCE).with_suffix('.md').write_text('updated evidence')
    commit(candidate)
    assert review.source_fingerprint(candidate) == fp
    (candidate / 'docs/other-evidence.json').write_text('{}')
    commit(candidate)
    assert review.source_fingerprint(candidate) != fp


def test_unknown_or_missing_ancestor_requires_full_review(candidate):
    assert review.review_scope(candidate)['profile'] == 'full'
    with pytest.raises(RuntimeError, match='full_independent_review_required'):
        review.verify(candidate)
    path = candidate / review.EVIDENCE
    path.write_text(json.dumps(manifest('f' * 64)))
    commit(candidate)
    (candidate / 'docs/notes').mkdir()
    (candidate / 'docs/notes/history.md').write_text('historical evidence')
    commit(candidate)
    assert review.review_scope(candidate)['profile'] == 'full'
    with pytest.raises(RuntimeError):
        review.verify(candidate)


def test_historical_notes_inherit_only_verified_full_ancestor(candidate):
    ancestor = publish_review(candidate)
    path = candidate / 'docs/notes/history.md'
    path.parent.mkdir(parents=True)
    path.write_text('historical evidence')
    commit(candidate)
    result = review.verify(candidate)
    assert result['scope']['profile'] == 'none' and result['scope']['anchor'] == ancestor
    (candidate / 'app/runtime.py').write_text('unreviewed code')
    commit(candidate)
    path.write_text('another cosmetic commit')
    commit(candidate)
    assert review.review_scope(candidate)['profile'] == 'full'
    with pytest.raises(RuntimeError):
        review.verify(candidate)


def test_targeted_review_requires_computed_cumulative_paths(candidate):
    publish_review(candidate)
    ui = candidate / 'apps/kajovo-hotel-web/src/pages/BreakfastPage.css'
    ui.parent.mkdir(parents=True)
    ui.write_text('body {color: black}')
    commit(candidate)
    actual = review.review_scope(candidate)
    assert actual['profile'] == 'targeted'
    data = manifest(review.source_fingerprint(candidate), review.TARGETED_AREAS)
    data['scope'] = actual
    publish_review(candidate, data)
    assert review.verify(candidate)['result'] == 'PASS'
    data['scope']['changed_paths'] = []
    publish_review(candidate, data)
    with pytest.raises(RuntimeError, match='cumulative_review_scope_mismatch'):
        review.verify(candidate)
