from __future__ import annotations

from pathlib import Path
import re
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]
TEXT_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".csv", ".yml", ".yaml", ".css", ".html"}
SCAN_ROOTS = ("apps", "packages", ".github", "scripts")
ACTIVE_DOC_PATHS = (
    Path("docs/README.md"),
    Path("docs/SSOT_SCOPE_STATUS.md"),
    Path("docs/how-to-deploy.md"),
    Path("docs/developer-handbook.md"),
    Path("docs/github-settings-checklist.md"),
)
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
SUSPICIOUS_SEQUENCES = (
    "KÄ‚Ë‡",
    "KĂ„â€šĂ‹â€ˇ",
    "PÄąâ„˘",
    "UÄąÄľ",
    "Ă„Ĺ¤",
    "Ă„â€ş",
    "Ä‚Ë‡",
    "Ä‚Â©",
    "Ä‚Â­",
    "Ä‚Ĺ‚",
    "Ä‚Ĺź",
    "Ä‚Ëť",
    "Ă˘â‚¬â€ť",
    "Ă˘â‚¬",
    "ďż˝",
)
ACTIVE_RUNTIME_FORBIDDEN_SEQUENCES = (
    "K?JOVO",
    "K?jovo",
    "Signace K?jovo",
    "K?jovoHotel",
)

QUESTION_MARK_ALLOWED_SUBSTRINGS = (
    "?:",
    "??",
    "?.",
    "?state=",
    "/api/",
    "low_stock=true",
    "status=new",
)

BROKEN_QUOTED_LITERAL_RE = re.compile(r"""(['"])(?P<value>(?:\\.|(?!\1).)*)\1""")
BROKEN_JSX_TEXT_RE = re.compile(r">(?P<value>[^<{]*\?[^<{]*)<")
BROKEN_QUESTION_MARK_RE = re.compile(r"[A-Za-zÀ-ž]\?[A-Za-zÀ-ž?]|\?[A-Za-zÀ-ž]")


def has_broken_question_mark_text(line: str) -> bool:
    if not ("?" in line):
        return False
    if ".toHaveCount(0)" in line:
        return False
    candidates = [line]
    for match in BROKEN_QUOTED_LITERAL_RE.finditer(line):
        candidates.append(match.group("value"))
    for match in BROKEN_JSX_TEXT_RE.finditer(line):
        candidates.append(match.group("value"))
    filtered_candidates = [
        candidate
        for candidate in candidates
        if not any(token in candidate for token in QUESTION_MARK_ALLOWED_SUBSTRINGS)
    ]
    return any(BROKEN_QUESTION_MARK_RE.search(candidate) for candidate in filtered_candidates)


def iter_text_files() -> list[Path]:
    files: list[Path] = []
    for root_name in SCAN_ROOTS:
        base = REPO_ROOT / root_name
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if (
                path.is_dir()
                or "node_modules" in path.parts
                or "dist" in path.parts
                or "test-results" in path.parts
                or "playwright-report" in path.parts
            ):
                continue
            if path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            files.append(path)
    for relative_path in ACTIVE_DOC_PATHS:
        path = REPO_ROOT / relative_path
        if path.exists():
            files.append(path)
    for path in (REPO_ROOT / "docs" / "forensics").rglob("*"):
        if path.is_dir():
            continue
        if path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        files.append(path)
    return sorted(set(files))


def main() -> int:
    failures: list[tuple[Path, int, str]] = []
    for path in iter_text_files():
        try:
            text = path.read_text(encoding="utf-8-sig")
        except UnicodeDecodeError as exc:
            failures.append((path, 0, f"NON_UTF8_TEXT_FILE: {exc}"))
            continue
        for line_number, line in enumerate(text.splitlines(), start=1):
            if any(char in line for char in SUSPICIOUS_CHARS) or any(
                sequence in line for sequence in SUSPICIOUS_SEQUENCES
            ):
                failures.append((path, line_number, line))
                continue
            if "docs" not in path.parts and has_broken_question_mark_text(line):
                failures.append((path, line_number, line))
                continue
            if "docs" not in path.parts and any(
                sequence in line for sequence in ACTIVE_RUNTIME_FORBIDDEN_SEQUENCES
            ):
                failures.append((path, line_number, line))

    if not failures:
        print("Mojibake check: PASS")
        return 0

    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    print("Mojibake check: FAIL")
    for path, line_number, line in failures:
        print(f"{path.relative_to(REPO_ROOT)}:{line_number}: {line}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
