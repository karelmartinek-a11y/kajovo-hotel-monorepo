"""Content-bound review evidence rejects unreviewed release candidates."""
import copy
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("review_gate_under_test", ROOT / "scripts/independent_review.py")
assert SPEC and SPEC.loader
review = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review)


def manifest(fingerprint="a" * 64):
    fingerprints = {"hotel": fingerprint, "agentha": fingerprint}
    return {
        "schema": "independent_codex_forensic_review.v1",
        "kind": "Independent Codex multi-agent forensic review",
        "result": "PASS",
        "reviewed_sources": {
            name: {"baseline": baseline, "sha": str(index) * 40,
                   "source_fingerprint": fingerprints[name]}
            for index, (name, baseline) in enumerate(review.BASELINES.items(), 1)
        },
        "reviewers": [
            {"area": area, "scope": scope, "agent_id": "independent-" + area,
             "result": "PASS", "reviewed_fingerprints": fingerprints.copy(),
             "evidence": "Pinned resulting trees; cumulative review completed."}
            for area, scope in review.AREAS.items()
        ],
        "findings": [],
        "open_counts": dict.fromkeys(review.SEVERITIES, 0),
    }


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args], stderr=subprocess.PIPE).decode().strip()


def commit(root):
    git(root, "add", "-A")
    git(root, "-c", "user.name=Review Fixture", "-c", "user.email=review@example.invalid",
        "commit", "-qm", "Synthetic review fixture")
    return git(root, "rev-parse", "HEAD")


@pytest.fixture
def candidate(tmp_path):
    git(tmp_path, "init", "-q")
    git(tmp_path, "config", "core.filemode", "true")
    for name in ("app/runtime.py", "tests/test_runtime.py", "AGENTS.md",
                 ".github/workflows/ci.yml", "docs/runbook.md", "docs/other-evidence.json"):
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("initial candidate\n")
    commit(tmp_path)
    return tmp_path


def test_complete_six_agent_evidence_passes_for_both_repositories():
    data = manifest()
    for repo in review.BASELINES:
        assert review.validate(data, repo, "a" * 64) is data


@pytest.mark.parametrize("field,value,error", [
    ("schema", "human_review", "review_schema_required"),
    ("kind", "Human review", "independent_review_required"),
    ("result", "PARTIAL", "independent_review_not_pass"),
    ("findings", None, "review_findings_required"),
    ("open_counts", None, "review_findings_count_mismatch"),
])
def test_manifest_requires_explicit_complete_evidence(field, value, error):
    data = manifest()
    if value is None:
        del data[field]
    else:
        data[field] = value
    with pytest.raises(RuntimeError, match=error):
        review.validate(data, "hotel", "a" * 64)


@pytest.mark.parametrize("repo", ["hotel", "agentha"])
def test_changed_candidate_is_not_covered_by_green_ci_or_review_of_another_tree(repo):
    with pytest.raises(RuntimeError, match="candidate_source_not_reviewed"):
        review.validate(manifest(), repo, "b" * 64)


@pytest.mark.parametrize("mutation,error", [
    ("missing_repo", "cumulative_review_sources_required"),
    ("wrong_baseline", "cumulative_review_baseline_mismatch"),
    ("missing_sha", "reviewed_sha_required"),
    ("short_fingerprint", "reviewed_fingerprint_required"),
    ("missing_area", "six_independent_reviewers_required"),
    ("duplicate_area", "six_independent_reviewers_required"),
    ("same_agent", "distinct_independent_agents_required"),
    ("empty_agent", "distinct_independent_agents_required"),
    ("wrong_scope", "review_area_mismatch"),
    ("stale_review", "final_candidate_review_required"),
    ("unfinished_review", "final_candidate_review_required"),
    ("no_review_evidence", "review_evidence_required"),
])
def test_independence_and_exact_final_tree_are_required(mutation, error):
    data = manifest()
    if mutation == "missing_repo":
        del data["reviewed_sources"]["agentha"]
    elif mutation == "wrong_baseline":
        data["reviewed_sources"]["hotel"]["baseline"] = "f" * 40
    elif mutation == "missing_sha":
        data["reviewed_sources"]["hotel"]["sha"] = ""
    elif mutation == "short_fingerprint":
        data["reviewed_sources"]["hotel"]["source_fingerprint"] = "a"
    elif mutation == "missing_area":
        data["reviewers"].pop()
    elif mutation == "duplicate_area":
        data["reviewers"][-1]["area"] = "A"
    elif mutation == "same_agent":
        data["reviewers"][-1]["agent_id"] = data["reviewers"][0]["agent_id"]
    elif mutation == "empty_agent":
        data["reviewers"][0]["agent_id"] = "   "
    elif mutation == "wrong_scope":
        data["reviewers"][0]["scope"] = "deployment"
    elif mutation == "stale_review":
        data["reviewers"][0]["reviewed_fingerprints"]["agentha"] = "b" * 64
    elif mutation == "unfinished_review":
        data["reviewers"][0]["result"] = "PARTIAL"
    elif mutation == "no_review_evidence":
        data["reviewers"][0]["evidence"] = " "
    with pytest.raises(RuntimeError, match=error):
        review.validate(data, "hotel", "a" * 64)


@pytest.mark.parametrize("severity", ["CRITICAL", "HIGH", "MEDIUM"])
def test_any_open_blocking_finding_rejects_release_even_if_counts_claim_zero(severity):
    data = manifest()
    data["findings"] = [{"id": "finding-1", "severity": severity, "status": "open"}]
    with pytest.raises(RuntimeError, match="open_blocking_review_finding"):
        review.validate(data, "hotel", "a" * 64)


def resolved_finding():
    return {"id": "finding-1", "severity": "HIGH", "status": "resolved",
            "fix": "app/runtime.py: corrected fail-closed policy",
            "regression_tests": ["tests/test_runtime.py::test_fail_closed"],
            "verified_by": ["C"]}


def test_resolved_findings_preserve_fix_test_and_reviewer_evidence():
    data = manifest()
    data["findings"] = [resolved_finding()]
    review.validate(data, "hotel", "a" * 64)
    for field in ("fix", "regression_tests", "verified_by"):
        incomplete = copy.deepcopy(data)
        del incomplete["findings"][0][field]
        with pytest.raises(RuntimeError, match="finding_resolution_evidence_required"):
            review.validate(incomplete, "hotel", "a" * 64)
    data["findings"].append(resolved_finding())
    with pytest.raises(RuntimeError, match="finding_identity_invalid"):
        review.validate(data, "hotel", "a" * 64)


def test_documented_non_security_non_correctness_non_reliability_low_is_only_exception():
    data = manifest()
    low = {"id": "format-1", "severity": "LOW", "status": "open", "security": False,
           "correctness": False, "production_reliability": False,
           "documented_reason": "Optional formatting consistency."}
    data["findings"] = [low]
    data["open_counts"]["LOW"] = 1
    review.validate(data, "hotel", "a" * 64)
    for field in ("security", "correctness", "production_reliability"):
        unsafe = copy.deepcopy(data)
        unsafe["findings"][0][field] = True
        with pytest.raises(RuntimeError, match="open_blocking_review_finding"):
            review.validate(unsafe, "hotel", "a" * 64)
    data["open_counts"]["LOW"] = 0
    with pytest.raises(RuntimeError, match="review_findings_count_mismatch"):
        review.validate(data, "hotel", "a" * 64)


@pytest.mark.parametrize("path", ["app/runtime.py", "tests/test_runtime.py", "AGENTS.md",
                                ".github/workflows/ci.yml", "docs/runbook.md", "docs/other-evidence.json"])
def test_entire_committed_source_and_derived_artifacts_are_bound(candidate, path):
    before = review.source_fingerprint(candidate)
    (candidate / path).write_text("unreviewed change\n")
    assert review.source_fingerprint(candidate) == before  # HEAD, never the dirty working tree.
    commit(candidate)
    assert review.source_fingerprint(candidate) != before


def test_file_mode_rename_and_symlink_target_are_bound(candidate):
    before = review.source_fingerprint(candidate)
    (candidate / "app/runtime.py").chmod(0o755)
    commit(candidate)
    executable = review.source_fingerprint(candidate)
    assert executable != before
    (candidate / "app/runtime.py").rename(candidate / "app/renamed.py")
    commit(candidate)
    renamed = review.source_fingerprint(candidate)
    assert renamed != executable
    (candidate / "app/link").symlink_to("renamed.py")
    commit(candidate)
    linked = review.source_fingerprint(candidate)
    assert linked != renamed
    (candidate / "app/link").unlink()
    (candidate / "app/link").symlink_to("different.py")
    commit(candidate)
    assert review.source_fingerprint(candidate) != linked


def test_only_exact_two_report_paths_are_excluded_from_self_referential_fingerprint(candidate):
    before = review.source_fingerprint(candidate)
    for name in (review.EVIDENCE, "docs/native-mcp-independent-review.md"):
        (candidate / name).write_text("report first version")
    commit(candidate)
    assert review.source_fingerprint(candidate) == before
    for name in (review.EVIDENCE, "docs/native-mcp-independent-review.md"):
        (candidate / name).write_text("report revised")
    commit(candidate)
    assert review.source_fingerprint(candidate) == before
    (candidate / "docs/native-mcp-independent-review.extra.md").write_text("not excluded")
    commit(candidate)
    assert review.source_fingerprint(candidate) != before


def test_committed_evidence_survives_evidence_only_commit_but_rejects_next_source_commit(candidate):
    code_sha = git(candidate, "rev-parse", "HEAD")
    fingerprint = review.source_fingerprint(candidate)
    data = manifest(fingerprint)
    data["reviewed_sources"]["hotel"]["sha"] = code_sha
    (candidate / review.EVIDENCE).write_text(json.dumps(data))
    evidence_sha = commit(candidate)
    assert code_sha != evidence_sha
    review.verify(candidate, "hotel", evidence_sha)
    (candidate / "app/runtime.py").write_text("later production change")
    commit(candidate)
    with pytest.raises(RuntimeError, match="candidate_source_not_reviewed"):
        review.verify(candidate, "hotel")
    review.verify(candidate, "hotel", evidence_sha)
    # A dirty report cannot forge the already committed release evidence.
    (candidate / review.EVIDENCE).write_text(json.dumps(manifest(review.source_fingerprint(candidate))))
    with pytest.raises(RuntimeError, match="candidate_source_not_reviewed"):
        review.verify(candidate, "hotel")


def test_deleted_file_invalidates_review_but_commit_metadata_does_not(candidate):
    before = review.source_fingerprint(candidate)
    git(candidate, "-c", "user.name=Review Fixture", "-c", "user.email=review@example.invalid",
        "commit", "--allow-empty", "-qm", "Metadata only")
    assert review.source_fingerprint(candidate) == before
    (candidate / "tests/test_runtime.py").unlink()
    commit(candidate)
    assert review.source_fingerprint(candidate) != before


def test_cli_validates_committed_candidate_without_external_bot_or_review_dependency(candidate):
    script = candidate / "scripts/independent_review.py"
    script.parent.mkdir()
    script.write_text((ROOT / "scripts/independent_review.py").read_text())
    commit(candidate)
    fingerprint = review.source_fingerprint(candidate)
    (candidate / review.EVIDENCE).write_text(json.dumps(manifest(fingerprint)))
    commit(candidate)
    passed = subprocess.run([sys.executable, str(script), "--repo", "hotel"],
                            capture_output=True, text=True, check=False)
    assert passed.returncode == 0
    assert "exact candidate source PASS" in passed.stdout
    (candidate / "app/runtime.py").write_text("not reviewed")
    commit(candidate)
    rejected = subprocess.run([sys.executable, str(script), "--repo", "hotel"],
                              capture_output=True, text=True, check=False)
    assert rejected.returncode != 0
    assert "candidate_source_not_reviewed" in rejected.stderr
    assert "PASS" not in rejected.stdout


@pytest.mark.parametrize("field,value", [
    ("fix", "   "), ("fix", {"symbol": "runtime"}),
    ("regression_tests", "test_runtime"), ("regression_tests", []),
    ("regression_tests", [" "]), ("regression_tests", [123]),
    ("verified_by", "C"), ("verified_by", []),
    ("verified_by", ["unknown-reviewer"]), ("verified_by", [123]),
])
def test_resolution_cannot_claim_untraceable_fix_test_or_reviewer(field, value):
    data = manifest()
    finding = resolved_finding()
    finding[field] = value
    data["findings"] = [finding]
    with pytest.raises(RuntimeError, match="finding_resolution_evidence_required"):
        review.validate(data, "hotel", "a" * 64)
