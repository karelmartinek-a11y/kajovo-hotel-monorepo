from __future__ import annotations

import os
from pathlib import Path
import tempfile
import time
import zipfile

import pytest

from scripts.yolo_text_repair import TEXT_EXTENSIONS, run_yolo_repair
from scripts.yolo_text_repair_gui import App


HORSE = "P\u0159\u00edli\u0161 \u017elu\u0165ou\u010dk\u00fd k\u016f\u0148"
KAJOVO = "Pou\u017e\u00edvej K\u00e1jovo"
UDRZBA = "\u0158\u00e1dek \u00fadr\u017eba"


def write_cp1250(path: Path, text: str) -> None:
    path.write_bytes(text.encode("cp1250"))


def write_mojibake_utf8(path: Path, text: str) -> None:
    broken = text.encode("utf-8").decode("latin-1")
    path.write_text(broken, encoding="utf-8")


def create_zip(zip_path: Path, files: dict[str, bytes]) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)


def read_zip_text(zip_path: Path, member: str) -> str:
    with zipfile.ZipFile(zip_path) as archive:
        with archive.open(member) as handle:
            return handle.read().decode("utf-8")


def test_text_extension_definition_contains_expected_types() -> None:
    expected = {".py", ".md", ".txt", ".json", ".ps1", ".xml", ".env"}
    assert expected.issubset(TEXT_EXTENSIONS)


def test_run_yolo_repair_repairs_text_and_zip_and_creates_full_backups() -> None:
    with tempfile.TemporaryDirectory(prefix="normutf-test-") as temp_dir_raw:
        tmp_path = Path(temp_dir_raw)
        root = tmp_path / "source"
        root.mkdir()
        backup_dir = tmp_path / "backup"

        write_cp1250(root / "legacy.txt", HORSE)
        write_mojibake_utf8(root / "broken.md", KAJOVO)
        (root / "utf16.ps1").write_text(UDRZBA, encoding="utf-16")

        nested_zip = root / "nested.zip"
        create_zip(
            nested_zip,
            {
                "inside/readme.txt": KAJOVO.encode("utf-8").decode("latin-1").encode("utf-8"),
                "inside/script.py": f"print('{HORSE}')".encode("cp1250"),
            },
        )

        stats = run_yolo_repair([root], backup_dir, logger=lambda _: None)

        assert stats.scanned_text_files >= 5
        assert stats.changed_text_files >= 4
        assert stats.scanned_zip_files == 1
        assert stats.changed_zip_files == 1

        assert (root / "legacy.txt").read_text(encoding="utf-8") == HORSE
        assert (root / "broken.md").read_text(encoding="utf-8") == KAJOVO
        assert (root / "utf16.ps1").read_text(encoding="utf-8") == UDRZBA
        assert read_zip_text(nested_zip, "inside/readme.txt") == KAJOVO
        assert read_zip_text(nested_zip, "inside/script.py") == f"print('{HORSE}')"

        backup_archives = sorted(backup_dir.glob("*.zip"))
        assert len(backup_archives) == 1
        with zipfile.ZipFile(backup_archives[0]) as archive:
            names = set(archive.namelist())
        assert "source/legacy.txt" in names
        assert "source/broken.md" in names
        assert "source/utf16.ps1" in names
        assert "source/nested.zip" in names


def test_backup_directory_inside_root_is_rejected() -> None:
    with tempfile.TemporaryDirectory(prefix="normutf-test-") as temp_dir_raw:
        tmp_path = Path(temp_dir_raw)
        root = tmp_path / "source"
        root.mkdir()
        backup_inside = root / "backup"

        with pytest.raises(ValueError):
            run_yolo_repair([root], backup_inside, logger=lambda _: None)


@pytest.mark.skipif("CI" in os.environ, reason="GUI smoke is local-only")
def test_gui_smoke_runs_end_to_end(monkeypatch: pytest.MonkeyPatch) -> None:
    import tkinter as tk
    from tkinter import messagebox

    with tempfile.TemporaryDirectory(prefix="normutf-gui-") as temp_dir_raw:
        tmp_path = Path(temp_dir_raw)
        source = tmp_path / "source"
        source.mkdir()
        backup = tmp_path / "backup"
        write_mojibake_utf8(source / "broken.txt", KAJOVO)

        infos: list[tuple[str, str]] = []
        errors: list[tuple[str, str]] = []
        monkeypatch.setattr(messagebox, "showinfo", lambda title, body: infos.append((title, body)))
        monkeypatch.setattr(messagebox, "showerror", lambda title, body: errors.append((title, body)))

        root = tk.Tk()
        root.withdraw()
        app = App(root)
        app.dir_vars[0].set(str(source))
        app.backup_var.set(str(backup))

        app._start()

        deadline = time.time() + 10
        while app.worker and app.worker.is_alive() and time.time() < deadline:
            root.update()
            time.sleep(0.05)
        root.update()
        root.destroy()

        assert not errors
        assert infos
        assert (source / "broken.txt").read_text(encoding="utf-8") == KAJOVO
        assert any(backup.glob("*.zip"))
