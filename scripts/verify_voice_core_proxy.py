"""Check the actual host + frontend Nginx chain using isolated Docker runtimes."""
import http.client
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
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


def main():
    (ROOT / ".tmp").mkdir(exist_ok=True)
    prefix = "voice-proxy-" + uuid.uuid4().hex[:10]
    names = []
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix=prefix, dir=ROOT / ".tmp") as directory:
        temp = Path(directory)
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
            "-subj", "/CN=hotel.hcasc.cz", "-keyout", str(temp / "privkey.pem"),
            "-out", str(temp / "fullchain.pem")], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        config = (ROOT / "infra/reverse-proxy/production-host.conf").read_text()
        # Replace deployment addresses only; routing/header configuration is unchanged.
        config = config.replace("127.0.0.1:8202", "api:8000").replace("127.0.0.1:8083", "admin:80").replace("127.0.0.1:8080", "web:80")
        config = config.replace("/etc/letsencrypt/live/hotel.hcasc.cz-renewed", "/test-cert")
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
            name = prefix + "-host"
            names.append(name)
            run("docker", "run", "-d", "--name", name, "--network", prefix,
                "-p", f"127.0.0.1:{port}:443", "-v", f"{temp}/host.conf:/etc/nginx/conf.d/default.conf:ro",
                "-v", f"{temp}:/test-cert:ro", "--entrypoint", "sh", "nginx:1.27.2-alpine3.20",
                "-c", "mkdir -p /var/log/hotelapp; exec nginx -g 'daemon off;'")
            run("docker", "exec", name, "nginx", "-t")
            # Only this generated one-day local certificate bypasses verification.
            context = ssl._create_unverified_context()
            def request(path):
                conn = http.client.HTTPSConnection("127.0.0.1", port, context=context, timeout=3)
                conn.request("GET", path, headers={"Host": "hotel.hcasc.cz"})
                result = conn.getresponse()
                status, headers, body = result.status, result.getheaders(), result.read()
                conn.close()
                return status, headers, body
            for attempt in range(60):
                try:
                    if request("/backend-health")[0] == 200: break
                except (OSError, http.client.HTTPException): pass
                time.sleep(.5)
            else: raise AssertionError("Isolated API did not become healthy")
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
            print("Voice Core host + admin + API Nginx headers PASS")
        finally:
            for name in reversed(names):
                subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            subprocess.run(["docker", "network", "rm", prefix], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


if __name__ == "__main__":
    if not shutil.which("docker"):
        raise SystemExit("Docker is required to verify the production proxy chain")
    main()
