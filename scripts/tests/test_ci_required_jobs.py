"""Counterexamples for the conditional release authority."""
import copy
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "check_ci_required_jobs.py"
SPEC = importlib.util.spec_from_file_location("ci_required_jobs", SCRIPT)
GATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GATE)


def evidence(full=False):
    outputs = {flag: str(full).lower() for flag in GATE.FLAGS}
    outputs["runtime_images"] = "true"
    outputs["review_profile"] = "full" if full else "none"
    jobs = {
        name: {"result": "success" if full or flag is None else "skipped"}
        for name, flag in GATE.REQUIRED_JOBS.items()
    }
    jobs["api-runtime-image"]["result"] = "success"
    jobs["scope"]["outputs"] = outputs
    return jobs


class RequiredJobsTests(unittest.TestCase):
    def test_docs_can_skip_only_unrequired_runtime_jobs(self):
        self.assertEqual(GATE.validate(evidence())["deploy_required"], "false")

    def test_full_candidate_needs_every_consumer(self):
        self.assertEqual(GATE.validate(evidence(True))["runtime_images"], "true")

    def test_every_failed_cancelled_or_unexpected_skipped_job_blocks(self):
        for job in GATE.REQUIRED_JOBS:
            for result in ("failure", "cancelled", "skipped", None):
                with self.subTest(job=job, result=result):
                    candidate = evidence(True)
                    candidate[job]["result"] = result
                    with self.assertRaises(ValueError):
                        GATE.validate(candidate)

    def test_missing_or_untyped_scope_cannot_authorize_skip(self):
        for flag in GATE.FLAGS:
            for value in (None, "", True, False, "FALSE"):
                with self.subTest(flag=flag, value=value):
                    candidate = evidence()
                    candidate["scope"]["outputs"][flag] = value
                    with self.assertRaises(ValueError):
                        GATE.validate(candidate)

    def test_missing_job_and_unknown_job_fail_closed(self):
        missing = evidence()
        del missing["contract"]
        unknown = evidence()
        unknown["another-authority"] = {"result": "success"}
        for candidate in (missing, unknown):
            with self.assertRaises(ValueError):
                GATE.validate(candidate)

    def test_deployable_candidate_cannot_skip_verified_images(self):
        candidate = evidence()
        candidate["scope"]["outputs"].update(deploy_required="true", runtime_images="false")
        with self.assertRaises(ValueError):
            GATE.validate(candidate)

    def test_review_profile_and_requirement_must_agree(self):
        for required, profile in (("true", "none"), ("false", "full"), ("false", "targeted")):
            with self.subTest(required=required, profile=profile):
                candidate = evidence()
                candidate["scope"]["outputs"].update(review_required=required, review_profile=profile)
                with self.assertRaises(ValueError):
                    GATE.validate(candidate)

    def test_runtime_images_without_required_review_cannot_deploy(self):
        candidate = evidence()
        candidate["scope"]["outputs"].update(deploy_required="true", runtime_images="true")
        candidate["api-runtime-image"]["result"] = "success"
        with self.assertRaisesRegex(ValueError, "independent review"):
            GATE.validate(candidate)

    def test_full_scope_cannot_be_reduced_to_skipped_jobs(self):
        candidate = evidence()
        candidate["scope"]["outputs"]["full"] = "true"
        with self.assertRaises(ValueError):
            GATE.validate(candidate)

    def test_cli_writes_exact_sha_only_after_validated_results(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = dict(os.environ, NEEDS_JSON=json.dumps(evidence(True)), GITHUB_SHA="a" * 40)
            passed = subprocess.run([sys.executable, str(SCRIPT)], cwd=directory, env=environment, capture_output=True)
            self.assertEqual(passed.returncode, 0, passed.stdout)
            payload = json.loads((Path(directory) / "artifacts/release-gate" / ("release-gate-" + "a" * 40 + ".json")).read_text())
            self.assertTrue(payload["deploy_required"])
            failed_evidence = copy.deepcopy(evidence(True))
            failed_evidence["visual-admin"]["result"] = "failure"
            environment.update(NEEDS_JSON=json.dumps(failed_evidence), GITHUB_SHA="b" * 40)
            failed = subprocess.run([sys.executable, str(SCRIPT)], cwd=directory, env=environment, capture_output=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertFalse((Path(directory) / "artifacts/release-gate" / ("release-gate-" + "b" * 40 + ".json")).exists())


if __name__ == "__main__":
    unittest.main()
