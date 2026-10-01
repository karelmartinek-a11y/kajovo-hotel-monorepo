"""Validate conditional CI results without treating an unexpected skip as success."""
from __future__ import annotations

import json
import os
from pathlib import Path

REQUIRED_JOBS = {
    "scope": None,
    "fast-checks": None,
    "guardrails": None,
    "contract": "python",
    "api-runtime-image": "runtime_images",
    "web-tests": "web",
    "e2e-smoke": "admin",
    "visual-web": "visual_web",
    "visual-admin": "visual_admin",
    "unit-tests": "python",
    "portable-voice-core": "voice",
}
FLAGS = (
    "full", "python", "api", "web", "admin", "android", "voice",
    "visual_web", "visual_admin", "review_required", "deploy_required", "runtime_images",
)


def validate(needs: dict) -> dict:
    if not isinstance(needs, dict) or set(needs) != set(REQUIRED_JOBS):
        raise ValueError("Unexpected or missing required job")
    try:
        scope = needs["scope"]["outputs"]
        for flag in FLAGS:
            if scope.get(flag) not in {"true", "false"}:
                raise ValueError(f"Missing or invalid scope output: {flag}")
        if scope.get("review_profile") not in {"full", "targeted", "none"}:
            raise ValueError("Missing or invalid review profile")
        review_required = scope["review_required"] == "true"
        if review_required != (scope["review_profile"] != "none"):
            raise ValueError("Review requirement and profile must agree")
        if scope["deploy_required"] == "true" and not review_required:
            raise ValueError("Deployable runtime changes require independent review")
        for job, flag in REQUIRED_JOBS.items():
            expected = "success" if flag is None or scope[flag] == "true" else "skipped"
            actual = needs[job].get("result")
            if actual != expected:
                raise ValueError(f"{job}: {actual}, expected {expected}")
        if scope["runtime_images"] != "true":
            raise ValueError("Every candidate requires verified immutable restoration images")
        if scope["api"] != scope["python"]:
            raise ValueError("API and Python dependency scopes must agree")
        if scope["full"] == "true" and any(scope[flag] != "true" for flag in FLAGS):
            raise ValueError("Full validation cannot omit a dependency")
        for visual, smoke in (("visual_web", "web"), ("visual_admin", "admin")):
            if scope[visual] == "true" and scope[smoke] != "true":
                raise ValueError("Visual scope must also validate the functional consumer")
        return scope
    except (KeyError, TypeError, AttributeError) as error:
        raise ValueError("Malformed CI dependency evidence") from error


def main() -> int:
    try:
        needs = json.loads(os.environ["NEEDS_JSON"])
        scope = validate(needs)
        sha = os.environ["GITHUB_SHA"]
        if len(sha) != 40 or any(char not in "0123456789abcdef" for char in sha):
            raise ValueError("Invalid exact candidate SHA")
        artifact = Path("artifacts/release-gate")
        artifact.mkdir(parents=True, exist_ok=True)
        payload = {
            "sha": sha,
            "overall_status": "PASS",
            "workflow": "ci-gates",
            "deploy_required": scope["deploy_required"] == "true",
            "scope": scope,
            "jobs": {name: value["result"] for name, value in needs.items()},
        }
        (artifact / f"release-gate-{sha}.json").write_text(
            json.dumps(payload, indent=2) + "\n", encoding="utf-8"
        )
        print(f"All required checks PASS for {sha}; deployment required: {payload['deploy_required']}")
        return 0
    except (ValueError, KeyError) as error:
        print(f"Release gate FAIL: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
