"""ADB UI-tree-driven captures. Only the isolated debug package is controlled."""
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

ADB = os.environ.get("ADB", "/Users/karelmartinek/Library/Android/sdk/platform-tools/adb")
SERIAL = os.environ.get("ANDROID_SERIAL", "emulator-5554")
OUT = Path(os.environ.get("NATIVE_QA_OUTPUT", "/tmp/kajovo-native-readability"))
OUT.mkdir(parents=True, exist_ok=True)

def adb(*args):
    return subprocess.check_output([ADB, "-s", SERIAL, *args])

def tree():
    for _ in range(3):
        raw = adb("exec-out", "uiautomator", "dump", "/dev/tty").decode()
        if "<?xml" in raw and "</hierarchy>" in raw:
            raw = raw[raw.index("<?xml"):raw.index("</hierarchy>") + len("</hierarchy>")]
            return ET.fromstring(raw), raw
        time.sleep(1)
    raise RuntimeError("UI tree unavailable after three attempts")

def tap(label):
    for attempt in range(2):
        root, _ = tree()
        if not any(n.get("package") == "cz.hcasc.kajovohotel.app.debug" for n in root.iter("node")):
            raise RuntimeError("Expected isolated debug application")
        for node in root.iter("node"):
            if node.get("text") == label or node.get("content-desc") == label:
                x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.get("bounds")))
                adb("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))
                time.sleep(.5)
                return
        scroll = next((n for n in root.iter("node") if n.get("scrollable") == "true"), None)
        if attempt == 0 and scroll is not None:
            x1, y1, x2, y2 = map(int, re.findall(r"\d+", scroll.get("bounds")))
            x = str((x1+x2)//2)
            adb("shell", "input", "swipe", x, str(y2-(y2-y1)//4), x, str(y1+(y2-y1)//4), "350")
        else:
            break
    raise RuntimeError(f"Missing UI target: {label}")

def snap(name):
    root, raw = tree()
    (OUT / f"{name}.xml").write_text(raw)
    (OUT / f"{name}.png").write_bytes(adb("exec-out", "screencap", "-p"))
    labels = [n.get("text") or n.get("content-desc") for n in root.iter("node") if n.get("text") or n.get("content-desc")]
    print(name, ":", " | ".join(labels), flush=True)

if __name__ == "__main__":
    command, *args = sys.argv[1:]
    if command == "tap": tap(args[0])
    elif command == "snap": snap(args[0])
    elif command == "text": adb("shell", "input", "text", args[0])
    elif command == "back": adb("shell", "input", "keyevent", "4")
    elif command == "login":
        tap("Uživatelské jméno")
        adb("shell", "input", "text", "native-qa@example.test")
        tap("Heslo")
        adb("shell", "input", "text", "NativeQa2026!")
        adb("shell", "input", "keyevent", "4")
        tap("Přihlásit")
        time.sleep(1)
        snap("roles")
