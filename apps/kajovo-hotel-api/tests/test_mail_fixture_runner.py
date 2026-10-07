"""Isolation checks for the unpaid copied-server runner; no provider or mail IO."""
import importlib.util
from pathlib import Path

import pytest


def runner():
    path = Path(__file__).resolve().parents[3] / "scripts/mail_mcp_fixture_acceptance.py"
    spec = importlib.util.spec_from_file_location("mail_fixture_runner", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_copied_source_resolves_temporary_directory_alias(tmp_path, monkeypatch):
    module = runner()
    real = tmp_path / "real"
    real.mkdir()
    alias = tmp_path / "alias"
    alias.symlink_to(real, target_is_directory=True)
    source = real / "dagmar-mail-fixture-test"
    source.mkdir()
    monkeypatch.setattr(module.tempfile, "gettempdir", lambda: str(alias))
    assert module.isolated_source(alias / source.name) == source.resolve()


@pytest.mark.parametrize("kind", ["production", "wrong_name", "nested", "escape"] )
def test_non_isolated_source_is_rejected(tmp_path, monkeypatch, kind):
    module = runner()
    temporary = tmp_path / "temporary"
    temporary.mkdir()
    outside = tmp_path / "production"
    outside.mkdir()
    monkeypatch.setattr(module.tempfile, "gettempdir", lambda: str(temporary))
    sources = {"production": outside, "wrong_name": temporary / "mail-server",
               "nested": temporary / "nested/dagmar-mail-fixture-test",
               "escape": temporary / "dagmar-mail-fixture-link"}
    sources["escape"].symlink_to(outside, target_is_directory=True)
    with pytest.raises(RuntimeError, match="isolated_source_copy_required"):
        module.isolated_source(sources[kind])
