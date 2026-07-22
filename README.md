# Kájovo Hotel Monorepo

Tento repozitář je autoritativní zdroj pravdy pro web, admin, API, sdílené balíčky a branding Kájovo Hotel.

## Co je v repozitáři

- `apps/kajovo-hotel-web`: provozní portál pro role `recepce`, `pokojská`, `údržba`, `snídaně` a `sklad`
- `apps/kajovo-hotel-admin`: admin rozhraní nad stejným API a RBAC kontraktem
- `apps/kajovo-hotel-api`: FastAPI backend
- `packages/shared`: sdílené typy, RBAC a generovaný klient
- `packages/ui`: sdílený UI shell a komponenty
- `apps/kajovo-hotel` a `brand`: design tokeny, IA, branding a exportované assety
- `infra`: compose, reverse proxy, smoke a deploy verifikace

## Dokumentace

Aktivní current-state dokumentace je centralizovaná v `docs/`.

- `docs/README.md`: rozcestník a pravidla autority
- `docs/SSOT_CURRENT.md`: kanonický current-state přehled architektury a provozu
- `docs/current-state-manifest.yaml`: strojově čitelný manifest aktivních aplikací, workflow a validací
- `docs/developer-handbook.md`: orientace v repo a povinné kontroly
- `docs/how-to-run.md`: lokální spuštění všech aktivních částí
- `docs/how-to-deploy.md`: produkční deploy a release workflow
- `docs/testing.md`: testovací vrstvy a doporučené lokální běhy
- `docs/ci-gates.md`: blokující CI guardy a parity kontroly
- `docs/release-checklist.md`: release checklist pro web, admin a API

## Autorita designu a provozu

- Aktivní current-state designová autorita je `docs/Kajovo_Design_Governance_Standard_SSOT.md`.
- Provozní a architektonická current-state autorita je v `docs/SSOT_CURRENT.md` a `docs/current-state-manifest.yaml`.
