"""Ensure every portal translation is present and preserves interpolation fields."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "packages/shared/src/i18n/portal-translations.json"
SOURCES = [
    ROOT / "apps/kajovo-hotel-web/src/main.tsx",
    *list((ROOT / "apps/kajovo-hotel-web/src/portal").glob("*.tsx")),
    *list((ROOT / "apps/kajovo-hotel-web/src/routes").glob("*.tsx")),
    *list((ROOT / "packages/ui/src").rglob("*.tsx")),
]
CALL = re.compile(r"\b(?:t|tf)\(\s*(['\"])(.*?)\1", re.S)
FIELD = re.compile(r"\{([a-zA-Z_]+)\}")


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    keys = {
        match.group(2)
        for source in SOURCES
        for match in CALL.finditer(source.read_text(encoding="utf-8"))
    }
    # These labels are passed through t() via status maps or API responses.
    keys.update((
        "Uklizeno", "Neuklizeno", "Průběžný úklid", "Průběžný úklid + prádlo",
        "Nerušenka", "Technická závada", "Přízemí", "Čeká", "Připravuje se",
        "Vydáno", "Zrušeno", "Pes", "Dětská postýlka",
    ))
    errors: list[str] = []
    if set(catalog) != {"en", "uk"}:
        errors.append("Catalog must contain exactly en and uk")
    for locale in ("en", "uk"):
        entries = catalog.get(locale, {})
        for key in sorted(keys):
            value = entries.get(key)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"{locale}: missing {key!r}")
            elif set(FIELD.findall(value)) != set(FIELD.findall(key)):
                errors.append(f"{locale}: interpolation differs for {key!r}")
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"Portal translations: {len(keys)} required keys in en and uk")


if __name__ == "__main__":
    main()
