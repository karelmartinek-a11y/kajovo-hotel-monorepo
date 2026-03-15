from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import shutil
import tempfile
import zipfile


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
    ".bat",
    ".cmd",
    ".sh",
    ".xml",
    ".env",
    ".gitignore",
    ".gitattributes",
    ".editorconfig",
}
ZIP_EXTENSIONS = {".zip"}
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
SOURCE_ENCODINGS = ("cp1250", "latin-1")


@dataclass
class RepairStats:
    scanned_text_files: int = 0
    changed_text_files: int = 0
    scanned_zip_files: int = 0
    changed_zip_files: int = 0


def is_text_file(path: Path) -> bool:
    suffix = path.suffix.lower()
    if suffix in TEXT_EXTENSIONS:
        return True
    return path.name.lower() in TEXT_EXTENSIONS


def score_text(value: str) -> int:
    czech_chars = "áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ"
    good = sum(value.count(char) for char in czech_chars) * 3
    suspicious = sum(value.count(token) for token in SUSPICIOUS_TOKENS) * 4
    controls = sum(1 for char in value if ord(char) < 32 and char not in "\r\n\t")
    return good - suspicious - controls * 3


def suspicious_count(value: str) -> int:
    return sum(value.count(token) for token in SUSPICIOUS_TOKENS)


def decode_best_effort(raw: bytes) -> tuple[str | None, str | None]:
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        for encoding in ("utf-16", "utf-16-le", "utf-16-be"):
            try:
                return encoding, raw.decode(encoding)
            except UnicodeError:
                continue

    try:
        return "utf-8-sig", raw.decode("utf-8-sig")
    except UnicodeError:
        pass

    best: tuple[str | None, str | None, int] = (None, None, -10**9)
    for encoding in ("cp1250", "latin-1", "utf-16-le", "utf-16-be"):
        try:
            decoded = raw.decode(encoding)
        except UnicodeError:
            continue
        score = score_text(decoded)
        if score > best[2]:
            best = (encoding, decoded, score)
    return best[0], best[1]


def improve_text(text: str) -> str:
    best_text = text
    best_score = score_text(text)
    best_suspicious = suspicious_count(text)

    for encoding in SOURCE_ENCODINGS:
        try:
            candidate = text.encode(encoding).decode("utf-8")
        except UnicodeError:
            continue
        candidate_score = score_text(candidate)
        candidate_suspicious = suspicious_count(candidate)
        if candidate_score > best_score or candidate_suspicious < best_suspicious:
            best_text = candidate
            best_score = candidate_score
            best_suspicious = candidate_suspicious

    return best_text


def repair_text_file(path: Path) -> bool:
    raw = path.read_bytes()
    detected_encoding, decoded = decode_best_effort(raw)
    if decoded is None:
        return False

    improved = improve_text(decoded)
    new_raw = improved.replace("\r\n", "\n").encode("utf-8")

    original_utf8 = None
    try:
        original_utf8 = raw.decode("utf-8")
    except UnicodeError:
        pass

    if raw == new_raw or original_utf8 == improved:
        return False

    path.write_bytes(new_raw)
    return True


def repack_zip_from_dir(source_dir: Path, output_zip: Path) -> None:
    temp_zip = output_zip.with_suffix(output_zip.suffix + ".tmp")
    if temp_zip.exists():
        temp_zip.unlink()
    with zipfile.ZipFile(temp_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source_dir.rglob("*")):
            if path.is_dir():
                continue
            archive.write(path, arcname=path.relative_to(source_dir).as_posix())
    temp_zip.replace(output_zip)


def repair_zip_file(path: Path, stats: RepairStats) -> bool:
    changed = False
    with tempfile.TemporaryDirectory(prefix="yolo-text-repair-") as temp_dir_raw:
        temp_dir = Path(temp_dir_raw)
        with zipfile.ZipFile(path) as archive:
            archive.extractall(temp_dir)
        changed = process_tree(temp_dir, stats)
        if changed:
            repack_zip_from_dir(temp_dir, path)
    return changed


def process_tree(root: Path, stats: RepairStats) -> bool:
    changed_any = False
    for path in sorted(root.rglob("*")):
        if path.is_dir():
            continue
        if path.suffix.lower() in ZIP_EXTENSIONS:
            stats.scanned_zip_files += 1
            if repair_zip_file(path, stats):
                stats.changed_zip_files += 1
                changed_any = True
            continue
        if is_text_file(path):
            stats.scanned_text_files += 1
            if repair_text_file(path):
                stats.changed_text_files += 1
                changed_any = True
    return changed_any


def zip_directory(source_dir: Path, backup_zip: Path) -> None:
    backup_zip.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(backup_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source_dir.rglob("*")):
            if path.is_dir():
                continue
            archive.write(path, arcname=path.relative_to(source_dir.parent).as_posix())


def backup_roots(roots: list[Path], backup_dir: Path) -> list[Path]:
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    outputs: list[Path] = []
    for index, root in enumerate(roots, start=1):
        backup_zip = backup_dir / f"{timestamp}-{index:02d}-{root.name}.zip"
        zip_directory(root, backup_zip)
        outputs.append(backup_zip)
    return outputs


def run_yolo_repair(roots: list[Path], backup_dir: Path, logger=print) -> RepairStats:
    resolved_roots = [root.resolve() for root in roots]
    backup_dir = backup_dir.resolve()
    for root in resolved_roots:
        if backup_dir == root or backup_dir.is_relative_to(root):
            raise ValueError(f"Backup adresar nesmi lezet uvnitr prohledavaneho adresare: {root}")

    backups = backup_roots(resolved_roots, backup_dir)
    for backup in backups:
        logger(f"Backup vytvoren: {backup}")

    stats = RepairStats()
    for root in resolved_roots:
        logger(f"Zpracovavam: {root}")
        process_tree(root, stats)
    logger(f"Textove soubory: {stats.scanned_text_files}, zmenene: {stats.changed_text_files}")
    logger(f"ZIP soubory: {stats.scanned_zip_files}, zmenene: {stats.changed_zip_files}")
    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="YOLO oprava textovych souboru a ZIP archivu.")
    parser.add_argument("roots", nargs="+", type=Path, help="Adresare pro pruchod")
    parser.add_argument("--backup-dir", required=True, type=Path, help="Adresar pro plne ZIP zalohy vybranych korenu")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    run_yolo_repair(args.roots, args.backup_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
