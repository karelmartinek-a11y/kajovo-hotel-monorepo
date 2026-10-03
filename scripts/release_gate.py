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
    print(f"CHECK: {name}", flush=True)
    try:
        completed = subprocess.run(command, check=False)
        return_code = completed.returncode
    except OSError:
        print(f"FAIL: {name} could not start", flush=True)
        return_code = 127
    finished_at = _utc_now_iso()
    return CheckResult(
        name=name,
        command=command,
        status="PASS" if return_code == 0 else "FAIL",
        return_code=return_code,
        started_at=started_at,
        finished_at=finished_at,
    )


def _pnpm_command(*args: str) -> list[str]:
    if os.name == "nt":
        return ["cmd", "/c", "pnpm", *args]
    return ["pnpm", *args]


def _python_command(*args: str) -> list[str]:
    return [sys.executable, *args]


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


def check_plan() -> list[tuple[str, list[str]]]:
    """Every mandatory check runs once; no opt-out flags or paid provider calls."""
    return [
        ("ci-runner-tests", _python_command("-m", "unittest", "discover", "-s", "scripts/tests", "-p", "test_release_gate.py")),
        ("typecheck", _pnpm_command("typecheck")),
        ("python-lint", _python_command("-m", "ruff", "check", "--config", "apps/kajovo-hotel-api/pyproject.toml", "--select", "E,F", "--ignore", "E501", "apps/kajovo-hotel-api/app", "apps/kajovo-hotel-api/tests", "packages/voice-core-server", "scripts/release_gate.py", "scripts/tests/test_release_gate.py", "scripts/check_voice_core_boundaries.py", "scripts/verify_voice_core_copy_out.py", "scripts/verify_voice_core_proxy.py", "scripts/voice_core_live_smoke.py", "scripts/voice_smart_live_smoke.py", "scripts/voice_registry_live_smoke.py", "scripts/verify_voice_memory_postgres.py")),
        ("api-and-voice-tests", _python_command("-m", "pytest", "apps/kajovo-hotel-api/tests", "packages/voice-core-server/tests", "-q")),
        ("voice-browser-tests", _pnpm_command("--filter", "@voice-core/browser", "test")),
        ("voice-boundaries", _python_command("scripts/check_voice_core_boundaries.py")),
        ("voice-copy-out", _python_command("scripts/verify_voice_core_copy_out.py")),
        ("api-contract", _pnpm_command("contract:check")),
        ("web-build", _pnpm_command("--filter", "@kajovo/kajovo-hotel-web", "build")),
        ("admin-build", _pnpm_command("--filter", "@kajovo/kajovo-hotel-admin", "build")),
        ("design-tokens", _pnpm_command("ci:tokens")),
        ("brand-assets", _pnpm_command("ci:brand-assets")),
        ("brand-signage", _pnpm_command("ci:signage")),
        ("text-integrity", _pnpm_command("ci:text-integrity")),
        ("portal-translations", _pnpm_command("ci:portal-translations")),
        ("frontend-manifest", _pnpm_command("ci:frontend-manifest")),
        ("runtime-integrity", _pnpm_command("ci:runtime-integrity")),
        ("android-acceptance-policy", ["node", "--test", "scripts/android_production_acceptance_policy.test.mjs"]),
        ("browser-baseline", _pnpm_command("ci:baseline")),
        ("voice-memory-ui", _pnpm_command("--filter", "@kajovo/kajovo-hotel-admin", "test:voice-memory")),
        ("voice-registry-ui", _pnpm_command("--filter", "@kajovo/kajovo-hotel-admin", "test:voice-registry")),
        ("voice-mail-ui", _pnpm_command("--filter", "@kajovo/kajovo-hotel-admin", "test:voice-mail")),
        ("voice-ui", _pnpm_command("--filter", "@voice-core/browser", "test:ui")),
    ]


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    os.chdir(repo_root)

    results = [_run_check(name, command) for name, command in check_plan()]
    overall = "PASS" if results and all(result.status == "PASS" for result in results) else "FAIL"
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
