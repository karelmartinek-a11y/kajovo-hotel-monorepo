from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib
import json
import shutil
import zipfile
from pathlib import Path
from typing import Callable


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
    ".ps1",
    ".sh",
    ".env",
    ".xml",
}
ZIP_EXTENSIONS = {".zip"}
REPO_MARKERS = {
    ".git",
    "package.json",
    "pnpm-workspace.yaml",
    "pyproject.toml",
    "requirements.txt",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
    "Directory.Build.props",
    "global.json",
}
SKIP_DIRS = {
    ".git",
    "artifacts",
    ".tmp",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    ".nuxt",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".tox",
    ".idea",
    ".vscode",
}
ALLOWLIST_RELATIVE_SUFFIXES = {
    "scripts/check_mojibake.py",
    "scripts/forensic_text_encoding_audit.py",
    "scripts/bulk_encoding_remediator.py",
}
SUSPICIOUS_TOKENS = (
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
    "K?jovo",
    "K?JOVO",
)
LIKELY_SOURCE_ENCODINGS = ("cp1250", "latin-1")
MAX_FINDINGS_PER_TARGET = 50
MAX_DIFF_PREVIEW = 180


@dataclass
class Target:
    kind: str
    path: str
    source_root: str
    extracted_to: str | None = None


@dataclass
class FileIssue:
    path: str
    issue: str
    severity: str
    detail: str
    repair_encoding: str | None = None
    confidence: float | None = None
    changed: bool = False


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def score_text(value: str) -> int:
    czech_chars = "áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ"
    good = sum(value.count(char) for char in czech_chars) * 3
    suspicious = sum(value.count(token) for token in SUSPICIOUS_TOKENS) * 4
    controls = sum(1 for char in value if ord(char) < 32 and char not in "\r\n\t")
    return good - suspicious - controls * 2


def suspicious_count(value: str) -> int:
    return sum(value.count(token) for token in SUSPICIOUS_TOKENS)


def is_repo_dir(path: Path) -> bool:
    if not path.is_dir():
        return False
    for marker in REPO_MARKERS:
        if (path / marker).exists():
            return True
    return False


def should_skip_dir(path: Path) -> bool:
    return any(part in SKIP_DIRS for part in path.parts)


def should_skip_parts(parts: tuple[str, ...]) -> bool:
    return any(part in SKIP_DIRS for part in parts)


def detect_targets(roots: list[Path], include_zips: bool) -> list[Target]:
    targets: list[Target] = []
    seen_repo_paths: set[Path] = set()
    seen_zip_paths: set[Path] = set()
    for root in roots:
        if not root.exists():
            continue
        if root.is_file() and root.suffix.lower() in ZIP_EXTENSIONS and include_zips:
            if root not in seen_zip_paths:
                targets.append(Target(kind="zip", path=str(root), source_root=str(root.parent)))
                seen_zip_paths.add(root)
            continue
        if is_repo_dir(root):
            targets.append(Target(kind="repo", path=str(root), source_root=str(root.parent)))
            seen_repo_paths.add(root)
        for path in root.rglob("*"):
            if should_skip_dir(path):
                continue
            if (
                path.is_dir()
                and is_repo_dir(path)
                and path not in seen_repo_paths
                and not any(parent in seen_repo_paths for parent in path.parents)
            ):
                targets.append(Target(kind="repo", path=str(path), source_root=str(root)))
                seen_repo_paths.add(path)
            elif include_zips and path.is_file() and path.suffix.lower() in ZIP_EXTENSIONS and path not in seen_zip_paths:
                targets.append(Target(kind="zip", path=str(path), source_root=str(root)))
                seen_zip_paths.add(path)
    return sorted(targets, key=lambda item: (item.kind, item.path.lower()))


def iter_text_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        if path.is_dir():
            continue
        rel_parts = path.relative_to(root).parts
        if should_skip_parts(rel_parts):
            continue
        if path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        files.append(path)
    return sorted(files)


def detect_bom(raw: bytes) -> str | None:
    if raw.startswith(b"\xef\xbb\xbf"):
        return "utf-8-bom"
    if raw.startswith(b"\xff\xfe"):
        return "utf-16-le"
    if raw.startswith(b"\xfe\xff"):
        return "utf-16-be"
    return None


def preview(value: str) -> str:
    single_line = " ".join(value.splitlines())
    return single_line[:MAX_DIFF_PREVIEW]


def choose_repair(decoded_text: str) -> tuple[str, str, float] | None:
    source_score = score_text(decoded_text)
    source_suspicious = suspicious_count(decoded_text)
    best: tuple[str, str, float] | None = None
    for source_encoding in LIKELY_SOURCE_ENCODINGS:
        try:
            candidate = decoded_text.encode(source_encoding).decode("utf-8")
        except UnicodeError:
            continue
        if candidate == decoded_text:
            continue
        candidate_score = score_text(candidate)
        candidate_suspicious = suspicious_count(candidate)
        improvement = candidate_score - source_score
        if candidate_suspicious >= source_suspicious and improvement < 4:
            continue
        confidence = min(0.99, 0.55 + max(0, improvement) / 20.0 + max(0, source_suspicious - candidate_suspicious) / 8.0)
        if best is None or confidence > best[2]:
            best = (source_encoding, candidate, confidence)
    return best


def assess_file(path: Path, root: Path) -> tuple[list[FileIssue], str | None]:
    issues: list[FileIssue] = []
    raw = path.read_bytes()
    rel = path.relative_to(root).as_posix()
    if rel in ALLOWLIST_RELATIVE_SUFFIXES:
        return issues, None
    bom = detect_bom(raw)
    if bom and bom != "utf-8-bom":
        issues.append(FileIssue(path=rel, issue="non-utf8-bom", severity="high", detail=f"File starts with {bom}."))

    text: str
    decoded_from_non_utf8 = False
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        decoded = None
        for encoding in LIKELY_SOURCE_ENCODINGS:
            try:
                candidate = raw.decode(encoding)
            except UnicodeError:
                continue
            if score_text(candidate) >= 2:
                decoded = (encoding, candidate)
                break
        if decoded is None:
            issues.append(
                FileIssue(
                    path=rel,
                    issue="non-utf8-bytes",
                    severity="high",
                    detail=f"UTF-8 decode fails at byte {exc.start}.",
                )
            )
            return issues, None
        encoding, text = decoded
        decoded_from_non_utf8 = True
        issues.append(
            FileIssue(
                path=rel,
                issue="legacy-encoded-text",
                severity="high",
                detail=f"Raw file decoded as {encoding}; candidate for UTF-8 rewrite.",
                repair_encoding=encoding,
                confidence=0.95,
            )
        )

    suspicious = [token for token in SUSPICIOUS_TOKENS if token in text]
    if suspicious:
        issues.append(
            FileIssue(
                path=rel,
                issue="suspicious-text",
                severity="medium",
                detail=f"Contains suspicious tokens: {', '.join(sorted(set(suspicious))[:8])}.",
            )
        )

    repair = choose_repair(text)
    replacement_text: str | None = None
    if repair is not None:
        source_encoding, candidate, confidence = repair
        replacement_text = candidate
        issues.append(
            FileIssue(
                path=rel,
                issue="possible-mojibake-repair",
                severity="medium" if confidence < 0.85 else "high",
                detail=f"{source_encoding} -> utf-8 improves text. Preview: {preview(candidate)}",
                repair_encoding=source_encoding,
                confidence=round(confidence, 3),
            )
        )

    if decoded_from_non_utf8 and replacement_text is None:
        replacement_text = text

    return issues, replacement_text


def backup_file(path: Path, target_root: Path, backup_root: Path) -> None:
    dest = backup_root / target_root.name / path.relative_to(target_root)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dest)


def zip_extract(zip_path: Path, extract_root: Path) -> Path:
    digest = hashlib.sha1(str(zip_path).encode("utf-8")).hexdigest()[:10]
    target_dir = extract_root / f"{zip_path.stem}-{digest}"
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(target_dir)

    children = [child for child in target_dir.iterdir()]
    if len(children) == 1 and children[0].is_dir():
        return children[0]
    return target_dir


def zip_pack(root: Path, output_zip: Path) -> None:
    output_zip.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(root.rglob("*")):
            if path.is_dir():
                continue
            if should_skip_parts(path.relative_to(root).parts):
                continue
            archive.write(path, arcname=path.relative_to(root.parent).as_posix())


def replace_zip_with_backup(original_zip: Path, replacement_zip: Path, backup_root: Path) -> None:
    backup_root.mkdir(parents=True, exist_ok=True)
    backup_zip = backup_root / original_zip.name
    shutil.copy2(original_zip, backup_zip)
    tmp_zip = original_zip.with_suffix(original_zip.suffix + ".tmp")
    shutil.copy2(replacement_zip, tmp_zip)
    tmp_zip.replace(original_zip)


def process_target(
    target: Target,
    output_root: Path,
    apply_changes: bool,
    confidence_threshold: float,
    replace_zips: bool,
) -> dict:
    target_path = Path(target.path)
    working_root = target_path
    extracted_from_zip = False
    if target.kind == "zip":
        extracted_root = output_root / "extracted"
        working_root = zip_extract(target_path, extracted_root)
        target.extracted_to = str(working_root)
        extracted_from_zip = True

    findings: list[FileIssue] = []
    changed_files = 0
    scanned_files = 0
    backup_root = output_root / "backups"
    for file_path in iter_text_files(working_root):
        scanned_files += 1
        issues, replacement_text = assess_file(file_path, working_root)
        findings.extend(issues[:MAX_FINDINGS_PER_TARGET])
        repair_candidates = [issue for issue in issues if issue.issue in {"legacy-encoded-text", "possible-mojibake-repair"}]
        best_confidence = max((issue.confidence or 0.0) for issue in repair_candidates) if repair_candidates else 0.0
        if apply_changes and replacement_text is not None and best_confidence >= confidence_threshold:
            backup_file(file_path, working_root, backup_root)
            original = file_path.read_text(encoding="utf-8-sig", errors="ignore") if file_path.exists() else ""
            if original != replacement_text:
                file_path.write_text(replacement_text, encoding="utf-8", newline="")
                changed_files += 1
                findings.append(
                    FileIssue(
                        path=file_path.relative_to(working_root).as_posix(),
                        issue="auto-rewritten",
                        severity="info",
                        detail=f"Rewritten as UTF-8 with confidence {best_confidence:.3f}.",
                        confidence=round(best_confidence, 3),
                        changed=True,
                    )
                )

    fixed_zip = None
    if extracted_from_zip and apply_changes and changed_files > 0:
        fixed_zip = output_root / "fixed-zips" / f"{target_path.stem}.fixed.zip"
        zip_pack(working_root, fixed_zip)
        if replace_zips:
            replace_zip_with_backup(
                original_zip=target_path,
                replacement_zip=fixed_zip,
                backup_root=output_root / "zip-backups",
            )

    return {
        "target": asdict(target),
        "scanned_files": scanned_files,
        "changed_files": changed_files,
        "findings": [asdict(finding) for finding in findings],
        "fixed_zip": str(fixed_zip) if fixed_zip else None,
    }


def write_reports(run_root: Path, results: list[dict]) -> None:
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "targets": results,
        "totals": {
            "targets": len(results),
            "scanned_files": sum(item["scanned_files"] for item in results),
            "changed_files": sum(item["changed_files"] for item in results),
            "issues": sum(len(item["findings"]) for item in results),
        },
    }
    (run_root / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Bulk Encoding Audit",
        "",
        f"- Generated: {summary['generated_at']}",
        f"- Targets: `{summary['totals']['targets']}`",
        f"- Scanned files: `{summary['totals']['scanned_files']}`",
        f"- Changed files: `{summary['totals']['changed_files']}`",
        f"- Findings: `{summary['totals']['issues']}`",
        "",
        "## Targets",
        "",
    ]
    for item in results:
        target = item["target"]
        lines.append(f"- `{target['kind']}` `{target['path']}`")
        lines.append(f"  scanned: {item['scanned_files']}, changed: {item['changed_files']}, findings: {len(item['findings'])}")
        for finding in item["findings"][:10]:
            lines.append(f"  - [{finding['severity']}] {finding['issue']}: {finding['path']} - {finding['detail']}")
        if item["fixed_zip"]:
            lines.append(f"  - fixed zip: `{item['fixed_zip']}`")
    (run_root / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_bulk_job(
    roots: list[Path],
    *,
    apply_changes: bool,
    include_zips: bool,
    replace_zips: bool,
    confidence_threshold: float,
    output_root: Path,
    logger: Callable[[str], None] | None = None,
) -> tuple[int, Path]:
    def log(message: str) -> None:
        if logger is not None:
            logger(message)
        else:
            print(message)

    targets = detect_targets(roots, include_zips=include_zips)
    if not targets:
        log("No repository or ZIP targets found.")
        return 0, output_root

    run_root = output_root
    run_root.mkdir(parents=True, exist_ok=True)
    results = []
    for target in targets:
        log(f"Processing {target.kind}: {target.path}")
        results.append(
            process_target(
                target=target,
                output_root=run_root,
                apply_changes=apply_changes,
                confidence_threshold=confidence_threshold,
                replace_zips=replace_zips,
            )
        )
    write_reports(run_root, results)

    changed = sum(item["changed_files"] for item in results)
    findings = sum(len(item["findings"]) for item in results)
    log(f"Targets: {len(results)}")
    log(f"Changed files: {changed}")
    log(f"Findings: {findings}")
    log(f"Report: {run_root / 'summary.md'}")
    return (1 if findings and not apply_changes else 0), run_root


def main() -> int:
    parser = argparse.ArgumentParser(description="Bulk forensic audit and remediation for mojibake and legacy-encoded text.")
    parser.add_argument("roots", nargs="+", type=Path, help="Roots to scan for repos and ZIP archives.")
    parser.add_argument("--apply", action="store_true", help="Rewrite high-confidence files in place and produce fixed ZIPs.")
    parser.add_argument("--include-zips", action="store_true", help="Also scan .zip archives under the provided roots.")
    parser.add_argument("--replace-zips", action="store_true", help="When --apply is enabled, replace original ZIP files in place after creating backups.")
    parser.add_argument(
        "--confidence-threshold",
        type=float,
        default=0.88,
        help="Minimum confidence for automatic rewrites when --apply is enabled.",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path.home() / "codex-encoding-runs" / utc_stamp(),
        help="Directory for reports, extracted ZIPs, backups, and fixed ZIP outputs.",
    )
    args = parser.parse_args()
    exit_code, _ = run_bulk_job(
        roots=args.roots,
        apply_changes=args.apply,
        include_zips=args.include_zips,
        replace_zips=args.replace_zips,
        confidence_threshold=args.confidence_threshold,
        output_root=args.output_root,
    )
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
