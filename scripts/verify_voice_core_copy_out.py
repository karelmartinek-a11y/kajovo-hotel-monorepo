"""Build both packages in a temporary host with no application source tree."""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    with tempfile.TemporaryDirectory(prefix="voice-core-copy-out-") as directory:
        target = Path(directory)
        for name in ["voice-core", "voice-core-server"]:
            shutil.copytree(ROOT / "packages" / name, target / name,
                ignore=shutil.ignore_patterns("node_modules", "dist", "__pycache__", ".pytest_cache", "test-results", "*.egg-info"))
        subprocess.run([sys.executable, "-m", "pip", "wheel", "--no-deps", "--wheel-dir", str(target / "wheels"), str(target / "voice-core-server")], check=True)
        environment = dict(os.environ, PYTHONPATH=str(target / "voice-core-server/src"))
        subprocess.run([sys.executable, "-m", "pytest", str(target / "voice-core-server/tests"), "-q"], env=environment, cwd=target, check=True)
        subprocess.run([sys.executable, str(target / "voice-core-server/harness/verify_host.py")], env=environment, cwd=target, check=True)
        subprocess.run(["pnpm", "install", "--ignore-workspace", "--frozen-lockfile=false"], cwd=target / "voice-core", check=True)
        subprocess.run(["pnpm", "test"], cwd=target / "voice-core", check=True)
        print("Isolated Voice Core copy-out build and tests PASS")


if __name__ == "__main__":
    main()
