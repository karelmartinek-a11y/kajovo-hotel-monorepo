from __future__ import annotations

import os
import subprocess
from pathlib import Path


def _gradle_commands(repo_root: Path) -> list[list[str]]:
    android_root = repo_root / "android"
    if os.name == "nt":
        commands: list[list[str]] = []
        fallback_paths = [
            android_root / ".gradle-dist" / "gradle-8.13-bin" / "bin" / "gradle.bat",
            android_root / ".gradle-dist" / "gradle-8.13" / "bin" / "gradle.bat",
        ]
        for fallback_path in fallback_paths:
            if fallback_path.exists():
                commands.append([str(fallback_path)])
        commands.append([str(android_root / "gradlew.bat")])
        return commands
    return [["sh", str(android_root / "gradlew")]]


def _base_tasks() -> list[str]:
    return [
        ":app:compileDebugKotlin",
        ":app:testDebugUnitTest",
        ":core:session:testDebugUnitTest",
        ":feature:breakfast:testDebugUnitTest",
        ":feature:housekeeping:testDebugUnitTest",
        ":feature:inventory:testDebugUnitTest",
        ":feature:issues:testDebugUnitTest",
        ":feature:lostfound:testDebugUnitTest",
        "--console=plain",
    ]


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    os.chdir(repo_root / "android")
    tasks = _base_tasks()
    commands = _gradle_commands(repo_root)

    for index, gradle_command in enumerate(commands):
        completed = subprocess.run(gradle_command + tasks, check=False)
        if completed.returncode == 0:
            return 0
        if os.name != "nt" or index == len(commands) - 1:
            return completed.returncode

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
