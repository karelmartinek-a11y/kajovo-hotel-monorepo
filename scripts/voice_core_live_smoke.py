"""Explicit opt-in browser speech-to-speech smoke against a running local host.

The host key is entered through its UI. This runner never reads or logs the key.
"""
import os
import subprocess
import sys
from pathlib import Path


def main() -> int:
    if os.getenv("VOICE_CORE_LIVE_SMOKE") != "1":
        print("SKIP: set VOICE_CORE_LIVE_SMOKE=1 to permit a paid Realtime call")
        return 0
    fixture = os.getenv("VOICE_CORE_AUDIO_FIXTURE")
    if not fixture or not Path(fixture).is_file():
        print("BLOCKED: VOICE_CORE_AUDIO_FIXTURE must be a local speech WAV fixture")
        return 2
    if os.getenv("CI") == "true" or os.getenv("GITHUB_ACTIONS") == "true":
        print("BLOCKED: paid smoke is not permitted in ordinary CI")
        return 2
    root = Path(__file__).resolve().parents[1]
    return subprocess.run(["pnpm", "--filter", "@kajovo/kajovo-hotel-admin", "exec", "playwright", "test", "-c", "playwright.voice-live.config.ts"], cwd=root, check=False).returncode


if __name__ == "__main__":
    sys.exit(main())
