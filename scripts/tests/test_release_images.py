"""Exercise fail-closed image import and immutable artifact identity."""
import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import github_deploy_via_ssh as deploy
import read_release_gate_artifact as gate
import release_images as images

SHA = "a" * 40
OTHER_SHA = "b" * 40


class ReleaseImagesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "images.tar.gz").write_bytes(b"actual exported bundle bytes")
        self.manifest = {
            "schema": "kajovo_release_images.v1", "source_sha": SHA, "platform": "linux/amd64",
            "archive": "images.tar.gz", "archive_sha256": images.file_digest(self.root / "images.tar.gz"),
            "images": {service: {"tag": f"kajovo-hotel-{service}:{SHA}", "id": "sha256:" + str(index) * 64}
                       for index, service in enumerate(images.SERVICES, 1)},
            "checks": {"api_import": "PASS", "production_proxy": "PASS"},
        }
        self.write_manifest(self.manifest)

    def write_manifest(self, data):
        (self.root / "manifest.json").write_text(json.dumps(data))

    def test_mutated_archive_cannot_load_or_publish_compose_override(self):
        (self.root / "images.tar.gz").write_bytes(b"substituted untested release")
        target = self.root / "compose.yml"
        with patch.object(images.subprocess, "run") as command:
            with self.assertRaisesRegex(RuntimeError, "hash_mismatch"):
                images.import_bundle(self.root, SHA, target)
        command.assert_not_called()
        self.assertFalse(target.exists())

    def test_wrong_sha_platform_missing_service_or_failed_checks_fail_closed(self):
        variations = [{"source_sha": OTHER_SHA}, {"platform": "linux/arm64"},
                      {"images": {"api": self.manifest["images"]["api"]}},
                      {"checks": {"api_import": "PASS", "production_proxy": "FAIL"}}]
        for updates in variations:
            with self.subTest(updates=updates):
                altered = copy.deepcopy(self.manifest)
                altered.update(updates)
                self.write_manifest(altered)
                with patch.object(images.subprocess, "run") as command:
                    with self.assertRaises(RuntimeError):
                        images.import_bundle(self.root, SHA, self.root / "compose.yml")
                command.assert_not_called()

    def test_loaded_tag_substitution_fails_before_publishing_runtime_config(self):
        with patch.object(images.subprocess, "run"), patch.object(images, "installed_image", return_value={
                "Id": "sha256:" + "f" * 64, "Os": "linux", "Architecture": "amd64"}):
            with self.assertRaisesRegex(RuntimeError, "installed_release_image_mismatch"):
                images.import_bundle(self.root, SHA, self.root / "compose.yml")
        self.assertFalse((self.root / "compose.yml").exists())

    def test_verified_import_pins_actual_ids_without_registry_pull(self):
        def installed(tag):
            row = next(image for image in self.manifest["images"].values() if image["tag"] == tag)
            return {"Id": row["id"], "Os": "linux", "Architecture": "amd64"}
        with patch.object(images.subprocess, "run") as command, patch.object(images, "installed_image", side_effect=installed):
            images.import_bundle(self.root, SHA, self.root / "compose.yml")
        self.assertEqual(command.call_args.args[0][:3], ["docker", "image", "load"])
        compose = (self.root / "compose.yml").read_text()
        self.assertEqual(compose.count("pull_policy: never"), 3)
        for row in self.manifest["images"].values():
            self.assertIn(row["id"], compose)
        self.assertNotIn("build:", compose)

    def test_gate_artifact_cannot_skip_deploy_using_wrong_source_or_untrusted_boolean(self):
        path = self.root / "gate.json"
        base = {"sha": SHA, "workflow": "ci-gates", "overall_status": "PASS", "deploy_required": True}
        for update in ({"sha": OTHER_SHA}, {"deploy_required": "false"}, {"overall_status": "FAIL"}, {"workflow": "ci-full"}):
            path.write_text(json.dumps({**base, **update}))
            with self.assertRaises(RuntimeError):
                gate.read(path, SHA)
        path.write_text(json.dumps({**base, "deploy_required": False}))
        self.assertFalse(gate.read(path, SHA))

    def test_release_actions_reject_invalid_sha_before_ssh(self):
        for sha in ("", "a" * 39, "a" * 40 + "\nanything", "shell; touch /tmp/injected"):
            with patch.dict(os.environ, {"DEPLOY_SHA": sha}), patch.object(deploy, "run_remote") as remote:
                with self.assertRaises(SystemExit):
                    deploy.cmd_release("accept")
            remote.assert_not_called()


if __name__ == "__main__":
    unittest.main()
