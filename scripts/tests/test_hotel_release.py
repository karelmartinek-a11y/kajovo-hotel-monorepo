"""Exercise root transaction decisions and real snapshot/restore translation."""
from __future__ import annotations

import copy
import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import tarfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import hotel_release as release


SHA = "a" * 40
OTHER_SHA = "b" * 40
SECRET = "isolated-test-only-voice-master"
REVISION = "0039_voice_core_settings"


def image_id(number: int) -> str:
    return "sha256:" + f"{number:064x}"


def manifest(sha: str, archive: bytes) -> dict:
    return {
        "schema": "kajovo_release_images.v1", "source_sha": sha, "platform": "linux/amd64",
        "archive": "images.tar.gz", "archive_sha256": hashlib.sha256(archive).hexdigest(),
        "images": {service: {"id": image_id(index + 10), "tag": f"kajovo-hotel-{service}:{sha}"} for index, service in enumerate(("api", "web", "admin"))},
        "checks": {"api_import": "PASS", "production_proxy": "PASS"},
    }


class Clock:
    value = 1000

    def __call__(self):
        return self.value


class FakeHost(release.Host):
    """No production commands: run the real algorithms against Docker fixtures."""

    def __init__(self, source: Path, clock: Clock):
        self.clock = clock
        self.calls = []
        self.deploy_calls = 0
        self.restore_calls = 0
        self.stop_calls = 0
        self.started = False
        self.error_on_deploy = False
        self.before_verify = None
        self.before_stop = None
        self.before_deploy = None
        self.revision = REVISION
        self.network_present = True
        self.oneoffs = []
        self.legacy_units = ""
        self.legacy_unit_files = ""
        self.network = {"Name": "kajovo-prod_kajovo_net", "Driver": "bridge", "Internal": False, "EnableIPv6": False, "Options": {}, "Labels": {"com.docker.compose.project": release.PROJECT, "com.docker.compose.network": "kajovo_net"}, "IPAM": {"Config": [{"Subnet": "172.21.0.0/16", "Gateway": "172.21.0.1"}]}}
        self.rows = {}
        for index, service in enumerate(release.SERVICES):
            self.rows[service] = {
                "Id": f"container-{service}", "Name": f"/{release.PROJECT}-{service}-1", "Image": image_id(index + 1),
                "State": {"Running": True, "Health": {"Status": "healthy"}},
                "Config": {"Env": [f"KAJOVO_API_VOICE_MASTER_KEY={SECRET}", "POSTGRES_USER=kajovo", "POSTGRES_DB=kajovo_hotel", "PRIVATE_VALUE=fixture-only"], "Labels": {
                    "com.docker.compose.project": release.PROJECT, "com.docker.compose.service": service,
                    "com.docker.compose.project.working_dir": str(source / "infra"),
                    "com.docker.compose.project.config_files": f"{source}/infra/compose.prod.yml,{source}/infra/compose.prod.hotel-hcasc.yml,/private-old-coordinator/rollback-images.yml",
                    "com.docker.compose.project.environment_file": str(source / "infra/.env"),
                }, "Cmd": ["example-entrypoint"], "Entrypoint": None, "User": "", "WorkingDir": "/app", "Healthcheck": {"Test": ["CMD", "true"], "Interval": 15000000000, "Retries": 5}},
                "HostConfig": {"RestartPolicy": {"Name": "unless-stopped"}, "PortBindings": {"8000/tcp": [{"HostIp": "127.0.0.1", "HostPort": str(8202 + index)}]}},
                "Mounts": [{"Type": "volume", "Name": "kajovo-prod_postgres_data" if service == "postgres" else "kajovo-prod_api_data", "Destination": "/data", "RW": True}],
                "NetworkSettings": {"Networks": {self.network["Name"]: {"Aliases": [service], "IPAMConfig": None}}},
            }
        self.old_images = {row["Image"] for row in self.rows.values()}
        self.local_images = set(self.old_images)

    def command(self, args, **kwargs):
        self.calls.append((args, kwargs))
        if args[:2] == ["systemctl", "list-units"]:
            return self.legacy_units
        if args[:2] == ["systemctl", "list-unit-files"]:
            return self.legacy_unit_files
        if args[:2] == ["docker", "ps"]:
            return "\n".join(row["Id"] for row in [*self.rows.values(), *self.oneoffs])
        if args[:2] == ["docker", "inspect"]:
            return json.dumps([*self.rows.values(), *self.oneoffs])
        if args[:2] == ["docker", "stop"]:
            for row in self.oneoffs:
                if row["Id"] == args[-1]:
                    row["State"]["Running"] = False
            return ""
        if args[:3] == ["docker", "image", "inspect"]:
            if args[3] not in self.local_images:
                raise release.ReleaseError("host_operation_failed")
            return json.dumps([{"Id": args[3]}])
        if args[:3] == ["docker", "network", "inspect"]:
            if not self.network_present:
                raise release.ReleaseError("host_operation_failed")
            return json.dumps([self.network])
        if args[:3] == ["docker", "network", "create"]:
            self.network_present = True
            return "network-created"
        if args[:2] == ["docker", "exec"]:
            return self.revision + "\n"
        if args[:3] == ["docker", "image", "save"]:
            Path(args[args.index("--output") + 1]).write_bytes(b"isolated-image-backup")
            return ""
        if args[:3] == ["docker", "image", "load"]:
            self.local_images.update(self.old_images)
            return ""
        if args[:2] == ["docker", "compose"]:
            config = json.loads(Path(args[args.index("-f") + 1]).read_text())
            for service in release.SERVICES:
                if service in args[args.index("up") + 1:]:
                    runtime = config["services"][service]
                    self.rows[service]["Image"] = runtime["image"]
                    self.rows[service]["Config"]["Env"] = [f"{key}={value.replace('$$', '$')}" for key, value in runtime["environment"].items()]
                    labels = self.rows[service]["Config"]["Labels"]
                    labels["com.docker.compose.project.working_dir"] = args[args.index("--project-directory") + 1]
                    labels["com.docker.compose.project.config_files"] = ",".join(args[index + 1] for index, value in enumerate(args) if value == "-f")
            return ""
        if args == ["nginx", "-t"] or args == ["systemctl", "reload", "nginx"]:
            return ""
        raise AssertionError(f"Unexpected fixture command: {args}")

    def start_worker(self, layout, sha, transaction_id):
        self.started = True

    def worker_state(self, transaction_id):
        return "active" if self.started else "inactive"

    def stop_worker(self, transaction_id):
        self.stop_calls += 1
        if self.before_stop:
            self.before_stop()
        self.started = False

    def deploy(self, layout, candidate, state):
        if self.before_deploy:
            self.before_deploy()
        fence = json.loads(layout.state.read_text())
        if fence["phase"] != "active" or fence["sha"] != state["sha"] or fence["transaction_id"] != state["transaction_id"] or self.clock() >= fence["deadline_epoch"]:
            raise release.ReleaseError("fixture_fence_revoked")
        self.deploy_calls += 1
        self.rows["api"]["Image"] = image_id(99)
        if self.error_on_deploy:
            raise release.ReleaseError("host_operation_failed")
        data = json.loads((candidate / "artifacts/release-images/manifest.json").read_text())
        self.local_images.update(image["id"] for image in data["images"].values())
        for service, image in data["images"].items():
            self.rows[service]["Image"] = image["id"]
        (candidate / "artifacts/deploy-runtime").mkdir(parents=True, exist_ok=True)
        release.private_json(candidate / "artifacts/deploy-runtime/latest.json", {"sha": state["sha"], "images": data["images"], "image_archive_sha256": data["archive_sha256"]})

    def verify_images(self, data):
        if self.before_verify:
            self.before_verify()
        super().verify_images(data)

    def restore(self, layout, target, snapshot):
        self.restore_calls += 1
        super().restore(layout, target, snapshot)


class HotelReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.original = self.root / "original"
        (self.original / "infra").mkdir(parents=True)
        (self.original / "infra/.env").write_text(f"KAJOVO_API_VOICE_MASTER_KEY={SECRET}\nPRIVATE_VALUE=fixture-only\n")
        os.chmod(self.original / "infra/.env", 0o600)
        for file in ("compose.prod.yml", "compose.prod.hotel-hcasc.yml"):
            (self.original / "infra" / file).write_text("services: {}\n")
        site = self.root / "nginx-site.conf"
        enabled = self.root / "nginx-enabled.conf"
        site.write_text("original nginx fixture\n")
        enabled.symlink_to(site)
        self.layout = release.Layout(releases=self.root / "releases", private=self.root / "private", public=self.root / "public", initial_source=self.original, nginx_site=site, nginx_enabled=enabled, legacy_state=self.root / "legacy/transaction.json", owner_uid=os.geteuid())
        self.clock = Clock()
        self.host = FakeHost(self.original, self.clock)
        self.controller = release.ReleaseController(self.layout, self.host, self.clock)
        self.candidate = self.make_candidate(SHA)
        self.original_rows = copy.deepcopy(self.host.rows)

    def make_candidate(self, sha):
        candidate = self.layout.releases / sha
        (candidate / "infra/ops").mkdir(parents=True)
        (candidate / "infra/ops/deploy-production.sh").write_text("#!/bin/bash\nexit 0\n")
        (candidate / "infra/.env").write_text(f"KAJOVO_API_VOICE_MASTER_KEY={SECRET}\n")
        (candidate / "apps/kajovo-hotel-api/alembic/versions").mkdir(parents=True)
        (candidate / "apps/kajovo-hotel-api/alembic/versions/0039.py").write_text(f"revision: str = '{REVISION}'\n")
        bundle = candidate / "artifacts/release-images"
        bundle.mkdir(parents=True)
        archive = b"isolated-bundle-fixture"
        (bundle / "images.tar.gz").write_bytes(archive)
        release.private_json(bundle / "manifest.json", manifest(sha, archive))
        return candidate

    def passed_worker(self):
        state = self.controller.prepare(SHA)
        activated = self.controller.activate(SHA)
        self.assertEqual(activated["worker"], "RUNNING")
        return self.controller.worker(SHA, state["transaction_id"])

    def test_invalid_sha_and_symlink_candidate_cannot_prepare(self):
        for value in ("A" * 40, "a" * 39, "../" + SHA, SHA + " extra"):
            with self.assertRaises(release.ReleaseError):
                self.controller.prepare(value)
        alias = self.layout.releases / OTHER_SHA
        alias.symlink_to(self.candidate, target_is_directory=True)
        with self.assertRaisesRegex(release.ReleaseError, "canonical_release"):
            self.controller.prepare(OTHER_SHA)
        self.assertIsNone(self.controller.read())

    def test_snapshot_is_private_and_captures_actual_runtime_and_master(self):
        state = self.controller.prepare(SHA)
        self.assertEqual(set(state), set(release.PUBLIC_KEYS))
        public = self.layout.state.read_text()
        self.assertNotIn(SECRET, public)
        self.assertNotIn(str(self.original), public)
        target = self.controller.target(state)
        snapshot = json.loads((target / "snapshot.json").read_text())
        config = json.loads((target / "compose.runtime.json").read_text())
        self.assertEqual(config["services"]["api"]["environment"]["KAJOVO_API_VOICE_MASTER_KEY"], SECRET)
        self.assertEqual(config["services"]["api"]["image"], self.original_rows["api"]["Image"])
        self.assertTrue(all(volume["external"] for volume in config["volumes"].values()))
        self.assertEqual(snapshot["revisions"], [REVISION])
        self.assertEqual(snapshot["source_root"], str(self.original))
        self.assertEqual(snapshot["project_directory"], str(self.original / "infra"))
        self.assertTrue((target / "source.tar").is_file())
        self.assertTrue((target / "images.tar").is_file())
        self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o700)
        for path in target.iterdir():
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.layout.state.stat().st_mode), 0o644)
        self.assertEqual(stat.S_IMODE(self.layout.runtime_lock.stat().st_mode), 0o644)
        self.assertEqual(state["deadline_epoch"], self.clock.value + 1800)

    def test_prepare_refuses_master_rotation_or_unavailable_live_revision(self):
        (self.candidate / "infra/.env").write_text("KAJOVO_API_VOICE_MASTER_KEY=unexpected-test-key\n")
        with self.assertRaisesRegex(release.ReleaseError, "voice_master"):
            self.controller.prepare(SHA)
        (self.candidate / "infra/.env").write_text(f"KAJOVO_API_VOICE_MASTER_KEY={SECRET}\n")
        self.host.revision = "0040_unrepresented_runtime"
        with self.assertRaisesRegex(release.ReleaseError, "live_schema"):
            self.controller.prepare(SHA)
        self.assertIsNone(self.controller.read())

    def test_actual_release_infra_labels_and_missing_env_label_are_supported(self):
        old = self.layout.releases / OTHER_SHA
        (old / "infra").mkdir(parents=True)
        for name in (".env", "compose.prod.yml", "compose.prod.hotel-hcasc.yml"):
            (old / "infra" / name).write_bytes((self.original / "infra" / name).read_bytes())
        for row in self.host.rows.values():
            labels = row["Config"]["Labels"]
            labels["com.docker.compose.project.working_dir"] = str(old / "infra")
            labels["com.docker.compose.project.config_files"] = f"{old}/infra/compose.prod.yml,{old}/infra/compose.prod.hotel-hcasc.yml,/var/backups/home-assistant-mcp/old/rollback-images.yml"
            labels.pop("com.docker.compose.project.environment_file")
        state = self.controller.prepare(SHA)
        snapshot = json.loads((self.controller.target(state) / "snapshot.json").read_text())
        self.assertEqual(snapshot["source_root"], str(old))
        self.assertEqual(snapshot["project_directory"], str(old / "infra"))
        self.assertEqual(snapshot["env_files"], [str(old / "infra/.env")])
        self.controller.rollback(SHA)
        for row in self.host.rows.values():
            self.assertEqual(row["Config"]["Labels"]["com.docker.compose.project.working_dir"], str(old / "infra"))

    def test_wrong_sha_or_transaction_cannot_start_worker(self):
        state = self.controller.prepare(SHA)
        with self.assertRaises(release.ReleaseError):
            self.controller.activate(OTHER_SHA)
        with self.assertRaises(release.ReleaseError):
            self.controller.worker(SHA, "b" * 32)
        self.assertEqual(self.controller.status(SHA), state)
        self.assertEqual(self.host.deploy_calls, 0)

    def test_duplicate_activation_starts_one_unit(self):
        self.controller.prepare(SHA)
        self.controller.activate(SHA)
        self.controller.activate(SHA)
        self.assertEqual(self.controller.status(SHA)["worker"], "RUNNING")
        self.assertEqual(self.host.stop_calls, 0)

    def test_worker_error_revokes_immediately_and_timer_restores(self):
        state = self.controller.prepare(SHA)
        self.controller.activate(SHA)
        self.host.error_on_deploy = True
        with self.assertRaisesRegex(release.ReleaseError, "managed_worker_failed"):
            self.controller.worker(SHA, state["transaction_id"])
        failed = self.controller.status(SHA)
        self.assertEqual(failed["phase"], "rolling_back")
        self.assertEqual(failed["worker"], "FAIL")
        restored = self.controller.deadline()
        self.assertEqual(restored["phase"], "rolled_back")
        self.assertEqual(self.host.rows["api"]["Image"], self.original_rows["api"]["Image"])

    def test_deadline_recovers_pending_disconnected_or_lost_worker(self):
        state = self.controller.prepare(SHA)
        self.clock.value = state["deadline_epoch"]
        self.assertEqual(self.controller.deadline()["phase"], "rolled_back")
        self.assertEqual(self.host.deploy_calls, 0)
        state = self.controller.prepare(SHA)
        self.controller.activate(SHA)
        self.host.started = False
        self.assertEqual(self.controller.deadline()["phase"], "rolled_back")
        self.assertEqual(self.host.deploy_calls, 0)

    def test_late_worker_after_rollback_cannot_mutate_runtime_or_state(self):
        state = self.controller.prepare(SHA)
        self.controller.activate(SHA)
        rolled_back = self.controller.rollback(SHA)
        with self.assertRaises(release.ReleaseError):
            self.controller.worker(SHA, state["transaction_id"])
        self.assertEqual(self.controller.status(SHA), rolled_back)
        self.assertEqual(self.host.deploy_calls, 0)
        new = self.controller.prepare(SHA)
        self.controller.activate(SHA)
        with self.assertRaises(release.ReleaseError):
            self.controller.worker(SHA, state["transaction_id"])
        self.assertEqual(self.controller.status(SHA)["transaction_id"], new["transaction_id"])
        self.assertEqual(self.controller.status(SHA)["phase"], "active")

    def test_expired_worker_cannot_begin_deploy(self):
        state = self.controller.prepare(SHA)
        self.controller.activate(SHA)
        self.clock.value = state["deadline_epoch"]
        with self.assertRaises(release.ReleaseError):
            self.controller.worker(SHA, state["transaction_id"])
        self.assertEqual(self.host.deploy_calls, 0)
        self.assertEqual(self.controller.deadline()["phase"], "rolled_back")

    def test_accept_requires_artifact_and_exact_healthy_immutable_images(self):
        self.passed_worker()
        self.host.rows["web"]["Image"] = image_id(999)
        with self.assertRaisesRegex(release.ReleaseError, "immutable_image"):
            self.controller.accept(SHA)
        self.assertEqual(self.controller.status(SHA)["phase"], "rolled_back")
        self.assertEqual(self.host.restore_calls, 1)

    def test_accept_refuses_wrong_artifact_sha_and_rolls_back(self):
        self.passed_worker()
        artifact = self.candidate / "artifacts/deploy-runtime/latest.json"
        data = json.loads(artifact.read_text())
        data["sha"] = OTHER_SHA
        release.private_json(artifact, data)
        with self.assertRaisesRegex(release.ReleaseError, "artifact_identity"):
            self.controller.accept(SHA)
        self.assertEqual(self.controller.status(SHA)["phase"], "rolled_back")

    def test_changed_prepared_image_bundle_cannot_activate(self):
        self.controller.prepare(SHA)
        path = self.candidate / "artifacts/release-images/manifest.json"
        changed = json.loads(path.read_text())
        changed["images"]["web"]["id"] = image_id(99)
        release.private_json(path, changed)
        with self.assertRaisesRegex(release.ReleaseError, "prepared_candidate"):
            self.controller.activate(SHA)
        self.assertEqual(self.controller.status(SHA)["phase"], "rolled_back")

    def test_prepared_source_and_environment_changes_revoke_activation(self):
        self.controller.prepare(SHA)
        (self.candidate / "infra/ops/deploy-production.sh").write_text("#!/bin/bash\nexit 1\n")
        with self.assertRaisesRegex(release.ReleaseError, "candidate_source_changed"):
            self.controller.activate(SHA)
        self.assertEqual(self.controller.status(SHA)["phase"], "rolled_back")
        self.controller.prepare(SHA)
        with (self.candidate / "infra/.env").open("a") as stream:
            stream.write("NEW_ENV=changed-after-preparation\n")
        with self.assertRaisesRegex(release.ReleaseError, "candidate_source_changed"):
            self.controller.activate(SHA)
        self.assertEqual(self.controller.status(SHA)["phase"], "rolled_back")

    def test_acceptance_is_final_even_after_deadline_and_explicit_rollback(self):
        self.passed_worker()
        accepted = self.controller.accept(SHA)
        self.clock.value = accepted["deadline_epoch"] + 1
        self.assertEqual(self.controller.deadline(), accepted)
        self.assertEqual(self.controller.rollback(SHA), accepted)
        self.assertEqual(self.controller.accept(SHA), accepted)
        self.assertEqual(self.controller.prepare(SHA), accepted)
        self.assertEqual(self.controller.activate(SHA), accepted)
        self.assertEqual(self.host.restore_calls, 0)
        self.assertTrue(self.controller.target(accepted).exists())

    def test_accept_rechecks_deadline_after_image_inspection(self):
        state = self.passed_worker()
        self.host.before_verify = lambda: setattr(self.clock, "value", state["deadline_epoch"])
        with self.assertRaises(release.ReleaseError):
            self.controller.accept(SHA)
        self.assertEqual(self.controller.status(SHA)["phase"], "rolled_back")

    def test_acceptance_and_deadline_decisions_are_serialized(self):
        state = self.passed_worker()
        entered, proceed, timer_done = threading.Event(), threading.Event(), threading.Event()
        accepted, expired, failures = [], [], []
        def block_verification():
            entered.set()
            self.assertTrue(proceed.wait(5))
        self.host.before_verify = block_verification
        def accept():
            try:
                accepted.append(self.controller.accept(SHA))
            except Exception as error:
                failures.append(error)
        def deadline():
            try:
                expired.append(self.controller.deadline())
            except Exception as error:
                failures.append(error)
            finally:
                timer_done.set()
        accepter = threading.Thread(target=accept)
        accepter.start()
        self.assertTrue(entered.wait(5))
        timer = threading.Thread(target=deadline)
        timer.start()
        self.assertFalse(timer_done.wait(0.05))
        proceed.set()
        accepter.join(5)
        timer.join(5)
        self.assertFalse(accepter.is_alive())
        self.assertFalse(timer.is_alive())
        self.assertEqual(failures, [])
        self.assertEqual(accepted[0]["phase"], "accepted")
        self.assertEqual(expired[0]["phase"], "accepted")
        self.assertEqual(self.host.restore_calls, 0)
        self.clock.value = state["deadline_epoch"]
        self.assertEqual(self.controller.deadline()["phase"], "accepted")

    def test_rollback_releases_controller_lock_before_stopping_worker(self):
        self.controller.prepare(SHA)
        self.controller.activate(SHA)
        finalizer_completed = threading.Event()
        def stop():
            thread = threading.Thread(target=lambda: (self.controller.status(SHA), finalizer_completed.set()))
            thread.start()
            self.assertTrue(finalizer_completed.wait(5))
            thread.join(5)
        self.host.before_stop = stop
        self.assertEqual(self.controller.rollback(SHA)["phase"], "rolled_back")

    def test_restore_preserves_secret_volumes_nginx_and_recovers_missing_images(self):
        state = self.passed_worker()
        self.host.local_images.difference_update(self.host.old_images)
        self.host.network_present = False
        (self.original / "infra/.env").write_text("KAJOVO_API_VOICE_MASTER_KEY=changed-fixture\n")
        self.layout.nginx_site.write_text("candidate nginx fixture\n")
        rolled_back = self.controller.rollback(SHA)
        self.assertEqual(rolled_back["phase"], "rolled_back")
        self.assertEqual(self.layout.nginx_site.read_text(), "original nginx fixture\n")
        self.assertTrue(self.layout.nginx_enabled.is_symlink())
        self.assertIn(SECRET, (self.original / "infra/.env").read_text())
        self.assertEqual(release.env_map(self.host.rows["api"]["Config"]["Env"])["KAJOVO_API_VOICE_MASTER_KEY"], SECRET)
        commands = [args for args, _ in self.host.calls]
        self.assertTrue(any(args[:3] == ["docker", "image", "load"] for args in commands))
        self.assertTrue(any(args[:3] == ["docker", "network", "create"] for args in commands))
        for args in commands:
            self.assertNotIn("prune", args)
            self.assertNotIn("downgrade", args)
            self.assertNotIn("down", args)
            self.assertNotIn("--volumes", args)
            self.assertNotIn("--build", args)
        self.assertTrue(self.controller.target(state).exists())
        # A subsequent transaction understands its own root-private Compose
        # labels and retains the original deploy-readable source/env identity.
        again = self.controller.prepare(SHA)
        self.assertEqual(again["phase"], "active")
        self.assertNotEqual(again["transaction_id"], state["transaction_id"])

    def test_runtime_dollar_values_and_commands_are_preserved_as_literals(self):
        self.host.rows["api"]["Config"]["Env"].append("PASSWORD=$UNKNOWN_VARIABLE$$literal")
        self.host.rows["api"]["Config"]["Cmd"] = ["sh", "-c", "printf '%s' \"$PASSWORD\""]
        state = self.controller.prepare(SHA)
        config = json.loads((self.controller.target(state) / "compose.runtime.json").read_text())
        self.assertEqual(config["services"]["api"]["environment"]["PASSWORD"], "$$UNKNOWN_VARIABLE$$$$literal")
        self.assertIn("$$PASSWORD", config["services"]["api"]["command"][-1])
        self.controller.rollback(SHA)
        actual = release.env_map(self.host.rows["api"]["Config"]["Env"])
        self.assertEqual(actual["PASSWORD"], "$UNKNOWN_VARIABLE$$literal")

    def test_native_compose_literal_model_matches_raw_runtime_reference(self):
        docker = shutil.which("docker")
        if not docker:
            self.skipTest("Native Docker Compose CLI unavailable")
        version = subprocess.run([docker, "compose", "version"], capture_output=True, timeout=15)
        if version.returncode:
            self.skipTest("Native Docker Compose plugin unavailable")
        password = "fixture$UNKNOWN_KAJOVO_VAR$$literal"
        command = "printf '%s' \"$RUNTIME_VALUE\""
        self.host.rows["api"]["Config"]["Env"].append("PASSWORD=" + password)
        self.host.rows["api"]["Config"]["Cmd"] = ["sh", "-c", command]
        state = self.controller.prepare(SHA)
        target = self.controller.target(state)
        snapshot = target / "compose.runtime.json"
        reference = json.loads(snapshot.read_text())
        reference["services"]["api"]["environment"]["PASSWORD"] = "${HOTEL_TEST_LITERAL_PASSWORD}"
        reference["services"]["api"]["command"][-1] = "${HOTEL_TEST_LITERAL_COMMAND}"
        reference_path = target / "compose-reference.json"
        release.private_json(reference_path, reference)
        environment = os.environ.copy()
        environment.update({"HOTEL_TEST_LITERAL_PASSWORD": password, "HOTEL_TEST_LITERAL_COMMAND": command})
        def service_hash(path):
            # Native model hashes compare the applied values. JSON config output
            # serializes dollar escapes again so that it can be reused as input.
            result = subprocess.run([docker, "compose", "-p", release.PROJECT, "--project-directory", str(self.original / "infra"), "--env-file", str(self.original / "infra/.env"), "-f", str(path), "config", "--hash", "api"], env=environment, capture_output=True, text=True, check=True, timeout=30)
            return result.stdout.strip()
        self.assertEqual(service_hash(snapshot), service_hash(reference_path))

    def test_rollback_failure_is_retried_by_independent_timer(self):
        self.controller.prepare(SHA)
        original_restore = self.host.restore
        def fail(*args):
            raise release.ReleaseError("host_operation_failed")
        self.host.restore = fail
        with self.assertRaisesRegex(release.ReleaseError, "rollback_requires_retry"):
            self.controller.rollback(SHA)
        self.assertEqual(self.controller.status(SHA)["phase"], "rolling_back")
        self.host.restore = original_restore
        self.assertEqual(self.controller.deadline()["phase"], "rolled_back")

    def test_rollback_recovers_completely_deleted_source_and_environment(self):
        state = self.passed_worker()
        shutil.rmtree(self.original)
        self.assertFalse(self.original.exists())
        self.assertEqual(self.controller.rollback(SHA)["phase"], "rolled_back")
        self.assertTrue((self.original / "infra/compose.prod.yml").is_file())
        self.assertIn(SECRET, (self.original / "infra/.env").read_text())
        self.assertEqual(stat.S_IMODE((self.original / "infra/.env").stat().st_mode), 0o600)
        self.assertEqual(self.host.rows["api"]["Image"], self.original_rows["api"]["Image"])
        self.assertTrue(self.controller.target(state).exists())
        self.assertEqual(self.controller.prepare(SHA)["phase"], "active")

    def test_source_recovery_rejects_escape_and_link_entries_without_writes(self):
        state = self.controller.prepare(SHA)
        target = self.controller.target(state)
        snapshot = json.loads((target / "snapshot.json").read_text())
        for name, kind in (("source/../../escape", tarfile.REGTYPE), ("source/unsafe-link", tarfile.SYMTYPE), ("source/unsafe-hardlink", tarfile.LNKTYPE)):
            with tarfile.open(target / "source.tar", "w") as archive:
                entry = tarfile.TarInfo(name)
                entry.type = kind
                entry.linkname = "/etc/shadow"
                archive.addfile(entry)
            with self.assertRaisesRegex(release.ReleaseError, "source_archive_invalid"):
                release.Host.restore_source(self.layout, target, snapshot)
            self.assertFalse((self.root / "escape").exists())
            self.assertFalse((self.original / "unsafe-link").exists())
        self.assertIn(SECRET, (self.original / "infra/.env").read_text())

    def test_rollback_stops_daemon_owned_migration_oneoffs(self):
        self.passed_worker()
        oneoff = copy.deepcopy(self.host.rows["api"])
        oneoff["Id"] = "migration-oneoff"
        oneoff["Config"]["Labels"]["com.docker.compose.oneoff"] = "True"
        self.host.oneoffs.append(oneoff)
        self.controller.rollback(SHA)
        self.assertFalse(oneoff["State"]["Running"])
        commands = [args for args, _ in self.host.calls]
        stop_index = next(index for index, args in enumerate(commands) if args[:2] == ["docker", "stop"])
        restore_index = next(index for index, args in enumerate(commands) if args[:2] == ["docker", "compose"])
        self.assertLess(stop_index, restore_index)

    def test_prepare_refuses_inflight_migration_and_unhealthy_baseline(self):
        oneoff = copy.deepcopy(self.host.rows["api"])
        oneoff["Id"] = "migration-oneoff"
        oneoff["Config"]["Labels"]["com.docker.compose.oneoff"] = "True"
        self.host.oneoffs.append(oneoff)
        with self.assertRaisesRegex(release.ReleaseError, "oneoff_workload"):
            self.controller.prepare(SHA)
        self.host.oneoffs.clear()
        self.host.rows["api"]["State"]["Health"]["Status"] = "unhealthy"
        with self.assertRaisesRegex(release.ReleaseError, "runtime_unhealthy"):
            self.controller.prepare(SHA)
        self.assertIsNone(self.controller.read())

    def test_production_worker_environment_is_bounded_and_outputs_discarded(self):
        state = self.controller.prepare(SHA)
        commands = []
        host = release.Host()
        host.command = lambda args, **kwargs: commands.append((args, kwargs)) or ""
        host.deploy(self.layout, self.candidate, state)
        args, options = commands[0]
        self.assertEqual(args[:4], ["runuser", "--user", "deploy-hotel", "--"])
        self.assertEqual(options["env"]["HOTEL_RELEASE_SHA"], SHA)
        self.assertEqual(options["env"]["HOTEL_RELEASE_ID"], state["transaction_id"])
        self.assertEqual(options["env"]["HOTEL_RELEASE_STATE_FILE"], str(self.layout.state))
        self.assertEqual(options["env"]["HOTEL_RELEASE_RUNTIME_LOCK"], str(self.layout.runtime_lock))
        self.assertEqual(options["env"]["RESET_DB_ON_DEPLOY"], "false")
        self.assertEqual(options["env"]["ALLOW_DB_REINIT"], "0")
        self.assertTrue(options["quiet"])
        self.assertNotIn("MCP", json.dumps(options))

    def test_legacy_active_or_unknown_transaction_refuses_new_authority(self):
        self.layout.legacy_state.parent.mkdir()
        for phase in ("active", "rolling_back", "accepted_cleanup_pending", "unknown"):
            release.private_json(self.layout.legacy_state, {"phase": phase, "secret": "fixture-private"})
            with self.assertRaisesRegex(release.ReleaseError, "legacy_release_authority_not_terminal"):
                self.controller.prepare(SHA)
            self.assertIsNone(self.controller.read())
        release.private_json(self.layout.legacy_state, {"phase": "rolled_back"})
        self.assertEqual(self.controller.prepare(SHA)["phase"], "active")

    def test_legacy_workers_and_enabled_deadlines_are_read_only_blockers(self):
        for units, files in (("home-assistant-mcp-hotel-worker.service loaded active running fixture", ""), ("", "home-assistant-mcp-deadline.timer enabled enabled")):
            self.host.legacy_units, self.host.legacy_unit_files = units, files
            with self.assertRaisesRegex(release.ReleaseError, "legacy_release_worker_or_timer"):
                self.controller.prepare(SHA)
            self.assertIsNone(self.controller.read())
        # A capability-server service does not mutate hotel releases and is
        # outside this controller's authority or installation scope.
        self.host.legacy_units = "home-assistant-mcp.service loaded active running fixture"
        self.host.legacy_unit_files = "home-assistant-mcp.service enabled enabled"
        state = self.controller.prepare(SHA)
        self.host.legacy_units = "home-assistant-mcp-hotel-worker.service loaded active running fixture"
        with self.assertRaisesRegex(release.ReleaseError, "rollback_requires_retry"):
            self.controller.activate(SHA)
        self.assertEqual(self.controller.status(SHA)["phase"], "rolling_back")
        self.assertEqual(self.host.deploy_calls, 0)
        self.assertTrue(self.controller.target(state).exists())
        self.assertFalse(any(args[:2] in (["systemctl", "stop"], ["systemctl", "disable"]) and "home-assistant" in " ".join(args) for args, _ in self.host.calls))
        self.assertFalse(any(args[:2] == ["docker", "compose"] for args, _ in self.host.calls))
        self.host.legacy_units = ""
        self.assertEqual(self.controller.deadline()["phase"], "rolled_back")


if __name__ == "__main__":
    unittest.main()
