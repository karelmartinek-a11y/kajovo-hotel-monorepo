import contextlib
import importlib.util
import io
import json
import os
import pathlib
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("backend_media", pathlib.Path(__file__).with_name("backend-media.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrivateMediaCleanupTest(unittest.TestCase):
    def run_cleanup(self, root: pathlib.Path) -> dict:
        program = module.GUEST_PROGRAM.replace('pathlib.Path("/media/kajavoiceha")', f"pathlib.Path({str(root)!r})")
        output = io.StringIO()
        with patch("os.chown"), patch("sys.argv", ["helper", "cleanup"]), contextlib.redirect_stdout(output):
            exec(compile(program, "<guest-cleanup>", "exec"), {})
        return json.loads(output.getvalue())

    def test_only_generated_closed_recordings_are_deleted(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent = pathlib.Path(temporary)
            root = parent / "managed"
            root.mkdir()
            expired = root / "00000000-0000-4000-8000-000000000001.mp4"
            budget = root / "00000000-0000-4000-8000-000000000002.mp4"
            active = root / "00000000-0000-4000-8000-000000000003.mp4"
            unrelated = root / "family-video.mp4"
            external = parent / "external-recording.mp4"
            link = root / "00000000-0000-4000-8000-000000000004.mp4"
            expired.write_bytes(b"old")
            with budget.open("wb") as stream:
                stream.truncate(400 * 1024 * 1024)
            with active.open("wb") as stream:
                stream.truncate(300 * 1024 * 1024)
            unrelated.write_bytes(b"leave this alone")
            external.write_bytes(b"outside managed directory")
            link.symlink_to(external)
            os.utime(expired, (time.time() - 90000,) * 2)
            os.utime(budget, (time.time() - 1200,) * 2)
            report = self.run_cleanup(root)
            self.assertFalse(expired.exists())
            self.assertFalse(budget.exists())
            self.assertTrue(active.exists())
            self.assertEqual(unrelated.read_bytes(), b"leave this alone")
            self.assertEqual(external.read_bytes(), b"outside managed directory")
            self.assertTrue(link.is_symlink())
            self.assertEqual(report["removed_files"], 2)
            self.assertFalse(report["above_budget_deferred"])

    def test_file_that_may_be_recording_is_preserved_above_budget(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary) / "managed"
            root.mkdir()
            active = root / "00000000-0000-4000-8000-000000000001.mp4"
            with active.open("wb") as stream:
                stream.truncate(513 * 1024 * 1024)
            report = self.run_cleanup(root)
            self.assertTrue(active.exists())
            self.assertEqual(report["removed_files"], 0)
            self.assertTrue(report["above_budget_deferred"])

    def test_directory_symlink_is_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent = pathlib.Path(temporary)
            external = parent / "external"
            external.mkdir()
            managed = parent / "managed"
            managed.symlink_to(external, target_is_directory=True)
            with self.assertRaises(SystemExit):
                self.run_cleanup(managed)
            self.assertEqual(list(external.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
