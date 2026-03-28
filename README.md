# Kájovo Hotel Monorepo

Tento repozitář je autoritativní zdroj pravdy pro web, admin, API, sdílené balíčky, branding a nativní Android aplikaci Kájovo Hotel.

## Co je v repozitáři

- `apps/kajovo-hotel-web`: provozní portál pro role `recepce`, `pokojská`, `údržba`, `snídaně` a `sklad`
- `apps/kajovo-hotel-admin`: admin rozhraní nad stejným API a RBAC kontraktem
- `apps/kajovo-hotel-api`: FastAPI backend
- `packages/shared`: sdílené typy, RBAC a generovaný klient
- `packages/ui`: sdílený UI shell a komponenty
- `android`: samostatný nativní Android projekt s release manifestem v `android/release/android-release.json`
- `apps/kajovo-hotel` a `brand`: design tokeny, IA, branding a exportované assety
- `legacy`: historické zdroje jen pro referenci, ne pro nový vývoj

## Dokumentace

Aktivní current-state dokumentace je centralizovaná v `docs/`.

- `docs/README.md`: rozcestník a pravidla autority
- `docs/developer-handbook.md`: orientace v repo a povinné kontroly
- `docs/how-to-run.md`: lokální spuštění všech aktivních částí
- `docs/how-to-deploy.md`: produkční deploy a release workflow
- `docs/testing.md`: testovací vrstvy a doporučené lokální běhy
- `docs/ci-gates.md`: blokující CI guardy a parity kontroly
- `docs/release-checklist.md`: release checklist pro web, admin, API i Android

Archivní a forenzní materiály jsou v `docs/archive/`.

## Autorita designu a Androidu

- Aktivní current-state designová autorita je `docs/Kajovo_Design_Governance_Standard_SSOT.md`.
- `ManifestDesignKájovo.md` zůstává v repozitáři jako sekundární historický dokument, ne jako hlavní current-state SSOT.
- Aktivní Android provozní dokumentace je `android/README_ANDROID.md`.
