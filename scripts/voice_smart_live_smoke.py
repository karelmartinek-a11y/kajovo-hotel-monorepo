"""Explicit paid browser acceptance with SDK readback and a light restore guard."""

import asyncio
import logging
import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


async def guarded_browser() -> int:
    sys.path.insert(0, str(ROOT / "apps/kajovo-hotel-api"))
    from app.services.smart_technologies import decode_result, mcp_connection, validate_public

    # SDK errors can contain transport context; this runner reports categories only.
    logging.disable(logging.CRITICAL)
    token = os.environ.get("KAJAVOICEHA_MCP_TOKEN", "")
    async with mcp_connection(token) as client:
        session = "acceptance-" + uuid.uuid4().hex
        async def call(args):
            value, images = decode_result(await client.call_tool("smart_technologie", {**args, "api_version": 2, "session_id": session}))
            validate_public(value)
            if value.get("error"):
                raise RuntimeError("mcp_operation_rejected")
            return value, images
        search, _ = await call({"operation": "search", "query": "0P0BSvetlo", "limit": 200})
        selected = [row for row in search.get("matches", []) if row["name"] == "0P0BSvetlo"]
        if len(selected) != 1 or search.get("total") != 1:
            print("BLOCKED: approved light is not uniquely available")
            return 2
        row_id = selected[0]["row"]
        details, _ = await call({"operation": "describe", "catalog_revision": search["catalog_revision"], "rows": [row_id]})
        value, _ = await call({"operation": "read", "catalog_revision": search["catalog_revision"], "rows": [row_id]})
        device = value["devices"][value["rows"].index(row_id)]
        fields = value["fields"]
        state_function = next(item[0] for item in device[4] if fields[4]["reading_names"][item[2]] == "Stav")
        original = dict(device[5])[state_function]
        if original not in {"vypnuto", "zapnuto"}:
            print("BLOCKED: original light state is not known")
            return 2
        restore_action = "vypnout" if original == "vypnuto" else "zapnout"
        status = 2
        try:
            process = await asyncio.create_subprocess_exec(
                "pnpm",
                "--filter",
                "@kajovo/kajovo-hotel-admin",
                "exec",
                "playwright",
                "test",
                "-c",
                "playwright.voice-smart-live.config.ts",
                cwd=ROOT,
            )
            status = await process.wait()
        finally:
            # Separate, explicit acceptance read verifies the restore guard; the voice adapter never reads after control.
            rid = "acceptance-restore-" + uuid.uuid4().hex
            payload = {"operation": "control", "catalog_revision": details["catalog_revision"], "rows": [row_id], "action": restore_action, "request_id": rid}
            try:
                restored, _ = await call(payload)
            except Exception:
                restored, _ = await call({"operation": "operation_status", "request_id": rid})
            if not (restored.get("summary", {}).get("accepted") or any(r.get("status") == "accepted" for r in restored.get("results", []))):
                raise RuntimeError("approved_light_restore_send_unconfirmed")
            observed, _ = await call({"operation": "read", "catalog_revision": details["catalog_revision"], "rows": [row_id]})
            device = observed["devices"][observed["rows"].index(row_id)]
            if dict(device[5])[state_function] != original:
                raise RuntimeError("approved_light_restore_unconfirmed")
            print("PASS: approved light restored to its original observed state")
        return status


def main() -> int:
    if os.getenv("VOICE_CORE_LIVE_SMOKE") != "1":
        print(
            "SKIP: paid Smart technologie acceptance requires VOICE_CORE_LIVE_SMOKE=1"
        )
        return 0
    if os.getenv("CI") == "true" or os.getenv("GITHUB_ACTIONS") == "true":
        print("BLOCKED: paid acceptance is not permitted in CI")
        return 2
    fixture = os.getenv("VOICE_CORE_AUDIO_FIXTURE")
    if not fixture or not Path(fixture).is_file():
        print("BLOCKED: provide an authorized synthetic speech WAV fixture")
        return 2
    try:
        return asyncio.run(guarded_browser())
    except Exception:  # noqa: BLE001 - sanitize transport errors and preserve the restore guard
        print(
            "BLOCKED: acceptance or restore guard failed; inspect the approved light before retry"
        )
        return 2


if __name__ == "__main__":
    sys.exit(main())
