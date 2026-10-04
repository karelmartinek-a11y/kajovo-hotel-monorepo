"""Copy out the whole Dagmar product, install independently, and run its own host."""
import ast
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def run(args, target, env=None):
    subprocess.run(args, cwd=target, env=env, check=True)


def main():
    for name in ("dagmar-browser", "dagmar-server"):
        for path in (ROOT / "packages" / name / "src").rglob("*"):
            if path.suffix == ".py":
                for node in ast.walk(ast.parse(path.read_text())):
                    imports = [alias.name for alias in node.names] if isinstance(node, ast.Import) else [node.module or ""] if isinstance(node, ast.ImportFrom) and not node.level else []
                    assert all(not value.startswith(("app.", "apps.", "kajovo")) for value in imports), path
            elif path.suffix in {".ts", ".tsx"}:
                assert not re.search(r"@kajovo/|(?:from|import)\s*['\"].*apps/", path.read_text()), path
    with tempfile.TemporaryDirectory(prefix="dagmar-diagnostics-copy-out-") as directory:
        target = Path(directory)
        for name in ("voice-core", "voice-core-server", "dagmar-browser", "dagmar-server"):
            shutil.copytree(ROOT / "packages" / name, target / "packages" / name, ignore=shutil.ignore_patterns("node_modules", "dist", "__pycache__", ".pytest_cache", "*.egg-info", "test-results"))
        shutil.copytree(ROOT / "examples/dagmar-host", target / "examples/dagmar-host", ignore=shutil.ignore_patterns("node_modules", "dist", "__pycache__", "data"))
        (target / "package.json").write_text(json.dumps({"private":True,"packageManager":"pnpm@10.34.4"}))
        (target / "pnpm-workspace.yaml").write_text("packages:\n  - packages/*\n  - examples/dagmar-host\n")
        run([sys.executable,"-m","venv",str(target/"venv")],target)
        python = str(target/"venv/bin/python")
        run([python,"-m","pip","install",str(target/"packages/voice-core-server"),str(target/"packages/dagmar-server"),"pytest","uvicorn"],target)
        env = {key:value for key,value in os.environ.items() if key not in {"PYTHONPATH","NODE_PATH","VIRTUAL_ENV"}}
        run([python,"-m","dagmar_server.browser_contract","--typescript","packages/dagmar-browser/src/contracts.ts","--openapi","packages/dagmar-server/contracts/openapi.json","--check"],target,env)
        run([python,"-m","pytest",str(target/"packages/dagmar-server/tests"),"-q"],target,env)
        run([python,str(target/"packages/dagmar-server/harness/verify_diagnostics_host.py")],target,env)
        run(["pnpm","install","--frozen-lockfile=false"],target,env)
        run(["pnpm","--filter","@dagmar/browser","test"],target,env)
        run(["pnpm","--filter","dagmar-minimal-host","build"],target,env)
        run([python,str(target/"examples/dagmar-host/verify.py")],target,env)
        print("Whole Dagmar clean install/build/test-auth server/own DB/mock provider copy-out PASS")


if __name__ == "__main__":
    main()
