#!/usr/bin/env python3
"""Create a private programmer handoff and persist only the token hash for the service."""
import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import secrets
import tempfile


def private_write(path: pathlib.Path, content: str) -> None:
    fd, temporary = tempfile.mkstemp(prefix=".kajavoiceha-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", default="voice-main")
    parser.add_argument("--handoff-name", default="pripojeni-voice-chat-01.env")
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error("Run as root on the production server")
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", args.client_id):
        parser.error("Invalid client ID")
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}\.env", args.handoff_name):
        parser.error("Invalid handoff filename")
    directory = pathlib.Path("/root/kajavoiceha-handoff")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    handoff = directory / args.handoff_name
    if handoff.exists():
        parser.error("Handoff exists; refusing to replace an existing token")
    registry = pathlib.Path("/etc/kajavoiceha/clients.json")
    data = json.loads(registry.read_text(encoding="utf-8")) if registry.exists() else {"clients": []}
    if not isinstance(data, dict) or not isinstance(data.get("clients"), list):
        parser.error("Invalid clients registry")
    if any(client.get("id") == args.client_id for client in data["clients"]):
        parser.error("Client exists; choose another client ID for a new credential")
    token = "kvha_" + secrets.token_urlsafe(32)
    expires = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=365)).isoformat(timespec="seconds").replace("+00:00", "Z")
    data["clients"].append({"id": args.client_id, "sha256": hashlib.sha256(token.encode()).hexdigest(), "expires_at": expires, "revoked": False})
    private_write(handoff, "\n".join([
        "# Private credential. Keep outside source control and browser/frontend code.",
        "KAJAVOICEHA_MCP_URL=https://apimcpkajavoiceha.hcasc.cz/mcp",
        f"KAJAVOICEHA_CLIENT_ID={args.client_id}",
        f"KAJAVOICEHA_MCP_TOKEN={token}",
        f"KAJAVOICEHA_TOKEN_EXPIRES_AT={expires}",
        "",
    ]))
    try:
        private_write(registry, json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    except BaseException:
        handoff.unlink(missing_ok=True)
        raise
    print(f"Private credential written to {handoff}; service registry contains only its hash.")
    print("Restart only kajavoiceha.service to load the updated credential registry.")


if __name__ == "__main__":
    main()
