"""Installed-product probe: own store, configured HTTPS mock endpoints, scoped cancel/recovery."""
import asyncio
import base64
import json
from pathlib import Path
import tempfile
import time

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from dagmar_server.migrations import upgrade
from dagmar_server.ports import RuntimePorts, bind
from dagmar_server.settings import DagmarSettings
from dagmar_server.smart import SmartError
from dagmar_server import smartplan
from dagmar_server.smartplan_storage import SmartPlanLink, SmartPlanSecretStore


class PublicFixture:
    def __init__(self):
        self.contract = json.loads(Path(smartplan.__file__).with_name("smartplan_candidate_contract.json").read_text())
        self.started = asyncio.Event()
        self.block = asyncio.Event()
        self.cancelled = False
        self.slow_id = None
        self.commits = {}
        self.lose_ack = True
        self.paths = []

    async def __call__(self, request):
        assert str(request.url).startswith("https://plans.portable.example/")
        assert request.headers["authorization"] == "Bearer isolated-fixture-credential"
        self.paths.append((request.method, request.url.path))
        if request.method == "GET" and request.url.path == "/contract":
            return httpx.Response(200, json=self.contract)
        assert request.method == "POST" and request.url.path == "/mcp"
        body = json.loads(request.content)
        if "id" not in body:
            if body.get("method") == "notifications/cancelled":
                assert body["params"]["requestId"] == self.slow_id
                self.cancelled = True
                self.block.set()
            return httpx.Response(202)
        method = body["method"]
        if method == "initialize":
            value = {"protocolVersion": "2025-03-26", "capabilities": {"tools": {}},
                     "serverInfo": {"name": "SmartPlan", "version": "1.6.8"},
                     "instructions": self.contract["instructions"]}
        elif method == "tools/list":
            value = {"tools": self.contract["tools"]}
        else:
            name, arguments = body["params"]["name"], body["params"]["arguments"]
            if name == "smartplan_context":
                if arguments.get("diagnostics"):
                    self.slow_id = body["id"]
                    self.started.set()
                    try:
                        await self.block.wait()
                    except asyncio.CancelledError:
                        self.cancelled = True
                        raise
                output = {"contract_version": "navigation/1", "scopes": ["smartplan.read"],
                          "readiness": {"upstream_ready": False, "executor_fenced": True,
                                        "checked_at": "2026-10-13T12:00:00Z", "expires_at": "2026-10-13T12:00:00Z"},
                          "selection_ttl_seconds": 120}
            else:
                assert name == "smartplan_commit"
                proposal = arguments["proposal_id"]
                self.commits.setdefault(proposal, 1)
                if self.lose_ack:
                    self.lose_ack = False
                    raise httpx.ReadTimeout("isolated lost acknowledgement")
                output = {"error": {"code": "stored_commit_receipt", "proposal_id": proposal,
                                     "correlation_id": "fixture-original", "phase": "commit", "origin": "fixture",
                                     "effect_state": "applied", "next_action": "inspect_original_proposal"}}
            value = {"structuredContent": output, "content": [{"type": "text", "text": json.dumps(output)}],
                     "isError": "error" in output}
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": body["id"], "result": value})


async def verify():
    with tempfile.TemporaryDirectory(prefix="dagmar-own-mcp-store-") as directory:
        engine = create_engine("sqlite:///" + str(Path(directory) / "dagmar.sqlite"))
        upgrade(engine)
        fixture = PublicFixture()
        settings = DagmarSettings(
            voice_master_key=base64.b64encode(b"k" * 32).decode(),
            ha_mcp_url="https://devices.portable.example/mcp",
            ha_trusted_origins=("https://devices.portable.example",),
            smartplan_base_url="https://plans.portable.example",
            smartplan_trusted_origins=("https://plans.portable.example",))
        ports = RuntimePorts(sessionmaker(engine), settings,
                             lambda owner: {"voice_authorized": True, "namespace": "portable-owner"},
                             smartplan_transport=httpx.MockTransport(fixture))
        with bind(ports):
            SmartPlanSecretStore().save("isolated-fixture-credential")
            with ports.session_factory() as db:
                db.add(SmartPlanLink(subject="portable-owner", link_id="isolated-owner-link"))
                db.commit()
            client = smartplan.SmartPlanClient("portable-owner")
            try:
                await client.initialize()
                assert client.projection["metadata_digest"] == client.contract.metadata_digest
                slow = asyncio.create_task(client.call("smartplan_context", {"diagnostics": True}))
                await asyncio.wait_for(fixture.started.wait(), 2)
                started = time.monotonic()
                slow.cancel()
                await asyncio.gather(slow, return_exceptions=True)
                value = await asyncio.wait_for(client.call("smartplan_context", {}), 2)
                assert value["contract_version"] == "navigation/1"
                assert fixture.cancelled and time.monotonic() - started < 2
                try:
                    await client.call("smartplan_commit", {"proposal_id": "original-proposal"})
                except SmartError:
                    pass
                else:
                    raise AssertionError("lost acknowledgement was hidden")
            finally:
                await client.close()
            recovered = smartplan.SmartPlanClient("portable-owner")
            try:
                value = await recovered.call("smartplan_commit", {"proposal_id": "original-proposal"})
                assert value["error"]["code"] == "stored_commit_receipt"
                assert fixture.commits == {"original-proposal": 1}
            finally:
                await recovered.close()
        engine.dispose()
    print("Installed Dagmar own-store alternate HTTPS metadata/read/scoped-cancel/original-proposal recovery PASS")


if __name__ == "__main__":
    asyncio.run(verify())
