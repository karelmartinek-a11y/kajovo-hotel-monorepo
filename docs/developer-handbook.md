# Developer Handbook

Tento dokument shrnuje current-state minimum pro vývoj v repozitáři bez přímého zásahu na produkční server.

## 1. Zdroje pravdy

- Autoritativní zdroj je tento repozitář a jeho workflow.
- Produkční nasazení vychází z branch `main`.
- Android release metadata mají jediný zdroj pravdy v `android/release/android-release.json`.
- Kopie na serveru je deploy workspace, ne zdroj pravdy.
- Historické materiály v `docs/archive/` a `legacy/` nejsou current-state autorita.

## 2. Aktivní části systému

- `apps/kajovo-hotel-web`: portál pro provozní role
- `apps/kajovo-hotel-admin`: admin panel
- `apps/kajovo-hotel-api`: FastAPI backend
- `packages/shared` a `packages/ui`: sdílený kontrakt, RBAC a UI
- `android`: nativní Android aplikace

## 3. Povinné dokumenty před změnou

- `docs/Kajovo_Design_Governance_Standard_SSOT.md`
- `docs/rbac.md`
- `docs/how-to-run.md`
- `docs/how-to-deploy.md`
- `docs/testing.md`
- `docs/ci-gates.md`
- `docs/release-checklist.md`
- `android/README_ANDROID.md`, pokud změna souvisí s Androidem nebo web-Android paritou

## 4. Povinné technické guardy

Minimální current-state sada před odevzdáním podle typu změny:

```bash
pnpm typecheck
pnpm unit
pnpm contract:check
pnpm ci:policy
pnpm ci:policy-test
pnpm ci:gates
pnpm ci:e2e-smoke
```

Když se mění Python API:

```bash
python -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests
```

Když se mění Android release, APK nebo release metadata:

```bash
python scripts/check_android_release_integrity.py
```

## 5. Repo hygiena

- Textové soubory držet v UTF-8 bez BOM.
- Primární zakončení řádků je LF; výjimky jsou jen Windows skripty.
- Build výstupy, cache, auditní exporty a jednorázové binárky nepatří do gitu.
- Nové dokumenty patří do `docs/`; archivní evidence do `docs/archive/`.

## 6. Parita web a Android

- Každá runtime změna webu musí mít adekvátní runtime změnu Android appky.
- Každá runtime změna Android appky musí mít adekvátní runtime změnu webu.
- Web musí být ověřený pro desktop, tablet i mobil.
- Android musí zůstat plně nativní.
