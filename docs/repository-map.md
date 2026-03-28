# Repository Map

Tento dokument je forenzní inventura current-state obsahu repozitáře k datu 2026-03-28.

## Aplikace

- `apps/kajovo-hotel-web`
  Portál pro neadmin role. Obsahuje portal routy, utility stavy, provozní moduly a Playwright testy.
- `apps/kajovo-hotel-admin`
  Samostatná admin aplikace s vlastním loginem, routami a smoke/visual testy.
- `apps/kajovo-hotel-api`
  FastAPI backend. Hlavní oblasti jsou `app/api`, `app/security`, `app/db`, `app/services` a `app/media`.
- `apps/kajovo-hotel`
  Repo SSOT pro branding, tokeny, UX metadata a policy guardy. Obsahuje `brand/`, `palette/`, `ui-motion/`, `ui-tokens/`, `ux/` a `ci/`.

## Balíčky

- `packages/shared`
  Sdílené typy, RBAC, auth texty a generovaný klient v `src/generated/client.ts`.
- `packages/ui`
  Sdílené UI komponenty, shell a navigační primitiva.

## Android

Adresář `android/` je samostatný nativní Android Studio projekt.

- `app/`: hlavní aplikace a updater.
- `core/common`, `core/model`, `core/designsystem`, `core/designsystem-tokens`, `core/network`, `core/session`, `core/database`, `core/testing`.
- `feature/auth/login`, `feature/auth/roles`, `feature/profile`, `feature/utility`, `feature/reception`, `feature/housekeeping`, `feature/breakfast`, `feature/lostfound`, `feature/issues`, `feature/inventory`, `feature/reports`.
- `release/android-release.json`: jediný zdroj pravdy pro Android release metadata.

## Brand a assety

- `ManifestDesignKájovo.md` je brand SSOT.
- `brand/` drží kanonické exporty loga a signace.
- `signace/` drží root kopii signace používanou guardy a UI asset pipeline.
- `brand/panel/*.png` jsou rastrové podklady panelů.

## Dokumentace

- `docs/` je current-state dokumentace.
- `docs/archive/` drží historické audity, jednorázové výstupy a archiv vyřazených kořenových artefaktů.
- README v jednotlivých aplikacích a balíčcích mají být stručné a odkazovat do `docs/`, ne duplikovat provozní informace.

## Legacy a evidence

- `legacy/hotel-backend` a `legacy/hotel-frontend` zůstávají read-only evidence.
- `docs/LEGACY_README.md` a `docs/legacy-inventory.md` popisují hranici mezi current-state a legacy obsahem.

## Co do repozitáře nepatří

- build výstupy (`build/`, `dist/`, `android/**/build/`, `apps/*/test-results/`),
- cache (`node_modules/`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/`, `.tmp/`),
- jednorázové auditní logy a dodávková shrnutí v kořeni,
- duplicitní binární podklady, pokud už existuje archivní nebo kanonická kopie.
