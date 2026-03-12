from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
TEXT_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".csv", ".yml", ".yaml", ".css", ".html"}
SUSPICIOUS_CHARS = {
    chr(0x0088),
    chr(0x00AD),
    chr(0x00C4),
    chr(0x00E2),
    chr(0x0102),
    chr(0x0139),
    chr(0x013E),
    chr(0x015A),
    chr(0x015F),
    chr(0x0164),
    chr(0x02C7),
    chr(0x02D8),
    chr(0x02DD),
    chr(0x20AC),
    chr(0x2122),
}


def iter_text_files() -> list[Path]:
    files: list[Path] = []
    for base in (REPO_ROOT / "apps", REPO_ROOT / "packages"):
        for path in base.rglob("*"):
            if path.is_dir() or "node_modules" in path.parts or "dist" in path.parts:
                continue
            if path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            files.append(path)
    return files


def main() -> int:
    failures: list[tuple[Path, int, str]] = []
    for path in iter_text_files():
        text = path.read_text(encoding="utf-8-sig")
        for line_number, line in enumerate(text.splitlines(), start=1):
            if any(char in line for char in SUSPICIOUS_CHARS):
                failures.append((path, line_number, line))

    if not failures:
        print("Mojibake check: PASS")
        return 0

    print("Mojibake check: FAIL")
    for path, line_number, line in failures:
        print(f"{path.relative_to(REPO_ROOT)}:{line_number}: {line}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
