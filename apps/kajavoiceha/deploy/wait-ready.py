#!/usr/bin/env python3
"""Privileged startup probe; application clients must always use the public HTTPS endpoint."""
import argparse
import http.client
import json
import pathlib
import socket
import time


class UnixHTTPConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect("/run/kajavoiceha/mcp.sock")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--credential", default="/root/kajavoiceha-handoff/pripojeni-voice-chat-01.env")
    parser.add_argument("--timeout", type=float, default=20)
    args = parser.parse_args()
    values = dict(line.split("=", 1) for line in pathlib.Path(args.credential).read_text(encoding="utf-8").splitlines() if "=" in line and not line.startswith("#"))
    token = values.get("KAJAVOICEHA_MCP_TOKEN")
    if not token:
        raise SystemExit("Readiness credential missing")
    deadline = time.monotonic() + args.timeout
    while time.monotonic() < deadline:
        connection = UnixHTTPConnection("apimcpkajavoiceha.hcasc.cz", timeout=2)
        try:
            connection.request("GET", "/healthz", headers={"Authorization": "Bearer " + token, "Host": "apimcpkajavoiceha.hcasc.cz", "X-Forwarded-Proto": "https"})
            response = connection.getresponse()
            payload = response.read(65536)
            if response.status == 200:
                json.loads(payload)
                print("Authenticated startup readiness: OK. Public HTTPS acceptance remains required.")
                return
        except Exception:
            pass
        finally:
            connection.close()
        time.sleep(0.25)
    raise SystemExit("Authenticated startup readiness failed; no credentials were logged")


if __name__ == "__main__":
    main()
