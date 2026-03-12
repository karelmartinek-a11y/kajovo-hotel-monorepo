from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class CheckResult:
    name: str
    command: list[str]
    status: str
    return_code: int
    started_at: str
    finished_at: str


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_check(name: str, command: list[str]) -> CheckResult:
    started_at = _utc_now_iso()
    completed = subprocess.run(command, check=False)
    finished_at = _utc_now_iso()
    return CheckResult(
        name=name,
        command=command,
        status="PASS" if completed.returncode == 0 else "FAIL",
        return_code=completed.returncode,
        started_at=started_at,
        finished_at=finished_at,
    )


def _pnpm_command(*args: str) -> list[str]:
    if os.name == "nt":
        return ["cmd", "/c", "pnpm", *args]
    return ["pnpm", *args]


def _git_sha() -> str:
    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        return "unknown"
    return completed.stdout.strip() or "unknown"


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    os.chdir(repo_root)

    checks: list[tuple[str, list[str], bool]] = [
        ("typecheck", _pnpm_command("typecheck"), True),
        ("web-build", _pnpm_command("--filter", "@kajovo/kajovo-hotel-web", "build"), True),
        ("admin-build", _pnpm_command("--filter", "@kajovo/kajovo-hotel-admin", "build"), True),
        ("api-unit-tests", ["python", "-m", "pytest", "apps/kajovo-hotel-api/tests", "-q"], True),
        (
            "breakfast-imap-smoke",
            ["python", "-m", "pytest", "apps/kajovo-hotel-api/tests/test_breakfast_imap_smoke.py", "-q"],
            True,
        ),
        ("breakfast-runtime-smoke", ["python", "scripts/run_breakfast_runtime_smoke.py"], True),
        ("frontend-ci-gates", _pnpm_command("ci:gates"), os.getenv("RUN_FRONTEND_GATES") == "1"),
        ("e2e-smoke", _pnpm_command("ci:e2e-smoke"), os.getenv("RUN_E2E_SMOKE") == "1"),
    ]

    results: list[CheckResult] = []
    for name, command, enabled in checks:
        if not enabled:
            results.append(
                CheckResult(
                    name=name,
                    command=command,
                    status="SKIPPED",
                    return_code=0,
                    started_at=_utc_now_iso(),
                    finished_at=_utc_now_iso(),
                )
            )
            continue
        results.append(_run_check(name, command))

    overall = "PASS" if all(result.status in {"PASS", "SKIPPED"} for result in results) else "FAIL"
    sha = _git_sha()
    generated_at = _utc_now_iso()

    artifact_dir = repo_root / "artifacts" / "release-gate"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    filename = f"release-gate-{sha[:12]}-{generated_at.replace(':', '').replace('-', '')}.json"
    artifact_path = artifact_dir / filename
    artifact_payload = {
        "generated_at": generated_at,
        "sha": sha,
        "overall_status": overall,
        "checks": [asdict(result) for result in results],
    }
    artifact_path.write_text(json.dumps(artifact_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Release gate: {overall}")
    print(f"Artifact: {artifact_path}")
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
