# 16 – Audit kaskády promptů a recovery plán

## Kontext
Tento dokument hodnotí průběh kaskády promptů 00–15 vůči aktuálním artefaktům v repozitáři.
Zdroj hodnocení: `docs/regen/**`, `docs/regen/parity/parity-map.yaml`, `.github/workflows/**`, `git log`.

## Souhrn
- Prompty **00–02** jsou implementované a evidenčně podchycené.
- Prompty **03–15** nejsou dokončené jako konzistentní série; část obsahu je dodaná mimo plánované číslování/slugs (`04-auth-foundation`, `05-admin-users`, `01/02/...-fix`).
- CI guardrails existují, ale historicky se opravovaly až post-merge několika follow-up commity, což potvrzuje nestabilní první průchody.
- Největší blokery parity: **oddělení Admin/Portal aplikací**, **RBAC server-side hardening**, **SMTP + hint email real delivery**, **stabilní e2e smoke pro kritické auth flows**, **runbook closeout 14–15**.

## Stav promptů 00–15 (forenzní hodnocení)

| Prompt | Stav | Důkaz v repo | Kvalita výstupu |
|---|---|---|---|
| 00 forensics | SPLNĚNO | `docs/regen/00-forensics/*`, parity mapa vytvořena | Dobrá evidence, konzistentní SSOT mapa |
| 01 guardrails | SPLNĚNO s follow-upy | `docs/regen/01-guardrails/verification.md`, `ci-gates.yml`, policy skripty | Funkční, ale původní iterace měly CI pády (nutné 3 follow-up sekce) |
| 02 design foundation | SPLNĚNO ČÁSTEČNĚ | `docs/regen/02-design-foundation/*`, signage testy | Implementace je, ale verification hlásí environment limit Playwright instalace |
| 03 monorepo structure | CHYBÍ / neuzavřeno | není `docs/regen/03-monorepo-structure/*`; jen `03-visual-states-fix` | Není splněn cíl separátních apps `web/admin/api` |
| 04 portal routes | ČÁSTEČNĚ mimo plán | utility/router jsou ve webu; není `docs/regen/04-portal/*` | Chybí formální IA coverage report |
| 05 admin shell | ČÁSTEČNĚ mimo plán | existuje admin users route, ale není `05-admin-shell` | Chybí explicitní admin shell doklad proti panel mapě |
| 06 api foundation | ČÁSTEČNĚ | health endpointy + observability existují | Chybí krokový verification balíček `06-api-foundation` |
| 07 auth model | ČÁSTEČNĚ | `docs/regen/04-auth-foundation/*` + auth endpointy | Číslování mimo plán; hint email zatím disabled SMTP mode |
| 08 RBAC | CHYBÍ (hardening) | základní RBAC je v API | Chybí dedikovaný krok + server-side coverage důkaz pro všechny admin endpointy |
| 09 admin users | SPLNĚNO ČÁSTEČNĚ | `docs/regen/05-admin-users/*`, API + UI users | Dodáno funkčně, ale mimo plánované číslo a bez navazujícího prompt chainu |
| 10 SMTP | CHYBÍ | není `docs/regen/10-smtp/*` | Blokuje plnohodnotný hint email flow |
| 11 media auth | CHYBÍ | bez evidence kroku 11 | Nehotovo |
| 12 UX polish | CHYBÍ | bez evidence kroku 12 | Nehotovo |
| 13 CI stabilizace | ČÁSTEČNĚ | více fix commitů Playwright/CI | Chybí jednotný krok `13-ci-tests` s finální deterministic evidencí |
| 14 cutover runbook | CHYBÍ (v nové struktuře) | jsou starší runbook docs, ale ne `docs/regen/14-cutover/*` | Chybí sjednocený exekuovatelný krokový runbook dle zadání |
| 15 closeout | CHYBÍ | nejsou `docs/regen/15-closeout/*` | Nehotovo |

## Hlavní příčiny nízké úspěšnosti promptů
1. **Drift číslování a namingu artefaktů**: některé věci jsou hotové, ale pod jiným číslem/slugs, což rozbíjí audit trail.
2. **Příliš velké PR scope**: po merge následovaly rychlé fix commity, místo stabilního single-pass PR.
3. **CI validace až po merge**: guardrails workflow bylo potřeba opakovaně opravovat.
4. **Smíšené cíle v jednom entrypointu webu**: `admin_portal_split` je stále `MISSING` v parity mapě.
5. **Nedeterministická lokální verifikace**: Playwright/browser env rozdíly a API test fixture start přes `uvicorn` je citlivý na cwd/runtime.

## Recovery strategie (doporučený postup)

### Fáze A – Stabilizace procesních pravidel (1 PR)
1. Zavést **single source progress tracker**: `docs/regen/progress.md` (Prompt 00–15: owner, stav, odkazy).
2. Zpřísnit verification šablonu: povinně sekce `exit criteria`, `failed checks`, `open risks`, `next prompt handoff`.
3. Přidat CI check na konvenci adresářů `docs/regen/<NN>-<slug>/verification.md` pouze pro nové kroky (NN 00–15 nebo vyšší maintenance).

### Fáze B – Architektura parity blokerů (3 PR)
4. **Prompt 03 restart**: vytvořit separátní app entry pro Admin (`apps/kajovo-hotel-admin`) a oddělit portal/admin routes bez sdílení page/view.
5. **Prompt 06+08 konsolidace**: API foundation + RBAC hardening jako samostatné, malé PR s endpoint coverage testy.
6. **Prompt 10**: SMTP settings + jednotný mail service + reálné napojení hint flow.

### Fáze C – Funkční parity a releasovatelnost (4 PR)
7. Prompt 04/05 dokončit evidenčně (route coverage + admin nav-map + panel compliance).
8. Prompt 11/12: media auth + UX polish (odstranění placeholderů, empty/error/loading stavů).
9. Prompt 13: deterministické Playwright smoke scénáře (admin login, hint email mock, user create + portal login).
10. Prompt 14/15: cutover runbook + finální parity verdict + release checklist.

## Definice „hotovo“ pro další kola
- Každý prompt má svůj `docs/regen/<NN>-<slug>/verification.md`.
- `docs/regen/parity/parity-map.yaml` je aktualizována v každém PR.
- PR nesmí obsahovat „this-pr“ placeholder odkazy; pouze konkrétní PR/commit reference.
- Žádný prompt se neuzavírá, pokud nejsou splněny minimálně: lint + typecheck + unit.

