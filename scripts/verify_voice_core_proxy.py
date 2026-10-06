"""Check the actual host + frontend Nginx chain using isolated Docker runtimes."""
import http.client
import json
import re
import shutil
import socket
import ssl
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(*args):
    result = subprocess.run(args, check=False, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"Isolated {args[:3]} failed ({result.returncode}): {result.stderr[-2000:]}")
    return result.stdout.strip()


def check_frontend_config(name):
    run("docker", "exec", name, "nginx", "-t")
    effective = run("docker", "exec", name, "nginx", "-T")
    section = effective.split("# configuration file /etc/nginx/conf.d/default.conf:\n", 1)[1]
    section = section.split("# configuration file ", 1)[0]
    # Check directive scope rather than matching the health location's override.
    tokens = re.findall(r'''"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|\#[^\n]*|[{};]|[^\s{};]+''', section)
    stack, directive, server_logs = [], [], []
    for token in tokens:
        if token.startswith("#"):
            continue
        if token == "{":
            stack.append(directive[0])
            directive = []
        elif token == "}":
            stack.pop()
            directive = []
        elif token == ";":
            if directive and directive[0] == "access_log":
                assert directive == ["access_log", "off"], (name, stack, directive)
                if stack == ["server"]:
                    server_logs.append(directive)
            directive = []
        else:
            directive.append(token)
    assert len(server_logs) == 1, (name, "Missing server-scope access_log off")
    assert "error_log" in effective, (name, "Frontend error log missing")


def docker_logs(name):
    result = subprocess.run(["docker", "logs", name], check=True, capture_output=True, text=True)
    return result.stdout + result.stderr


def main():
    (ROOT / ".tmp").mkdir(exist_ok=True)
    prefix = "voice-proxy-" + uuid.uuid4().hex[:10]
    names = []
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        filter_port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix=prefix, dir=ROOT / ".tmp") as directory:
        temp = Path(directory)
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
            "-subj", "/CN=hotel.hcasc.cz", "-keyout", str(temp / "privkey.pem"),
            "-out", str(temp / "fullchain.pem")], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        config = (ROOT / "infra/reverse-proxy/production-host.conf").read_text()
        # Replace deployment addresses only; routing/header configuration is unchanged.
        config = config.replace("127.0.0.1:8202", "api:8000").replace("127.0.0.1:8083", "admin:80").replace("127.0.0.1:8080", "web:80")
        config = config.replace("/etc/letsencrypt/live/hotel.hcasc.cz-renewed", "/test-cert")
        # Isolated status fixture exercises the original maps without auth/MCP mutations.
        config += '''\nserver {
            listen 8089;
            access_log /var/log/hotelapp/filter_access.log hotel_safe if=$hotel_access_enabled;
            location / {
                if ($arg_failure) { return 503; }
                if ($arg_redirect) { return 302 /health; }
                return 204;
            }
        }\n'''
        (temp / "host.conf").write_text(config)
        run("docker", "network", "create", prefix)
        try:
            for service, image in [("api", "voice-core-api-check"), ("admin", "voice-core-admin-check"), ("web", "voice-core-web-check")]:
                name = prefix + "-" + service
                names.append(name)
                command = ["docker", "run", "-d", "--name", name, "--network", prefix, "--network-alias", service]
                if service == "api":
                    command += ["-e", "KAJOVO_API_DATABASE_URL=sqlite:////tmp/voice-proxy.db", "-e", "KAJOVO_API_ENVIRONMENT=development", "-e", "KAJOVO_API_BREAKFAST_SCHEDULER_ENABLED=false"]
                run(*command, image)
                if service != "api":
                    check_frontend_config(name)
            name = prefix + "-host"
            names.append(name)
            run("docker", "run", "-d", "--name", name, "--network", prefix,
                "-p", f"127.0.0.1:{port}:443", "-p", f"127.0.0.1:{filter_port}:8089",
                "-v", f"{temp}/host.conf:/etc/nginx/conf.d/default.conf:ro",
                "-v", f"{temp}:/test-cert:ro", "--entrypoint", "sh", "nginx:1.27.2-alpine3.20",
                "-c", "mkdir -p /var/log/hotelapp; exec nginx -g 'daemon off;'")
            run("docker", "exec", name, "nginx", "-t")
            effective = run("docker", "exec", name, "nginx", "-T")
            assert re.findall(r"error_log\s+/var/log/hotelapp/nginx_error.log\s+(\w+);", effective) == ["error", "error"]
            host = name
            def access_rows(filename="nginx_access.log"):
                content = run("docker", "exec", host, "cat", "/var/log/hotelapp/" + filename)
                return [json.loads(line) for line in content.splitlines()]
            # Only this generated one-day local certificate bypasses verification.
            context = ssl._create_unverified_context()
            def request(path, referer=None, fixture=False):
                if fixture:
                    conn = http.client.HTTPConnection("127.0.0.1", filter_port, timeout=3)
                else:
                    conn = http.client.HTTPSConnection("127.0.0.1", port, context=context, timeout=3)
                headers = {"Host": "hotel.hcasc.cz"}
                if referer:
                    headers["Referer"] = referer
                conn.request("GET", path, headers=headers)
                result = conn.getresponse()
                status, headers, body = result.status, result.getheaders(), result.read()
                conn.close()
                return status, headers, body
            for attempt in range(60):
                try:
                    if request("/backend-health")[0] == 200:
                        break
                except (OSError, http.client.HTTPException):
                    pass
                time.sleep(.5)
            else:
                raise AssertionError("Isolated API did not become healthy")
            for path, expected, microphone in [("/admin/hlasovy-chat", 200, "microphone=(self)"),
                ("/", 200, "microphone=()"), ("/api/v1/admin/voice-core/config", 401, "microphone=()")]:
                status, headers, _body = request(path)
                assert status == expected, (path, status)
                policies = [value for key, value in headers if key.lower() == "permissions-policy"]
                assert len(policies) == 1 and microphone in policies[0], (path, policies)
                header_names = {key.lower() for key, _ in headers}
                assert {"strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy"} <= header_names
                if path.startswith("/api/"):
                    assert {key.lower(): value for key, value in headers}["cache-control"] == "no-store"
            query_marker, ref_marker = "query-" + uuid.uuid4().hex, "ref-" + uuid.uuid4().hex
            referer = "https://example.invalid/" + ref_marker
            before = len(access_rows())
            marked_paths = []
            for page in ["/", "/admin/hlasovy-chat"]:
                path = page + "?probe=" + query_marker
                status, _, body = request(path, referer)
                assert status == 200, (page, status)
                marked_paths.append(path)
                asset = re.search(rb'src="([^"]+\.js)"', body)
                assert asset, (page, "Built JavaScript asset missing")
                path = asset[1].decode() + "?probe=" + query_marker
                status, _, body = request(path, referer)
                assert status == 200 and body and not body.startswith(b"<!doctype"), (path, status)
                marked_paths.append(path)
            time.sleep(.1)
            rows = access_rows()
            assert len(rows) - before == len(marked_paths), "Expected one host access row per marked request"
            expected_fields = {"component", "request_id", "method", "route", "status", "bytes", "seconds"}
            assert all(set(row) == expected_fields for row in rows)
            raw = json.dumps(rows)
            assert query_marker not in raw and ref_marker not in raw and "?" not in raw
            for service in ["admin", "web"]:
                logs = docker_logs(prefix + "-" + service)
                assert not re.search(r'"(?:GET|POST|HEAD) .+ HTTP/\d', logs), (service, "Frontend access row found")
                assert query_marker not in logs and ref_marker not in logs
            before = len(rows)
            for path in ["/health", "/healthz", "/backend-health", "/ready"]:
                assert request(path + "?probe=" + query_marker, referer)[0] == 200, path
            time.sleep(.1)
            assert len(access_rows()) == before, "Successful healthcheck added access row"

            excluded = ["/health", "/healthz", "/ready", "/backend-health", "/api/health", "/api/ready",
                "/api/auth/session", "/api/auth/activity", "/api/v1/admin/voice-core/sessions/fixture-call"]
            excluded += ["/api/v1/admin/voice-core/sessions/fixture-call/" + suffix
                for suffix in ["heartbeat", "playback-ready", "registry-plan"]]
            for path in excluded:
                assert request(path, fixture=True)[0] == 204
                assert request(path + "?redirect=1", fixture=True)[0] == 302
            time.sleep(.1)
            assert access_rows("filter_access.log") == [], "Successful technical request logged"
            for path in excluded:
                assert request(path + "?failure=1", fixture=True)[0] == 503
            assert request("/api/v1/housekeeping/rooms", fixture=True)[0] == 204
            time.sleep(.1)
            filter_rows = access_rows("filter_access.log")
            assert len(filter_rows) == len(excluded) + 1
            assert all(row["status"] == 503 for row in filter_rows[:-1])
            assert filter_rows[-1]["status"] == 204

            # Stop only the disposable API; prove standard errors are not sanitized.
            run("docker", "stop", prefix + "-api")
            run("docker", "rm", prefix + "-api")
            # Keep an isolated endpoint reachable with no listener. An absent network
            # endpoint can blackhole SYNs and test a timeout instead of refusal.
            unavailable = prefix + "-unavailable-api"
            names.append(unavailable)
            run("docker", "run", "-d", "--name", unavailable, "--network", prefix,
                "--network-alias", "api", "--entrypoint", "sleep", "voice-core-api-check", "300")
            run("docker", "exec", host, "nginx", "-t")
            run("docker", "exec", host, "nginx", "-s", "reload")
            time.sleep(.5)
            failed_path = "/api/health?probe=" + query_marker
            assert request(failed_path, referer)[0] == 502
            time.sleep(.1)
            errors = run("docker", "exec", host, "cat", "/var/log/hotelapp/nginx_error.log")
            matching = [line for line in errors.splitlines() if query_marker in line]
            assert any("[error]" in line and "connect() failed" in line and "upstream" in line
                and failed_path in line and referer in line for line in matching), "Missing ordinary upstream error with synthetic request context"
            rows = access_rows()
            assert rows[-1]["status"] == 502
            assert query_marker not in json.dumps(rows) and ref_marker not in json.dumps(rows)
            print(json.dumps({"result": "PASS", "frontend_access_rows": 0,
                "marked_public_requests": len(marked_paths), "host_marker_access_rows": len(marked_paths),
                "health_access_rows": 0, "excluded_success_cases": len(excluded),
                "excluded_success_statuses": [204, 302],
                "retained_failure_cases": len(excluded), "upstream_status": 502,
                "standard_error_contains_synthetic_uri_query_referer": True,
                "routing_and_security_headers": "PASS"}))
            print("Synthetic upstream error evidence: " + matching[-1])
        finally:
            for name in reversed(names):
                subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            subprocess.run(["docker", "network", "rm", prefix], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


if __name__ == "__main__":
    if not shutil.which("docker"):
        raise SystemExit("Docker is required to verify the production proxy chain")
    main()
