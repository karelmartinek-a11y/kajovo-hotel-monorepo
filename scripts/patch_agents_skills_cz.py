from __future__ import annotations

from pathlib import Path


FILES = [
    r"C:\GitHub\agents.md",
    r"C:\GitHub\FotoSelector\AGENTS.md",
    r"C:\GitHub\Kaja_generator\AGENTS.md",
    r"C:\GitHub\KajovoChat\AGENTS.md",
    r"C:\GitHub\KajovoMail22\AGENTS.md",
    r"C:\GitHub\kajovomail22_sanitized\AGENTS.md",
    r"C:\GitHub\KajovoNG\AGENTS.md",
    r"C:\GitHub\KajovoPhotoSelector\AGENTS.md",
    r"C:\GitHub\KajovoRadio\AGENTS.md",
    r"C:\GitHub\KajovoSpend\agents.md",
    r"C:\GitHub\KajovoSpend\docs\AGENTS.md",
    r"C:\GitHub\KajovoView\AGENTS.md",
    r"C:\GitHub\Kajovo_radio\AGENTS.md",
    r"C:\inventura\FOTO\AGENTS.md",
    r"C:\inventura\FOTO\old\AGENTS.md",
    r"C:\inventura\FOTO\VER2\AGENTS.md",
    r"C:\inventura\IMPORT\dochazka_prg\AGENTS.md",
    r"C:\inventura\kajafinder\AGENTS.md",
    r"C:\inventura\KajaRadio\AGENTS.md",
    r"C:\inventura\Kaja_generator\AGENTS.md",
    r"C:\inventura\KOMPONENTY\AGENTS.md",
    r"C:\inventura\mapa\AGENTS.md",
    r"C:\KARAN\radio2\AGENTS.md",
    r"C:\KARAN\radio3\radio_kaja_jizak\AGENTS.md",
    r"C:\qq\AGENTS.md",
    r"C:\qq\KajovoNG-forensic-fixed\AGENTS.md",
    r"C:\qq\KajovoNG-main-fixed\KajovoNG-main\AGENTS.md",
    r"C:\qq\KajovoNG-main_audited\KajovoNG-main\AGENTS.md",
    r"C:\qq\KajovoNG-main_fixed\KajovoNG-main\AGENTS.md",
    r"C:\qq\KajovoNG-main_layout2\KajovoNG-main\AGENTS.md",
    r"C:\qq\KajovoNG-main_layout2 (1)\KajovoNG-main\AGENTS.md",
    r"C:\qq\KajovoNG_fixed\KajovoNG_fixed\AGENTS.md",
    r"C:\qq\KajovoSpend-improved\KajovoSpend-main\AGENTS.md",
    r"C:\qq\KajovoSpend-progress-ready\KajovoSpend-main\docs\AGENTS.md",
    r"C:\qq\KajovoSpend-progress-ready-fixed2\KajovoSpend-main\docs\AGENTS.md",
    r"C:\Users\provo\.codex\AGENTS.md",
    r"C:\GitHub\dagmar-backend\.venv\Lib\site-packages\fastapi\.agents\skills\fastapi\SKILL.md",
    r"C:\GitHub\kajovo-hotel-monorepo\artifacts\bulk-encoding-test\extracted\skill-fd621c33bb\zip-in-out-repo-editor\SKILL.md",
    r"C:\GitHub\kajovo-hotel-monorepo\artifacts\bulk-encoding-test-2\extracted\skill-fd621c33bb\zip-in-out-repo-editor\SKILL.md",
    r"C:\GitHub\kajovo-hotel-monorepo\artifacts\bulk-encoding-test-3\extracted\skill-fd621c33bb\zip-in-out-repo-editor\SKILL.md",
    r"C:\inventura\IMPORT\Kaja_PRG\Kaja_PRG060120262007\skills\kaja-fintil\SKILL.md",
    r"C:\inventura\IMPORT\Kaja_PRG\Kaja_PRG060120262007\skills\supercodex\SKILL.md",
    r"C:\inventura\IMPORT\Kaja_PRG\skills\kaja-fintil\SKILL.md",
    r"C:\inventura\IMPORT\Kaja_PRG\skills\supercodex\SKILL.md",
    r"C:\inventura\Kaja_PRG\Kaja_PRG060120262007\skills\kaja-fintil\SKILL.md",
    r"C:\inventura\Kaja_PRG\Kaja_PRG060120262007\skills\supercodex\SKILL.md",
    r"C:\inventura\Kaja_PRG\skills\kaja-fintil\SKILL.md",
    r"C:\inventura\Kaja_PRG\skills\supercodex\SKILL.md",
    r"C:\Users\provo\.codex\skills\.system\skill-creator\SKILL.md",
    r"C:\Users\provo\.codex\skills\.system\skill-installer\SKILL.md",
    r"C:\Users\provo\.codex\skills\kajovoprogramator\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\aspnet-core\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\chatgpt-apps\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\cloudflare-deploy\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\develop-web-game\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\doc\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\figma\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\figma-implement-design\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\gh-address-comments\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\gh-fix-ci\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\imagegen\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\jupyter-notebook\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\linear\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\netlify-deploy\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\notion-knowledge-capture\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\notion-meeting-intelligence\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\notion-research-documentation\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\notion-spec-to-implementation\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\openai-docs\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\pdf\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\playwright\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\playwright-interactive\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\render-deploy\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\screenshot\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\security-best-practices\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\security-ownership-map\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\security-threat-model\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\sentry\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\slides\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\sora\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\speech\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\spreadsheet\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\transcribe\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\vercel-deploy\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\winui-app\SKILL.md",
    r"C:\Users\provo\.codex\vendor_imports\skills\skills\.curated\yeet\SKILL.md",
]

MARKER = "## Kodovani A Cestina"
BLOCK = """

## Kodovani A Cestina

- Vsechny textove soubory, zdrojove kody, konfigurace, prompty, dokumentace a poznamky se musi vytvaret a upravovat v `UTF-8 bez BOM`.
- Pokud uzivatel vyslovne neurci jinak, komunikace s uzivatelem musi byt v cestine.
- Dokumentace se musi psat v cestine.
- Poznamky a komentare v kodu se musi psat v cestine.
""".rstrip() + "\n"


def patch_file(path_str: str) -> str:
    path = Path(path_str)
    if not path.exists():
        return f"missing: {path}"
    try:
        text = None
        for encoding in ("utf-8", "utf-8-sig", "cp1250", "latin-1"):
            try:
                text = path.read_text(encoding=encoding)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            return f"decode-failed: {path}"
    except OSError as error:
        return f"read-failed: {path} :: {error}"
    if MARKER in text:
        return f"unchanged: {path}"
    if not text.endswith("\n"):
        text += "\n"
    text += BLOCK
    try:
        path.write_text(text, encoding="utf-8", newline="\n")
    except OSError as error:
        return f"write-failed: {path} :: {error}"
    return f"updated: {path}"


def main() -> None:
    for file_path in FILES:
        print(patch_file(file_path))


if __name__ == "__main__":
    main()
