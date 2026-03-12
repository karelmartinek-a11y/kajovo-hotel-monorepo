from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCAN_ROOTS = (
    REPO_ROOT / 'apps' / 'kajovo-hotel-web' / 'src',
    REPO_ROOT / 'apps' / 'kajovo-hotel-admin' / 'src',
    REPO_ROOT / 'packages' / 'ui' / 'src',
)
TEXT_EXTENSIONS = {'.ts', '.tsx', '.css'}
FORBIDDEN_DATE = re.compile(r'\b20\d{2}-\d{2}-\d{2}\b')
FORBIDDEN_SEQUENCES = (
    'title="Intro"',
    'title="Maintenance"',
    'placeholder="????????"',
    'placeholder="provoz@hotelchodovasc.cz"',
    'placeholder="uzivatel@kajovohotel.cz"',
)
ALLOWLIST = {
    'packages/ui/src/navigation/ModuleNavigation.tsx': ('placeholder=',),
    'apps/kajovo-hotel-web/src/main.tsx': ('placeholder=',),
    'apps/kajovo-hotel-admin/src/main.tsx': ('placeholder=',),
    'apps/kajovo-hotel-web/src/admin/UsersAdmin.tsx': ('placeholder=',),
}


def iter_source_files() -> list[Path]:
    files: list[Path] = []
    for base in SCAN_ROOTS:
        for path in base.rglob('*'):
            if path.is_dir() or path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            files.append(path)
    return sorted(files)


def allowed(path: Path, line: str) -> bool:
    relative = path.relative_to(REPO_ROOT).as_posix()
    allow_patterns = ALLOWLIST.get(relative, ())
    return any(pattern in line for pattern in allow_patterns)


failures: list[tuple[str, int, str]] = []
for path in iter_source_files():
    text = path.read_text(encoding='utf-8')
    for line_number, line in enumerate(text.splitlines(), start=1):
        if FORBIDDEN_DATE.search(line):
            failures.append((path.relative_to(REPO_ROOT).as_posix(), line_number, 'hardcoded-date', line.strip()))
            continue
        if any(sequence in line for sequence in FORBIDDEN_SEQUENCES):
            failures.append((path.relative_to(REPO_ROOT).as_posix(), line_number, 'forbidden-placeholder-or-utility-copy', line.strip()))
            continue
        if 'placeholder=' in line and not allowed(path, line):
            failures.append((path.relative_to(REPO_ROOT).as_posix(), line_number, 'unexpected-placeholder', line.strip()))

if failures:
    print('Frontend manifest guard: FAIL')
    for file_path, line_number, reason, line in failures:
        print(f'{file_path}:{line_number}: {reason}: {line}')
    raise SystemExit(1)

print('Frontend manifest guard: PASS')
