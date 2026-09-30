"""Enforce portable production imports and an empty v1 capability registry."""
import ast
import json
import re
from pathlib import Path

import tomllib

ROOT = Path(__file__).resolve().parents[1]


def check() -> list[str]:
    failures = []
    browser = ROOT / "packages/voice-core/src"
    for file in browser.rglob("*"):
        if file.suffix not in {".ts", ".tsx"}:
            continue
        content = file.read_text()
        for dependency in re.findall(r"(?:from\s*|import\s*\(|import\s*)['\"]([^'\"]+)['\"]", content):
            if dependency.startswith("."):
                target = (file.parent / dependency).resolve()
                if not target.is_relative_to(browser.resolve()):
                    failures.append(f"{file.relative_to(ROOT)} escapes portable source")
            elif dependency not in {"react", "react/jsx-runtime"}:
                failures.append(f"{file.relative_to(ROOT)} imports {dependency}")
        if re.search(r"Better Hotel|hcasc\.cz|OKO2|@kajovo/|Reservation|HotelVoice|SpeechRecognition|speechSynthesis", content):
            failures.append(f"{file.relative_to(ROOT)} contains a forbidden business or substitute-engine reference")
    server = ROOT / "packages/voice-core-server/src/voice_core_server"
    allowed = {"voice_core_server", "pydantic", "httpx", "dataclasses", "typing", "time", "json"}
    for file in server.rglob("*.py"):
        for node in ast.walk(ast.parse(file.read_text())):
            if isinstance(node, ast.Import):
                names = [alias.name.split(".")[0] for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level:
                target = file.parent
                for _ in range(node.level - 1):
                    target = target.parent
                if node.module:
                    target = target.joinpath(*node.module.split("."))
                if not target.resolve().is_relative_to(server.resolve()):
                    failures.append(f"{file.relative_to(ROOT)} escapes portable server source")
                continue
            elif isinstance(node, ast.ImportFrom) and not node.level:
                names = [(node.module or "").split(".")[0]]
            else:
                continue
            for name in names:
                if name not in allowed:
                    failures.append(f"{file.relative_to(ROOT)} imports {name}")
    package = json.loads((ROOT / "packages/voice-core/package.json").read_text())
    for section in ["dependencies", "peerDependencies"]:
        if any(name.startswith("@kajovo/") or "workspace:" in version for name, version in package.get(section, {}).items()):
            failures.append("Portable manifest depends on a host workspace")
    project = tomllib.loads((ROOT / "packages/voice-core-server/pyproject.toml").read_text())["project"]
    for dependency in project["dependencies"]:
        if re.split(r"[<>=!~\[ ]", dependency, maxsplit=1)[0] not in {"pydantic", "httpx"}:
            failures.append("Portable server manifest depends on a host or undeclared runtime")
    from voice_core_server import VoiceCoreConfig, session_config
    from voice_core_server.contracts import CAPABILITY_REGISTRY
    session = session_config(VoiceCoreConfig(), "gpt-realtime-2.1")
    if CAPABILITY_REGISTRY or session.get("tools") or session["tool_choice"] != "none":
        failures.append("v1 capabilities are not empty")
    return failures


if __name__ == "__main__":
    errors = check()
    if errors:
        raise SystemExit("\n".join(errors))
    print("Voice Core portable boundaries PASS")
