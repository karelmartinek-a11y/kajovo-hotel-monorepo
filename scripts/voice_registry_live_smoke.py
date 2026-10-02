"""Opt-in actual audio acceptance; bounded operator cleanup of unique test rooms only."""
import asyncio
import hashlib
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/kajovo-hotel-api"))
from app.services.smart_technologies import mcp_connection, decode_result  # noqa: E402
from app.services.voice_registry import normalize  # noqa: E402


def save(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as file:
        json.dump(value, file)
    os.chmod(path, 0o600)


def fingerprint(rooms):
    return hashlib.sha256(json.dumps(sorted((r["room_ref"], r["name"]) for r in rooms), ensure_ascii=False).encode()).hexdigest()


def is_test_room(room, record, allowed):
    # Speech can spell case/punctuation differently; every word must still match exactly.
    if room["room_ref"] in record["baseline_refs"]:
        return False
    if record.get("created_refs"):
        return room["room_ref"] in record["created_refs"]
    return normalize(room["name"]) in {normalize(name) for name in allowed}


def load_cleanup_record(path, baseline):
    record = json.loads(path.read_text())
    if any(record.get(key) != baseline.get(key) for key in ("session_id", "baseline_digest", "baseline_refs")):
        raise RuntimeError("protected cleanup baseline changed; no cleanup write allowed")
    return record


async def inspect_or_cleanup(token, manifest, record, state_path, cleanup=False):
    async with mcp_connection(token) as client:
        async def call(arguments):
            value, _ = decode_result(await client.call_tool("smart_technologie", {**arguments, "api_version": 2, "session_id": record["session_id"]}))
            if value.get("error"):
                raise RuntimeError("MCP acceptance operation rejected")
            return value
        async def rooms():
            result, offset = [], 0
            while True:
                page = await call({"operation": "rooms_list", "limit": 200, "offset": offset})
                result.extend(page["rooms"])
                if not page.get("has_more"):
                    return result, page["catalog_revision"]
                offset += 200
                if offset > 2000:
                    raise RuntimeError("room inventory exceeded acceptance bound")
        current, revision = await rooms()
        allowed = set(manifest["allowed_names"])
        if not cleanup:
            if any(normalize(r["name"]) in {normalize(name) for name in allowed} for r in current):
                raise RuntimeError("temporary test names already exist")
            record["baseline_digest"] = fingerprint(current)
            record["baseline_refs"] = [r["room_ref"] for r in current]
            save(state_path, record)
            return
        if record.get("pending_request_id"):
            status = await call({"operation": "operation_status", "request_id": record["pending_request_id"]})
            states = {r.get("status") for r in status.get("results", [])}
            states.add((status.get("operation") or {}).get("status"))
            if states & {"uncertain", "queued", "recording", "not_found"}:
                raise RuntimeError("cleanup outcome unresolved; original request retained, no write replay")
            current, revision = await rooms()
        targets = [r for r in current if is_test_room(r, record, allowed)]
        if targets:
            plan_result = await call({"operation": "registry_prepare", "catalog_revision": revision,
                "changes": [{"action": "delete_room", "room_refs": [r["room_ref"] for r in targets]}]})
            plan = plan_result.get("plan")
            if not plan or len(plan["changes"]) != len(targets) or {c.get("room_ref") for c in plan["changes"]} != {r["room_ref"] for r in targets} or any(c.get("status") != "planned" or c.get("action") != "delete_room" for c in plan["changes"]):
                raise RuntimeError("operator cleanup proposal did not match test scope")
            rid = "voice-registry-cleanup-" + hashlib.sha256((record["session_id"] + plan["id"]).encode()).hexdigest()[:48]
            record["pending_request_id"] = rid
            save(state_path, record)
            # Trusted operator cleanup is separately authorized by the requested temporary-room acceptance.
            # It is not evidence of the application's audio confirmation flow.
            await call({"operation": "registry_apply", "plan_id": plan["id"], "request_id": rid,
                "confirmed": True, "confirmation_id": "operator-" + hashlib.sha256((rid + plan["id"]).encode()).hexdigest()})
            current, _ = await rooms()
        if fingerprint(current) != record["baseline_digest"]:
            raise RuntimeError("room baseline differs; keep cleanup record for owner review")
        save(state_path.parent / "cleanup-evidence.json", {
            "original_room_baseline_unchanged": True,
            "original_room_count": len(record["baseline_refs"]),
            "registered_test_room_count": len(record.get("created_refs", [])),
            "operator_cleanup_used": bool(targets or record.get("pending_request_id")),
            "test_rooms_remaining": 0,
        })
        state_path.unlink()
        print("Registry test-room cleanup and unchanged original room baseline PASS")


def main():
    if os.getenv("VOICE_CORE_LIVE_SMOKE") != "1":
        print("SKIP: explicit VOICE_CORE_LIVE_SMOKE=1 required")
        return 0
    if os.getenv("CI") == "true" or os.getenv("GITHUB_ACTIONS") == "true":
        print("BLOCKED: paid acceptance is forbidden in ordinary CI")
        return 2
    directory = Path(os.environ["VOICE_REGISTRY_AUDIO_DIR"])
    manifest = json.loads((directory / "manifest.json").read_text())
    if not 2 <= len(manifest["allowed_names"]) <= 8 or len(set(manifest["allowed_names"])) != len(manifest["allowed_names"]):
        raise RuntimeError("invalid temporary-room manifest")
    token = os.environ["KAJAVOICEHA_MCP_TOKEN"]
    state_path = directory / "cleanup.json"
    if os.getenv("VOICE_REGISTRY_CLEANUP_ONLY") == "1":
        record = json.loads(state_path.read_text())
        asyncio.run(inspect_or_cleanup(token, manifest, record, state_path, cleanup=True))
        return 0
    if state_path.exists():
        raise RuntimeError("unfinished prior acceptance; run cleanup-only first")
    record = {"session_id": "registry-acceptance-" + uuid.uuid4().hex}
    asyncio.run(inspect_or_cleanup(token, manifest, record, state_path))
    try:
        return subprocess.run(["pnpm", "--filter", "@kajovo/kajovo-hotel-admin", "exec", "playwright", "test", "-c", "playwright.voice-registry-live.config.ts"], cwd=ROOT, check=False).returncode
    finally:
        asyncio.run(inspect_or_cleanup(token, manifest, load_cleanup_record(state_path, record), state_path, cleanup=True))


if __name__ == "__main__":
    sys.exit(main())
