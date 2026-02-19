# ADR záznamy (forensics 00)

## ADR-0001: Legacy baseline je závazný rozsah, ne implementační zdroj
- **Status:** Accepted
- **Kontext:** Je nutné dosáhnout parity bez kopírování legacy implementace.
- **Rozhodnutí:** Legacy frontend/backend je používán jen read-only forenzně pro odvození route/API/data/RBAC kontraktu.
- **Důsledky:** Všechny další PR budou cleanroom; parity se dokládá testy a mapami, ne přebraným kódem.
- **Riziko:** Nejasné rohy chování bez přímé replikace.
- **Mitigace:** Explicitní mapy + UAT scénáře + decision log.

## ADR-0002: Primární parity kotva je backend runtime route surface
- **Status:** Accepted
- **Kontext:** Legacy frontend je syncovaný do backendu, runtime route pravda je v backendu.
- **Rozhodnutí:** Route/API inventory se odvozuje primárně z `legacy/hotel-backend/app/web/*` a `app/api/*`.
- **Důsledky:** Menší riziko falešných cest z neaktivních template artefaktů.
- **Riziko:** Některé frontend-only náznaky mohou zůstat mimo mapu.
- **Mitigace:** Křížová kontrola s `legacy/hotel-frontend/templates/*`.

## ADR-0003: Device provisioning je parity-critical
- **Status:** Accepted
- **Kontext:** Legacy obsahuje explicitní register/status/challenge/verify model.
- **Rozhodnutí:** Tento tok bude samostatný implementační milestone před plným reports workflow.
- **Důsledky:** Lepší bezpečnostní návaznost pro ingest/reporting.
- **Riziko:** Kryptografická implementace prodlouží harmonogram.
- **Mitigace:** Izolované integrační testy + feature flag rollout.

## ADR-0004: Breakfast import zůstane oddělený od běžného CRUD
- **Status:** Accepted
- **Kontext:** Legacy breakfast je provozně řízen import pipeline + denní operace.
- **Rozhodnutí:** Nová architektura zachová importní/scheduler komponentu odděleně od UI CRUD vrsty.
- **Důsledky:** Přehlednější provozní diagnostika a menší coupling.
- **Riziko:** Více moving parts při deploy.
- **Mitigace:** Observability a health checks na úrovni pipeline.

## ADR-0005: Současný monorepo stav není release baseline
- **Status:** Accepted
- **Kontext:** Část checků projde, ale E2E gate nejsou v prostředí validované (browser binárky chybí).
- **Rozhodnutí:** Považovat stav za pracovní draft, ne produkční parity baseline.
- **Důsledky:** Povinné doplnění CI execution prostředí a gate průchodu v navazujících PR.
- **Riziko:** Falešný pocit hotovosti z lokálně průchozích lint/contract checků.
- **Mitigace:** Tvrdé branch protection na CI gates.
