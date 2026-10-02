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
    from app.services.smart_technologies import Catalog, decode_result, mcp_connection

    # SDK errors can contain transport context; this runner reports categories only.
    logging.disable(logging.CRITICAL)
    token = os.environ.get("KAJAVOICEHA_MCP_TOKEN", "")
    async with mcp_connection(token) as client:
        value, _ = decode_result(
            await client.call_tool("smart_technologie", {"operation": "catalog"})
        )
        current = Catalog(value)
        selected = [
            (index + 1, row)
            for index, row in enumerate(value["devices"])
            if row[0] == "0P0BSvetlo"
        ]
        if len(selected) != 1:
            print("BLOCKED: approved light is not uniquely available")
            return 2
        row_id, device = selected[0]
        fields = value["fields"]
        state_function = next(
            item[0]
            for item in device[4]
            if fields[4]["reading_names"][item[2]] == "Stav"
        )
        original = dict(device[5])[state_function]
        if original not in {"vypnuto", "zapnuto"}:
            print("BLOCKED: original light state is not known")
            return 2
        actions = {
            fields[3]["action_names"][item[2]]: item[0] for item in device[3] if item[4]
        }
        restore_function = actions["Vypnout" if original == "vypnuto" else "Zapnout"]
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
            after, _ = decode_result(
                await client.call_tool(
                    "smart_technologie",
                    {
                        "operation": "read",
                        "catalog_revision": current.revision,
                        "rows": [row_id],
                    },
                )
            )
            if dict(after["devices"][row_id - 1][5])[state_function] == original:
                print("FAIL: no observed change of the approved light")
                status = 1
        finally:
            latest, _ = decode_result(
                await client.call_tool("smart_technologie", {"operation": "catalog"})
            )
            matching = [
                index + 1
                for index, row in enumerate(latest["devices"])
                if row[0] == "0P0BSvetlo"
            ]
            if matching != [row_id]:
                raise RuntimeError("approved_light_reference_changed")
            rid = "acceptance-restore-" + uuid.uuid4().hex
            try:
                await client.call_tool(
                    "smart_technologie",
                    {
                        "operation": "control",
                        "catalog_revision": latest["catalog_revision"],
                        "request_id": rid,
                        "controls": [
                            {
                                "row": row_id,
                                "function": restore_function,
                                "parameters": {},
                            }
                        ],
                    },
                )
            except Exception:  # noqa: BLE001 - sanitize transport errors and preserve the restore guard
                # Never repeat a change with a new identity after an uncertain transport.
                await client.call_tool(
                    "smart_technologie",
                    {"operation": "operation_status", "request_id": rid},
                )
            restored, _ = decode_result(
                await client.call_tool(
                    "smart_technologie",
                    {
                        "operation": "read",
                        "catalog_revision": latest["catalog_revision"],
                        "rows": [row_id],
                    },
                )
            )
            if dict(restored["devices"][row_id - 1][5])[state_function] != original:
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
