from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import json


REPO_ROOT = Path(__file__).resolve().parents[1]
TEXT_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".md",
    ".txt",
    ".csv",
    ".yml",
    ".yaml",
    ".css",
    ".html",
    ".svg",
    ".toml",
    ".ini",
    ".conf",
}
SCAN_ROOTS = ("apps", "packages", "docs", "scripts", ".github", ".codex")
SKIP_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    "test-results",
    "playwright-report",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".venv",
    "venv",
}
ALLOWLIST_PATHS = {
    "scripts/check_mojibake.py",
    "scripts/forensic_text_encoding_audit.py",
}
SUSPICIOUS_UNICODE = (
    "Ă",
    "Ä",
    "Ĺ",
    "â€",
    "â€“",
    "â€”",
    "â€ž",
    "â€ś",
    "â€ť",
    "\ufffd",
)
LIKELY_REPAIR_ENCODINGS = ("cp1250", "latin-1")
MAX_EXAMPLES_PER_ISSUE = 3


@dataclass
class Finding:
    path: str
    severity: str
    issue: str
    detail: str


def iter_files() -> list[Path]:
    files: list[Path] = []
    for root_name in SCAN_ROOTS:
        root = REPO_ROOT / root_name
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.is_dir():
                continue
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            if path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            files.append(path)
    return sorted(set(files))


def score_czech_text(value: str) -> int:
    czech_chars = "áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ"
    suspicious_hits = sum(value.count(token) for token in SUSPICIOUS_UNICODE)
    return sum(value.count(char) for char in czech_chars) * 2 - suspicious_hits * 3


def format_byte_window(raw: bytes, offset: int, width: int = 12) -> str:
    start = max(0, offset - width)
    end = min(len(raw), offset + width)
    return raw[start:end].hex(" ")


def detect_bom(raw: bytes) -> str | None:
    if raw.startswith(b"\xef\xbb\xbf"):
        return "utf-8-bom"
    if raw.startswith(b"\xff\xfe"):
        return "utf-16-le"
    if raw.startswith(b"\xfe\xff"):
        return "utf-16-be"
    return None


def audit_file(path: Path) -> list[Finding]:
    findings: list[Finding] = []
    raw = path.read_bytes()
    rel_path = path.relative_to(REPO_ROOT).as_posix()

    if rel_path in ALLOWLIST_PATHS:
        return findings

    bom = detect_bom(raw)
    if bom and bom != "utf-8-bom":
        findings.append(
            Finding(rel_path, "high", "non-utf8-bom", f"File starts with BOM `{bom}`.")
        )

    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        findings.append(
            Finding(
                rel_path,
                "high",
                "non-utf8-bytes",
                f"UTF-8 decode fails at byte {exc.start}. Context: `{format_byte_window(raw, exc.start)}`",
            )
        )
        return findings

    suspicious_counts = Counter(token for token in SUSPICIOUS_UNICODE if token in text)
    if suspicious_counts:
        detail = ", ".join(f"{token} x{count}" for token, count in suspicious_counts.items())
        findings.append(
            Finding(rel_path, "medium", "suspicious-unicode", f"Contains suspicious sequences: {detail}")
        )

    lines = text.splitlines()
    for line_no, line in enumerate(lines, start=1):
        if any(token in line for token in SUSPICIOUS_UNICODE):
            findings.append(
                Finding(
                    rel_path,
                    "medium",
                    "suspicious-line",
                    f"Line {line_no}: {line[:220]}",
                )
            )
            break

    repair_candidates: list[str] = []
    source_score = score_czech_text(text)
    for encoding in LIKELY_REPAIR_ENCODINGS:
        try:
            candidate = text.encode(encoding).decode("utf-8")
        except UnicodeError:
            continue
        if candidate == text:
            continue
        candidate_score = score_czech_text(candidate)
        if candidate_score > source_score + 2:
            preview = candidate.replace("\n", " ")[:180]
            repair_candidates.append(f"{encoding} -> utf-8: {preview}")
    if repair_candidates:
        findings.append(
            Finding(
                rel_path,
                "medium",
                "possible-redecode-fix",
                " | ".join(repair_candidates[:MAX_EXAMPLES_PER_ISSUE]),
            )
        )

    if "\ufffd" in text:
        findings.append(
            Finding(rel_path, "high", "replacement-char", "Contains U+FFFD replacement characters.")
        )

    return findings


def write_report(findings: list[Finding], output_path: Path) -> None:
    grouped = Counter(f.issue for f in findings)
    lines = [
        "# Text Encoding Forensic Audit",
        "",
        f"- Generated: {datetime.now(timezone.utc).isoformat()}",
        f"- Repo: `{REPO_ROOT}`",
        f"- Findings: `{len(findings)}`",
        "",
        "## Summary",
        "",
    ]
    if not findings:
        lines.append("- No encoding findings detected.")
    else:
        for issue, count in sorted(grouped.items()):
            lines.append(f"- `{issue}`: {count}")
        lines.extend(["", "## Findings", ""])
        for finding in findings:
            lines.append(f"- `{finding.severity}` `{finding.issue}` [{finding.path}]")
            lines.append(f"  {finding.detail}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=REPO_ROOT / "artifacts" / "encoding-audit" / "latest.md",
        help="Markdown report output path.",
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        default=REPO_ROOT / "artifacts" / "encoding-audit" / "latest.json",
        help="JSON report output path.",
    )
    args = parser.parse_args()

    findings: list[Finding] = []
    for path in iter_files():
        findings.extend(audit_file(path))

    write_report(findings, args.output)
    args.json_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.write_text(
        json.dumps([finding.__dict__ for finding in findings], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote markdown report to {args.output}")
    print(f"Wrote JSON report to {args.json_output}")
    print(f"Findings: {len(findings)}")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
