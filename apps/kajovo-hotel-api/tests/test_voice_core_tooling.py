import importlib.util
import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_boundary_gate_rejects_host_imports_and_relative_escape(tmp_path, monkeypatch):
    gate = load_script("check_voice_core_boundaries")
    for name in ["voice-core", "voice-core-server"]:
        shutil.copytree(ROOT / "packages" / name, tmp_path / "packages" / name,
            ignore=shutil.ignore_patterns("node_modules", "dist", "__pycache__", "test-results"))
    monkeypatch.setattr(gate, "ROOT", tmp_path)
    assert gate.check() == []
    browser = tmp_path / "packages/voice-core/src/forbidden.ts"
    browser.write_text("import {something} from '@kajovo/shared';\n")
    assert any("@kajovo/shared" in error for error in gate.check())
    browser.unlink()
    server = tmp_path / "packages/voice-core-server/src/voice_core_server/forbidden.py"
    server.write_text("from ....app import forbidden\n")
    assert any("escapes portable server" in error for error in gate.check())


@pytest.mark.parametrize("opt_in", [None, "0", "true"])
def test_paid_smoke_never_launches_without_exact_opt_in(monkeypatch, opt_in):
    runner = load_script("voice_core_live_smoke")
    if opt_in is None:
        monkeypatch.delenv("VOICE_CORE_LIVE_SMOKE", raising=False)
    else:
        monkeypatch.setenv("VOICE_CORE_LIVE_SMOKE", opt_in)
    def forbidden(*args, **kwargs):
        raise AssertionError("A paid browser was launched without opt-in")
    monkeypatch.setattr(runner.subprocess, "run", forbidden)
    assert runner.main() == 0


def test_paid_smoke_is_blocked_in_ci_even_with_opt_in(tmp_path, monkeypatch):
    runner = load_script("voice_core_live_smoke")
    fixture = tmp_path / "speech.wav"
    fixture.write_bytes(b"local-fixture")
    monkeypatch.setenv("VOICE_CORE_LIVE_SMOKE", "1")
    monkeypatch.setenv("VOICE_CORE_AUDIO_FIXTURE", str(fixture))
    monkeypatch.setenv("CI", "true")
    assert runner.main() == 2
