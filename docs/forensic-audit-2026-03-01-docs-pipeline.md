# Forenzní audit dokumentace, pipeline a větví (2026-03-01)

## Rozsah

- dokumentace v repozitáři (důraz na `docs/`)
- Git větve (lokální + vzdálené)
- GitHub Actions pipeline stav pro `main`

## 1) Dokumentace

### Zjištění

- Klíčové provozní instrukce byly rozptýlené mezi root README a dílčí README.
- `docs/how-to-run.md` obsahoval zastaralé příklady (`npm`) neodpovídající workspace (`pnpm`).
- Chyběl jednoznačný onboarding dokument pro vývojáře bez serverového přístupu.

### Opravy

- Přidán centrální rozcestník: `docs/README.md`.
- Přidán onboarding: `docs/developer-handbook.md`.
- Aktualizováno lokální spuštění: `docs/how-to-run.md`.
- Aktualizována nasazovací dokumentace: `docs/how-to-deploy.md`.

## 2) Pipeline (GitHub)

### Ověření

Poslední ověřený commit: `dca8be8`.

- CI Gates: success
- CI Full: success
- Deploy: success

Workflow runy:

- `22539346278` — CI Gates - KájovoHotel
- `22539346277` — CI Full - Kájovo Hotel
- `22539378662` — Deploy - hotel.hcasc.cz

## 3) Větve

### Ověření

- lokálně: pouze `main`
- vzdáleně: pouze `origin/main`

Nevznikly větve vhodné ke sloučení ani k dalšímu cleanupu.

## 4) Závěr

- Dokumentace potřebná pro vývoj a release bez přístupu na server je nyní soustředěná v `docs/`.
- Pipeline je v zeleném stavu na `main`.
- Větve jsou vyčištěné.
