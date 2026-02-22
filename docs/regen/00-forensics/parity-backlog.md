# Parity backlog (prioritizované GAPy a rizika)

## P0 (kritické)

1. **Admin vs Portal split není implementován**
   - GAP: chybí separátní login stránky (`/admin/login` vs `/portal/login`) a separátní app-entry/router.
   - Riziko: porušení závazné separace Admin/Portal UI a panelového zadání.
   - Návrh: zavést `src/admin/*` a `src/portal/*` s oddělenými route stromy a vlastními page komponentami.

2. **Panel brand zadání není plně mapované na existující view**
   - GAP: `brand/panel/login_admin*`, `brand/panel/login_user_fail`, `brand/panel/menu_pokojska*` nemají 1:1 implementační route/view.
   - Riziko: neakceptovatelné UX odchylky vůči vizuálním podkladům.
   - Návrh: vynutit mapovací matici v CI (panel asset -> route/view snapshot).

## P1 (vysoké)

3. **Autorizace je jen částečně sladěná se zadáním „user management only“**
   - GAP: aktuální RBAC je header-based, bez kompletního admin user-management flow.
   - Riziko: nesoulad s cílovým provozním modelem účtů.
   - Návrh: doplnit backend/UI tok správy uživatelů v admin menu a explicitní email-as-username policy.

4. **Reset hesla admina (hint-only) není forenzně doložen v novém systému**
   - GAP: chybí jasná implementační stopa behavioru „nezměnit heslo, jen poslat hint“.
   - Riziko: porušení závazného bezpečnostního pravidla.
   - Návrh: doplnit explicitní endpoint/use-case + test + dokumentaci v `docs/regen`.

## P2 (střední)

5. **Parity evidence je roztříštěná mezi historické docs**
   - GAP: starší parity dokumenty mají odlišné závěry/statusy.
   - Riziko: nejednoznačnost rozhodování při dalších krocích regen.
   - Návrh: používat `docs/regen/parity/parity-map.yaml` jako jediný deterministický index stavu.

6. **Nedostatečná trasovatelnost panel->route->test**
   - GAP: chybí jednotná tabulka s odkazy na testy/screenshoty pro každý panel podklad.
   - Riziko: obtížné release-go/no-go rozhodnutí.
   - Návrh: přidat navazující artefakt `docs/regen/01-parity/panel-traceability.md`.

## Potvrzené „out of scope / dropped“

- **Device modul: DROPPED**
- **Entity ID flow: DROPPED**
- Ověření: v novém cíli nejsou `/device/*` endpointy ani `Device` entita.
