#!/usr/bin/env python3
"""Root-owned, hotel-only release transaction and independently timed rollback.

The public state is also the runtime fence. Controller decisions hold the
private controller lock; restoring containers holds the public runtime lock.
Stopping a systemd worker never holds the controller lock, because its final
status update needs that lock. Neither snapshots nor subprocess output are
included in the public status.
"""
from __future__ import annotations

import argparse
import ast
import contextlib
import fcntl
import hashlib
import importlib.util
import json
import os
import re
import secrets
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path, PurePosixPath


SHA = re.compile(r"[a-f0-9]{40}")
TOKEN = re.compile(r"[a-f0-9]{32}")
IMAGE = re.compile(r"sha256:[a-f0-9]{64}")
SERVICES = ("postgres", "api", "web", "admin")
PROJECT = "kajovo-prod"
PUBLIC_KEYS = ("sha", "transaction_id", "phase", "deadline_epoch", "worker", "rollback")
DEADLINE_SECONDS = 1800


class ReleaseError(RuntimeError):
    """Messages are fixed aggregate error codes, never subprocess content."""


@dataclass(frozen=True)
class Layout:
    releases: Path = Path("/home/deploy-hotel/kajovo-deploy-releases")
    private: Path = Path("/var/lib/kajovo-hotel-release")
    public: Path = Path("/etc/kajovo-hotel-release-public")
    initial_source: Path = Path("/opt/kajovo-hotel-monorepo")
    nginx_site: Path = Path("/etc/nginx/sites-available/hotel.hcasc.cz.conf")
    nginx_enabled: Path = Path("/etc/nginx/sites-enabled/hotel.hcasc.cz.conf")
    controller: Path = Path("/usr/local/lib/kajovo-hotel-release/hotel_release.py")
    legacy_state: Path = Path("/etc/home-assistant-mcp-public/transaction.json")
    owner_uid: int = 0

    @property
    def state(self) -> Path:
        return self.public / "transaction.json"

    @property
    def runtime_lock(self) -> Path:
        return self.public / "runtime.lock"


def exact_sha(value: str) -> str:
    if not SHA.fullmatch(value):
        raise ReleaseError("exact_release_sha_required")
    return value


def private_json(path: Path, payload: dict, mode: int = 0o600) -> None:
    data = (json.dumps(payload, sort_keys=True, indent=2) + "\n").encode()
    atomic_bytes(path, data, mode)


def atomic_bytes(path: Path, data: bytes, mode: int) -> None:
    fd, temporary = tempfile.mkstemp(prefix=".release-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        Path(temporary).unlink(missing_ok=True)


def regular_file(path: Path) -> None:
    if path.is_symlink() or not path.is_file() or path.resolve() != path:
        raise ReleaseError("canonical_regular_file_required")


def trusted_bundle(directory: Path, sha: str) -> dict:
    for name in ("manifest.json", "images.tar.gz"):
        regular_file(directory / name)
    # Production installs both modules root-owned and runs Python with -I.
    # Never import validation code from the uploaded candidate source tree.
    source = Path(__file__).resolve().with_name("release_images.py")
    spec = importlib.util.spec_from_file_location("hotel_release_images", source)
    if spec is None or spec.loader is None:
        raise ReleaseError("trusted_bundle_validator_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        return module.validate_bundle(directory, sha)
    except (OSError, ValueError, RuntimeError, TypeError, KeyError, AttributeError):
        raise ReleaseError("candidate_image_bundle_invalid") from None


def revision_ids(release: Path) -> set[str]:
    directory = release / "apps/kajovo-hotel-api/alembic/versions"
    result: set[str] = set()
    for path in directory.glob("*.py"):
        regular_file(path)
        try:
            statements = ast.parse(path.read_text()).body
        except (OSError, SyntaxError):
            raise ReleaseError("candidate_migration_invalid") from None
        for statement in statements:
            if isinstance(statement, ast.Assign):
                targets, value = statement.targets, statement.value
            elif isinstance(statement, ast.AnnAssign):
                targets, value = [statement.target], statement.value
            else:
                continue
            if any(isinstance(target, ast.Name) and target.id == "revision" for target in targets):
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    result.add(value.value)
    return result


def env_map(rows: list[str]) -> dict[str, str]:
    return dict(row.split("=", 1) for row in rows if "=" in row)


def candidate_master(path: Path) -> str:
    regular_file(path)
    values = []
    for line in path.read_text().splitlines():
        match = re.fullmatch(r"\s*(?:export\s+)?KAJOVO_API_VOICE_MASTER_KEY\s*=(.*)", line)
        if match:
            value = match.group(1).strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values.append(value)
    if len(values) > 1:
        raise ReleaseError("candidate_master_ambiguous")
    return values[0] if values else ""


def candidate_fingerprint(directory: Path) -> str:
    """Bind prepared source and private environment; ignore only runtime output."""
    digest = hashlib.sha256()
    for path in sorted(directory.rglob("*")):
        relative = path.relative_to(directory)
        if relative.parts[0] == "artifacts" or any(part in {".git", "__pycache__"} for part in relative.parts) or path.suffix == ".pyc":
            continue
        if path.is_symlink():
            if directory not in path.resolve().parents:
                raise ReleaseError("candidate_source_symlink_invalid")
            payload = b"link:" + os.readlink(path).encode()
        elif path.is_file():
            with path.open("rb") as stream:
                payload = hashlib.file_digest(stream, "sha256").digest()
        elif path.is_dir():
            continue
        else:
            raise ReleaseError("candidate_source_type_invalid")
        digest.update(relative.as_posix().encode() + b"\0" + payload + b"\0")
    return digest.hexdigest()


def compose_from_runtime(rows: dict[str, dict], networks: list[dict]) -> dict:
    """Preserve actual runtime secrets, named volumes, bindings and image IDs."""
    config: dict = {"services": {}, "volumes": {}, "networks": {}}
    for index, network in enumerate(networks):
        config["networks"][f"network_{index}"] = {"external": True, "name": network["Name"]}
    for service, row in rows.items():
        container, host = row["Config"], row["HostConfig"]
        actual: dict = {
            "image": row["Image"], "pull_policy": "never",
            "container_name": row["Name"].lstrip("/"),
            "environment": env_map(container.get("Env", [])),
            "restart": host.get("RestartPolicy", {}).get("Name") or "no",
        }
        for source, target in (("Cmd", "command"), ("Entrypoint", "entrypoint"), ("User", "user"), ("WorkingDir", "working_dir")):
            if container.get(source) is not None:
                actual[target] = container[source]
        health = container.get("Healthcheck", {})
        if health:
            actual["healthcheck"] = {"test": health["Test"]}
            for source, target in (("Interval", "interval"), ("Timeout", "timeout"), ("StartPeriod", "start_period")):
                if health.get(source):
                    actual["healthcheck"][target] = f"{health[source]}ns"
            if health.get("Retries"):
                actual["healthcheck"]["retries"] = health["Retries"]
        actual["labels"] = {name: value for name, value in container.get("Labels", {}).items() if not name.startswith("com.docker.compose.")}
        mounts = []
        for mount in row.get("Mounts", []):
            entry = {"type": mount["Type"], "target": mount["Destination"], "read_only": not mount["RW"]}
            if mount["Type"] == "volume":
                alias = f"volume_{len(config['volumes'])}"
                config["volumes"][alias] = {"external": True, "name": mount["Name"]}
                entry["source"] = alias
            elif mount["Type"] == "bind":
                entry["source"] = mount["Source"]
                entry["bind"] = {"create_host_path": False}
            elif mount["Type"] != "tmpfs":
                raise ReleaseError("unsupported_runtime_mount")
            mounts.append(entry)
        if mounts:
            actual["volumes"] = mounts
        ports = []
        for target, bindings in host.get("PortBindings", {}).items():
            number, protocol = target.split("/", 1)
            for binding in bindings or []:
                ports.append({"target": int(number), "published": binding["HostPort"], "host_ip": binding.get("HostIp", ""), "protocol": protocol})
        if ports:
            actual["ports"] = ports
        attached = row.get("NetworkSettings", {}).get("Networks", {})
        actual["networks"] = {}
        for alias, network in config["networks"].items():
            if network["name"] in attached:
                settings = attached[network["name"]]
                actual["networks"][alias] = {"aliases": settings.get("Aliases") or [service]}
                for key in ("IPv4Address", "IPv6Address"):
                    address = (settings.get("IPAMConfig") or {}).get(key)
                    if address:
                        actual["networks"][alias][key.lower().replace("address", "_address")] = address
        if not actual["networks"]:
            raise ReleaseError("runtime_network_missing")
        for source, target in (("ReadonlyRootfs", "read_only"), ("Privileged", "privileged"), ("CapAdd", "cap_add"), ("CapDrop", "cap_drop"), ("SecurityOpt", "security_opt"), ("Init", "init")):
            if host.get(source):
                actual[target] = host[source]
        config["services"][service] = actual
    def literal(value):
        # Compose interpolates JSON, too. Runtime passwords/commands containing
        # dollar signs must survive recreation byte-for-byte, without expansion.
        if isinstance(value, str):
            return value.replace("$", "$$")
        if isinstance(value, list):
            return [literal(item) for item in value]
        if isinstance(value, dict):
            return {key: literal(item) for key, item in value.items()}
        return value
    return literal(config)


class Host:
    """All commands are fixed controller operations; subprocess data stays private."""

    def command(self, args: list[str], *, env: dict[str, str] | None = None, timeout: int = 300, quiet: bool = False) -> str:
        try:
            result = subprocess.run(args, env=env or self.clean_env(), stdout=subprocess.DEVNULL if quiet else subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout, check=False)
        except (OSError, subprocess.SubprocessError):
            raise ReleaseError("host_operation_failed") from None
        # systemctl returns 1, without output, when this exact pattern has no
        # installed units. Any listing error or other failed command is fatal.
        no_legacy_units = (not quiet and result.returncode == 1
                           and args == ["systemctl", "list-unit-files", "--no-legend", "--no-pager", "home-assistant-mcp*"]
                           and not result.stdout and not result.stderr)
        if result.returncode and not no_legacy_units:
            raise ReleaseError("host_operation_failed")
        return result.stdout or ""

    @staticmethod
    def clean_env() -> dict[str, str]:
        return {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8", "HOME": "/root"}

    def assert_single_authority(self, layout: Layout) -> None:
        """Refuse overlapping legacy hotel mutation; never stop foreign services."""
        if layout.legacy_state.exists() or layout.legacy_state.is_symlink():
            regular_file(layout.legacy_state)
            info = layout.legacy_state.stat()
            if info.st_uid != layout.owner_uid or info.st_mode & 0o022:
                raise ReleaseError("legacy_release_state_untrusted")
            try:
                previous = json.loads(layout.legacy_state.read_text())
            except (OSError, ValueError):
                raise ReleaseError("legacy_release_authority_unknown") from None
            if not isinstance(previous, dict) or previous.get("phase") not in {"accepted", "rolled_back"}:
                raise ReleaseError("legacy_release_authority_not_terminal")
        mutator = re.compile(r"^home-assistant-mcp.*(?:release|rollback|deadline|transaction|cutover|hotel|worker|activation|acceptance|cleanup)", re.I)
        units = self.command(["systemctl", "list-units", "--all", "--no-legend", "--no-pager", "--plain", "home-assistant-mcp*"], timeout=30)
        for line in units.splitlines():
            parts = line.split()
            if len(parts) >= 3 and mutator.search(parts[0]) and parts[2] in {"active", "activating", "reloading", "deactivating"}:
                raise ReleaseError("legacy_release_worker_or_timer_active")
        enabled = self.command(["systemctl", "list-unit-files", "--no-legend", "--no-pager", "home-assistant-mcp*"], timeout=30)
        for line in enabled.splitlines():
            parts = line.split()
            if len(parts) >= 2 and mutator.search(parts[0]) and parts[1] in {"enabled", "enabled-runtime"}:
                raise ReleaseError("legacy_release_worker_or_timer_enabled")

    def containers(self) -> dict[str, dict]:
        ids = self.command(["docker", "ps", "--all", "--quiet", "--filter", f"label=com.docker.compose.project={PROJECT}"]).split()
        if not ids:
            raise ReleaseError("active_runtime_missing")
        rows = json.loads(self.command(["docker", "inspect", *ids]))
        services = {}
        for row in rows:
            labels = row.get("Config", {}).get("Labels", {})
            if labels.get("com.docker.compose.oneoff", "False").lower() == "true":
                if row.get("State", {}).get("Running"):
                    raise ReleaseError("active_oneoff_workload_requires_completion")
                continue
            service = labels.get("com.docker.compose.service")
            if service not in SERVICES or service in services or labels.get("com.docker.compose.project") != PROJECT:
                raise ReleaseError("ambiguous_runtime_service")
            if not IMAGE.fullmatch(row.get("Image", "")) or not row.get("State", {}).get("Running"):
                raise ReleaseError("active_runtime_not_running")
            if row.get("State", {}).get("Health", {}).get("Status", "healthy") != "healthy":
                raise ReleaseError("active_runtime_unhealthy")
            services[service] = row
        if set(services) != set(SERVICES):
            raise ReleaseError("complete_active_runtime_required")
        return services

    def image_exists(self, image_id: str) -> bool:
        try:
            rows = json.loads(self.command(["docker", "image", "inspect", image_id]))
            return len(rows) == 1 and rows[0]["Id"] == image_id
        except ReleaseError:
            return False

    def verify_images(self, manifest: dict) -> None:
        rows = self.containers()
        for service, image in manifest["images"].items():
            if rows[service]["Image"] != image["id"]:
                raise ReleaseError("running_immutable_image_mismatch")
            if rows[service].get("State", {}).get("Health", {}).get("Status", "healthy") != "healthy":
                raise ReleaseError("running_image_unhealthy")

    def source_root(self, layout: Layout, value: str) -> Path:
        path = Path(value)
        if path.resolve() != path or not path.is_dir():
            raise ReleaseError("active_source_path_invalid")
        # Compose uses the directory of its first -f file as working_dir.
        # Production labels therefore point at <release>/infra, not its root.
        if path.name == "infra":
            path = path.parent
        if path == layout.initial_source:
            return path
        if path.parent == layout.releases and SHA.fullmatch(path.name):
            return path
        raise ReleaseError("active_source_root_invalid")

    def snapshot(self, layout: Layout, target: Path, candidate: Path) -> dict:
        rows = self.containers()
        roots = {row["Config"]["Labels"].get("com.docker.compose.project.working_dir", "") for row in rows.values()}
        if len(roots) != 1:
            raise ReleaseError("active_source_labels_disagree")
        working_directory = Path(roots.pop())
        source = self.source_root(layout, str(working_directory))
        raw_files = {row["Config"]["Labels"].get("com.docker.compose.project.config_files", "") for row in rows.values()}
        if len(raw_files) != 1:
            raise ReleaseError("active_compose_labels_disagree")
        files = []
        for raw in raw_files.pop().split(","):
            path = Path(raw)
            # Old root-created overrides need not be readable by deploy-hotel.
            # Their full meaning is captured by immutable running image IDs.
            if path.name in {"rollback-images.yml", "compose.images.yml", "images.snapshot.json"}:
                continue
            own_snapshot = path.parent.parent == layout.private and TOKEN.fullmatch(path.parent.name) and path.name == "compose.runtime.json"
            if source not in path.parents and not own_snapshot:
                raise ReleaseError("active_compose_path_invalid")
            regular_file(path)
            if own_snapshot and (path.stat().st_uid != layout.owner_uid or path.stat().st_mode & 0o077):
                raise ReleaseError("active_compose_snapshot_untrusted")
            files.append(path)
        if not files:
            raise ReleaseError("active_compose_files_missing")
        environment_labels = {row["Config"]["Labels"].get("com.docker.compose.project.environment_file", "") for row in rows.values()}
        if len(environment_labels) != 1:
            raise ReleaseError("active_environment_labels_disagree")
        environment_files = environment_labels.pop()
        fallback_env = working_directory / ".env" if working_directory.name == "infra" else source / "infra/.env"
        env_paths = [Path(value) for value in environment_files.split(",")] if environment_files else [fallback_env]
        for path in env_paths:
            if source not in path.parents:
                raise ReleaseError("active_environment_path_invalid")
            regular_file(path)
        master = env_map(rows["api"]["Config"].get("Env", [])).get("KAJOVO_API_VOICE_MASTER_KEY", "")
        if master and master != candidate_master(candidate / "infra/.env"):
            raise ReleaseError("voice_master_key_change_forbidden")
        revisions = self.command([
            "docker", "exec", rows["postgres"]["Id"], "sh", "-c",
            'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -c "SELECT version_num FROM alembic_version"',
        ]).split()
        if not revisions or not set(revisions).issubset(revision_ids(candidate)):
            raise ReleaseError("candidate_cannot_preserve_live_schema")
        images = {service: row["Image"] for service, row in rows.items()}
        for image_id in set(images.values()):
            if not self.image_exists(image_id):
                raise ReleaseError("rollback_image_missing")
        network_names = sorted({name for row in rows.values() for name in row["NetworkSettings"]["Networks"]})
        networks = json.loads(self.command(["docker", "network", "inspect", *network_names]))
        private_json(target / "runtime-inspect.json", {"containers": rows, "networks": networks})
        private_json(target / "compose.runtime.json", compose_from_runtime(rows, networks))
        private_json(target / "images.snapshot.json", {"services": {service: {"image": image, "pull_policy": "never"} for service, image in images.items()}})
        records = []
        for index, path in enumerate([*files, *env_paths]):
            destination = target / f"source-file-{index}"
            atomic_bytes(destination, path.read_bytes(), 0o600)
            file_stat = path.stat()
            records.append({"path": str(path), "copy": destination.name, "mode": stat.S_IMODE(file_stat.st_mode), "uid": file_stat.st_uid, "gid": file_stat.st_gid, "restore": path in env_paths})
        # Source is protected independently of the deploy user's mutable tree.
        with tarfile.open(target / "source.tar", "w") as archive:
            def include(info: tarfile.TarInfo) -> tarfile.TarInfo | None:
                parts = Path(info.name).parts
                if ".git" in parts or "node_modules" in parts or info.name.endswith("/artifacts/release-images/images.tar.gz"):
                    return None
                if not info.isfile() and not info.isdir():
                    raise ReleaseError("source_snapshot_entry_unsupported")
                return info
            archive.add(source, arcname="source", filter=include)
        os.chmod(target / "source.tar", 0o600)
        nginx = []
        for index, path in enumerate((layout.nginx_site, layout.nginx_enabled)):
            if path.is_symlink():
                nginx.append({"kind": "symlink", "target": os.readlink(path)})
            elif path.is_file():
                name = f"nginx-{index}.conf"
                atomic_bytes(target / name, path.read_bytes(), 0o600)
                nginx.append({"kind": "file", "copy": name, "mode": stat.S_IMODE(path.stat().st_mode)})
            else:
                raise ReleaseError("active_nginx_snapshot_missing")
        # An available-site symlink must also preserve its actual configuration.
        if layout.nginx_site.is_symlink():
            resolved = layout.nginx_site.resolve(strict=True)
            if Path("/etc/nginx") not in resolved.parents:
                raise ReleaseError("active_nginx_target_invalid")
            name = "nginx-site-target.conf"
            atomic_bytes(target / name, resolved.read_bytes(), 0o600)
            nginx[0]["resolved"] = str(resolved)
            nginx[0]["copy"] = name
            nginx[0]["mode"] = stat.S_IMODE(resolved.stat().st_mode)
        self.command(["docker", "image", "save", "--output", str(target / "images.tar"), *sorted(set(images.values()))], timeout=900)
        os.chmod(target / "images.tar", 0o600)
        return {"images": images, "source_root": str(source), "project_directory": str(working_directory), "env_files": [str(path) for path in env_paths], "files": records, "nginx": nginx, "revisions": revisions}

    @staticmethod
    def restore_source(layout: Layout, target: Path, snapshot: dict) -> None:
        """Restore the original source/env without trusting tar extraction paths."""
        source = Path(snapshot["source_root"])
        if source != layout.initial_source and not (source.parent == layout.releases and SHA.fullmatch(source.name)):
            raise ReleaseError("rollback_source_root_invalid")
        if source.resolve() != source:
            raise ReleaseError("rollback_source_path_not_canonical")
        with tarfile.open(target / "source.tar", "r") as archive:
            members = archive.getmembers()
            names = set()
            for member in members:
                path = PurePosixPath(member.name)
                if path.is_absolute() or ".." in path.parts or not path.parts or path.parts[0] != "source" or path.as_posix() in names or not (member.isfile() or member.isdir()):
                    raise ReleaseError("rollback_source_archive_invalid")
                names.add(path.as_posix())
            if not any(member.name == "source" and member.isdir() for member in members):
                raise ReleaseError("rollback_source_archive_invalid")
            # Validate the complete archive before touching its destination.
            for member in sorted(members, key=lambda item: (not item.isdir(), len(PurePosixPath(item.name).parts), item.name)):
                relative = PurePosixPath(member.name).relative_to("source")
                destination = source.joinpath(*relative.parts)
                if destination.resolve() != destination:
                    raise ReleaseError("rollback_source_symlink_forbidden")
                if member.isdir():
                    destination.mkdir(parents=True, exist_ok=True, mode=member.mode & 0o777)
                    if not destination.is_dir():
                        raise ReleaseError("rollback_source_directory_invalid")
                    os.chmod(destination, member.mode & 0o777)
                else:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    stream = archive.extractfile(member)
                    if stream is None:
                        raise ReleaseError("rollback_source_file_missing")
                    with stream:
                        atomic_bytes(destination, stream.read(), member.mode & 0o777)
                os.chown(destination, member.uid, member.gid)

    def restore(self, layout: Layout, target: Path, snapshot: dict) -> None:
        self.assert_single_authority(layout)
        # Docker-daemon children of compose run are outside the systemd cgroup.
        # A killed CLI must not leave a migration or exec-like one-off running.
        ids = self.command(["docker", "ps", "--all", "--quiet", "--filter", f"label=com.docker.compose.project={PROJECT}"]).split()
        if ids:
            for row in json.loads(self.command(["docker", "inspect", *ids])):
                labels = row.get("Config", {}).get("Labels", {})
                if labels.get("com.docker.compose.project") == PROJECT and labels.get("com.docker.compose.oneoff", "False").lower() == "true" and row.get("State", {}).get("Running"):
                    self.command(["docker", "stop", "--time", "30", row["Id"]], timeout=60)
        self.restore_source(layout, target, snapshot)
        if any(not self.image_exists(image) for image in snapshot["images"].values()):
            self.command(["docker", "image", "load", "--input", str(target / "images.tar")], timeout=900)
        if any(not self.image_exists(image) for image in snapshot["images"].values()):
            raise ReleaseError("rollback_immutable_image_missing")
        for record in snapshot["files"]:
            if record["restore"]:
                path = Path(record["path"])
                regular_file(path)
                atomic_bytes(path, (target / record["copy"]).read_bytes(), record["mode"])
                os.chown(path, record["uid"], record["gid"])
        networks = json.loads((target / "runtime-inspect.json").read_text())["networks"]
        for network in networks:
            try:
                self.command(["docker", "network", "inspect", network["Name"]])
                continue
            except ReleaseError:
                pass
            args = ["docker", "network", "create", "--driver", network["Driver"]]
            for option, value in network.get("Options", {}).items():
                args.extend(["--opt", f"{option}={value}"])
            for label, value in network.get("Labels", {}).items():
                args.extend(["--label", f"{label}={value}"])
            for item in network.get("IPAM", {}).get("Config", []):
                for key, option in (("Subnet", "--subnet"), ("Gateway", "--gateway"), ("IPRange", "--ip-range")):
                    if item.get(key):
                        args.extend([option, item[key]])
            if network.get("Internal"):
                args.append("--internal")
            if network.get("EnableIPv6"):
                args.append("--ipv6")
            args.append(network["Name"])
            self.command(args)
        compose = ["docker", "compose", "--project-name", PROJECT, "--project-directory", snapshot["project_directory"], "-f", str(target / "compose.runtime.json"), "-f", str(target / "images.snapshot.json")]
        for env_file in snapshot["env_files"]:
            compose.extend(["--env-file", env_file])
        # Named data volumes stay external; no downgrade, down -v, rm or prune.
        self.command([*compose, "up", "--no-build", "--pull", "never", "--no-deps", "--wait", "--wait-timeout", "180", "-d", "postgres"], timeout=240)
        self.command([*compose, "up", "--no-build", "--pull", "never", "--no-deps", "--force-recreate", "--wait", "--wait-timeout", "180", "-d", "api", "web", "admin"], timeout=240)
        for path, record in zip((layout.nginx_site, layout.nginx_enabled), snapshot["nginx"], strict=True):
            if record["kind"] == "file":
                atomic_bytes(path, (target / record["copy"]).read_bytes(), record["mode"])
            else:
                if record.get("resolved"):
                    atomic_bytes(Path(record["resolved"]), (target / record["copy"]).read_bytes(), record["mode"])
                temporary = path.with_name(f".{path.name}.release-{secrets.token_hex(8)}")
                os.symlink(record["target"], temporary)
                os.replace(temporary, path)
        self.command(["nginx", "-t"])
        self.command(["systemctl", "reload", "nginx"])
        self.verify_images({"images": {service: {"id": image} for service, image in snapshot["images"].items()}})

    def start_worker(self, layout: Layout, sha: str, transaction_id: str) -> None:
        self.command([
            "systemd-run", "--quiet", "--unit", f"kajovo-hotel-release-{transaction_id}",
            "--property=Type=exec", "--property=KillMode=control-group",
            "--property=TimeoutStopSec=30", "--property=SendSIGKILL=yes",
            "--property=StandardOutput=null", "--property=StandardError=null",
            "/usr/bin/python3", "-I", str(layout.controller), "worker", sha, transaction_id,
        ])

    def worker_state(self, transaction_id: str) -> str:
        # show succeeds for failed/not-found units and returns aggregate state.
        return self.command(["systemctl", "show", "--property=ActiveState", "--value", f"kajovo-hotel-release-{transaction_id}.service"]).strip()

    def stop_worker(self, transaction_id: str) -> None:
        state = self.worker_state(transaction_id)
        if state not in {"inactive", "failed", ""}:
            self.command(["systemctl", "stop", f"kajovo-hotel-release-{transaction_id}.service"], timeout=60)
            if self.worker_state(transaction_id) not in {"inactive", "failed", ""}:
                raise ReleaseError("worker_control_group_not_stopped")

    def deploy(self, layout: Layout, release: Path, state: dict) -> None:
        environment = self.clean_env()
        environment.update({
            "HOME": "/home/deploy-hotel", "SKIP_GIT_SYNC": "true", "EXPECTED_BRANCH": "main",
            "DEPLOY_SOURCE_SHA": state["sha"], "COMPOSE_PROJECT_NAME": PROJECT,
            "RESET_DB_ON_DEPLOY": "false", "ALLOW_DB_REINIT": "0", "ALLOW_GIT_CLEAN": "0",
            "HOTEL_RELEASE_SHA": state["sha"], "HOTEL_RELEASE_ID": state["transaction_id"],
            "HOTEL_RELEASE_STATE_FILE": str(layout.state), "HOTEL_RELEASE_RUNTIME_LOCK": str(layout.runtime_lock),
        })
        self.command(["runuser", "--user", "deploy-hotel", "--", "/bin/bash", str(release / "infra/ops/deploy-production.sh")], env=environment, timeout=DEADLINE_SECONDS, quiet=True)


class ReleaseController:
    def __init__(self, layout: Layout = Layout(), host: Host | None = None, clock=time.time, nonce=lambda: secrets.token_hex(16)):
        self.layout, self.host, self.clock, self.nonce = layout, host or Host(), clock, nonce
        for directory, mode in ((layout.private, 0o700), (layout.public, 0o755)):
            directory.mkdir(parents=True, exist_ok=True, mode=mode)
            info = directory.lstat()
            if directory.resolve() != directory or not stat.S_ISDIR(info.st_mode) or info.st_uid != layout.owner_uid or info.st_mode & 0o022:
                raise ReleaseError("controller_directory_untrusted")
            os.chmod(directory, mode)
        for path, mode in ((layout.private / "controller.lock", 0o600), (layout.runtime_lock, 0o644)):
            fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, mode)
            try:
                info = os.fstat(fd)
                if not stat.S_ISREG(info.st_mode) or info.st_uid != layout.owner_uid or info.st_nlink != 1:
                    raise ReleaseError("controller_lock_untrusted")
                os.fchmod(fd, mode)
            finally:
                os.close(fd)

    @contextlib.contextmanager
    def lock(self, runtime: bool = False):
        path = self.layout.runtime_lock if runtime else self.layout.private / "controller.lock"
        with path.open("rb") as stream:
            fcntl.flock(stream, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(stream, fcntl.LOCK_UN)

    def read(self) -> dict | None:
        if not self.layout.state.exists():
            return None
        regular_file(self.layout.state)
        info = self.layout.state.stat()
        if info.st_uid != self.layout.owner_uid or info.st_mode & 0o022 or info.st_nlink != 1:
            raise ReleaseError("transaction_state_untrusted")
        state = json.loads(self.layout.state.read_text())
        if not SHA.fullmatch(state.get("sha", "")) or not TOKEN.fullmatch(state.get("transaction_id", "")):
            raise ReleaseError("transaction_identity_invalid")
        return state

    def write(self, state: dict) -> None:
        private_json(self.layout.state, {key: state[key] for key in PUBLIC_KEYS}, 0o644)

    def exact_state(self, sha: str, transaction_id: str | None = None) -> dict:
        exact_sha(sha)
        state = self.read()
        if state is None or state["sha"] != sha or (transaction_id is not None and state["transaction_id"] != transaction_id):
            raise ReleaseError("transaction_identity_mismatch")
        return state

    def active(self, sha: str, transaction_id: str | None = None) -> dict:
        state = self.exact_state(sha, transaction_id)
        if state["phase"] != "active" or self.clock() >= state["deadline_epoch"]:
            raise ReleaseError("transaction_revoked_or_expired")
        return state

    def target(self, state: dict) -> Path:
        return self.layout.private / state["transaction_id"]

    def release(self, sha: str) -> Path:
        exact_sha(sha)
        release = self.layout.releases / sha
        if release.resolve() != release or not release.is_dir():
            raise ReleaseError("canonical_release_root_required")
        regular_file(release / "infra/ops/deploy-production.sh")
        regular_file(release / "infra/.env")
        return release

    def manifest(self, state: dict) -> dict:
        return json.loads((self.target(state) / "candidate-manifest.json").read_text())

    def verify_candidate(self, state: dict) -> dict:
        source = self.release(state["sha"])
        manifest = trusted_bundle(source / "artifacts/release-images", state["sha"])
        if manifest != self.manifest(state):
            raise ReleaseError("prepared_candidate_identity_changed")
        if candidate_fingerprint(source) != (self.target(state) / "candidate-source.sha256").read_text().strip():
            raise ReleaseError("prepared_candidate_source_changed")
        return manifest

    def verify_artifact(self, state: dict) -> None:
        artifact = self.release(state["sha"]) / "artifacts/deploy-runtime/latest.json"
        regular_file(artifact)
        payload = json.loads(artifact.read_text())
        manifest = self.manifest(state)
        if payload.get("sha") != state["sha"] or payload.get("images") != manifest["images"] or payload.get("image_archive_sha256") != manifest["archive_sha256"]:
            raise ReleaseError("worker_artifact_identity_mismatch")
        self.host.verify_images(manifest)

    def prepare(self, sha: str) -> dict:
        release = self.release(sha)
        manifest = trusted_bundle(release / "artifacts/release-images", sha)
        with self.lock():
            self.host.assert_single_authority(self.layout)
            previous = self.read()
            if previous and previous["phase"] in {"active", "rolling_back"}:
                if previous["sha"] == sha and previous["phase"] == "active":
                    self.active(sha)
                    self.verify_candidate(previous)
                    return previous
                raise ReleaseError("another_transaction_requires_completion")
            if previous and previous["sha"] == sha and previous["phase"] == "accepted":
                with self.lock(runtime=True):
                    self.verify_candidate(previous)
                    self.verify_artifact(previous)
                return previous
            transaction_id = self.nonce()
            if not TOKEN.fullmatch(transaction_id):
                raise ReleaseError("transaction_nonce_invalid")
            target = self.layout.private / transaction_id
            target.mkdir(mode=0o700)
            with self.lock(runtime=True):
                snapshot = self.host.snapshot(self.layout, target, release)
                private_json(target / "snapshot.json", snapshot)
                private_json(target / "candidate-manifest.json", manifest)
                atomic_bytes(target / "candidate-source.sha256", (candidate_fingerprint(release) + "\n").encode(), 0o600)
                state = {"sha": sha, "transaction_id": transaction_id, "phase": "active", "deadline_epoch": int(self.clock()) + DEADLINE_SECONDS, "worker": "PENDING", "rollback": "PENDING"}
                self.write(state)
            return state

    def activate(self, sha: str) -> dict:
        try:
            with self.lock():
                self.host.assert_single_authority(self.layout)
                state = self.exact_state(sha)
                if state["phase"] == "accepted":
                    with self.lock(runtime=True):
                        self.verify_candidate(state)
                        self.verify_artifact(state)
                    return state
                state = self.active(sha)
                self.verify_candidate(state)
                if state["worker"] in {"RUNNING", "PASS"}:
                    return state
                if state["worker"] != "PENDING":
                    raise ReleaseError("worker_cannot_be_reactivated")
                state["worker"] = "RUNNING"
                self.write(state)
                self.host.start_worker(self.layout, sha, state["transaction_id"])
                return state
        except ReleaseError:
            # A failed unit start must not leave an armed transaction orphaned.
            state = self.read()
            if state and state["sha"] == sha and state["phase"] == "active":
                self.rollback(sha)
            raise

    def worker(self, sha: str, transaction_id: str) -> dict:
        if not TOKEN.fullmatch(transaction_id):
            raise ReleaseError("transaction_nonce_invalid")
        try:
            with self.lock():
                state = self.active(sha, transaction_id)
                self.verify_candidate(state)
                if state["worker"] != "RUNNING" or (self.target(state) / "worker-started").exists():
                    raise ReleaseError("worker_already_started")
                atomic_bytes(self.target(state) / "worker-started", b"RUNNING\n", 0o600)
            self.host.deploy(self.layout, self.release(sha), state)
            with self.lock():
                state = self.active(sha, transaction_id)
                with self.lock(runtime=True):
                    self.verify_artifact(state)
                    self.active(sha, transaction_id)
                    state["worker"] = "PASS"
                    self.write(state)
            return state
        except Exception:
            with self.lock():
                current = self.read()
                if current and current["sha"] == sha and current["transaction_id"] == transaction_id and current["phase"] == "active":
                    current["worker"] = "FAIL"
                    # The independent deadline unit owns restoring and stopping
                    # this worker's entire cgroup, including forked processes.
                    current["phase"] = "rolling_back"
                    self.write(current)
            raise ReleaseError("managed_worker_failed") from None

    def accept(self, sha: str) -> dict:
        must_restore = False
        try:
            with self.lock():
                state = self.exact_state(sha)
                if state["phase"] == "accepted":
                    return state
                state = self.active(sha)
                if state["worker"] != "PASS":
                    raise ReleaseError("successful_managed_worker_required")
                with self.lock(runtime=True):
                    self.verify_candidate(state)
                    self.verify_artifact(state)
                    self.active(sha)
                    state["phase"] = "accepted"
                    state["rollback"] = "NOT_REQUIRED"
                    self.write(state)
                return state
        except Exception:
            with self.lock():
                state = self.read()
                must_restore = bool(state and state["sha"] == sha and state["phase"] != "accepted")
            if must_restore:
                self.rollback(sha)
            raise

    def rollback(self, sha: str) -> dict:
        with self.lock():
            state = self.exact_state(sha)
            if state["phase"] in {"accepted", "rolled_back"}:
                return state
            state["phase"] = "rolling_back"
            self.write(state)
            transaction_id = state["transaction_id"]
        # Never retain controller.lock while systemd waits for worker finalizers.
        self.host.stop_worker(transaction_id)
        with self.lock():
            state = self.exact_state(sha, transaction_id)
            if state["phase"] == "rolled_back":
                return state
            if state["phase"] != "rolling_back":
                raise ReleaseError("rollback_phase_invalid")
            try:
                with self.lock(runtime=True):
                    snapshot = json.loads((self.target(state) / "snapshot.json").read_text())
                    self.host.restore(self.layout, self.target(state), snapshot)
                state["phase"], state["rollback"] = "rolled_back", "PASS"
                if state["worker"] != "FAIL":
                    state["worker"] = "STOPPED"
                self.write(state)
            except Exception:
                state["rollback"] = "FAIL"
                self.write(state)
                raise ReleaseError("rollback_requires_retry") from None
        return state

    def deadline(self) -> dict | None:
        with self.lock():
            state = self.read()
            if not state or state["phase"] in {"accepted", "rolled_back"}:
                return state
            expired = self.clock() >= state["deadline_epoch"]
            failed = state["worker"] == "FAIL"
            if state["worker"] == "RUNNING":
                failed = failed or self.host.worker_state(state["transaction_id"]) not in {"active", "activating"}
            if state["phase"] != "rolling_back" and not expired and not failed:
                return state
            # Revocation precedes releasing this serialization lock. Acceptance
            # cannot win after the deadline has claimed the transaction.
            state["phase"] = "rolling_back"
            self.write(state)
            sha = state["sha"]
        return self.rollback(sha)

    def status(self, sha: str) -> dict:
        with self.lock():
            state = self.exact_state(sha)
            return {key: state[key] for key in PUBLIC_KEYS}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "activate", "status", "accept", "rollback", "worker", "deadline"])
    parser.add_argument("sha", nargs="?")
    parser.add_argument("transaction_id", nargs="?")
    args = parser.parse_args(argv)
    if os.geteuid() != 0:
        parser.error("root_required")
    if args.command in {"worker", "deadline"} and os.environ.get("SUDO_USER", "root") != "root":
        parser.error("root_worker_command_required")
    if args.command == "deadline":
        if args.sha or args.transaction_id:
            parser.error("deadline_takes_no_arguments")
    elif not args.sha or (args.command == "worker") != bool(args.transaction_id):
        parser.error("exact_command_arguments_required")
    try:
        controller = ReleaseController()
        if args.command == "deadline":
            result = controller.deadline()
        elif args.command == "worker":
            result = controller.worker(exact_sha(args.sha), args.transaction_id)
        else:
            result = getattr(controller, args.command)(exact_sha(args.sha))
        print(json.dumps(result if result is not None else {"phase": "idle"}, sort_keys=True))
        return 0
    except Exception as error:
        # Keep native errors and provider/environment content out of journald.
        code = str(error) if isinstance(error, ReleaseError) else "release_controller_failed"
        print(json.dumps({"error": code}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
