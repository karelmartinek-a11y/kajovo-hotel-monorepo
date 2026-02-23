# ORF-09 Prompt 14/15 closeout – verification

## A) Cíl
- Uzavřít closeout dokumentaci pro release readiness s auditovatelným cutover runbookem, parity verdictem a checklistem.
- Dorovnat parity mapu tak, aby každý modul měl stav `DONE`/`BLOCKED` a ověřovací link.

## B) Exit criteria
- `docs/runbook/cutover.md` je primární runbook se strukturou krok/příkaz/očekávaný výsledek/rollback.
- Existují dokumenty:
  - `docs/regen/15-closeout/parity-verdict.md`
  - `docs/regen/15-closeout/release-checklist.md`
  - `docs/regen/15-closeout/verification.md`
- `docs/regen/parity/parity-map.yaml` obsahuje pouze statusy `DONE|BLOCKED` a každý modul má `links`.

## C) Změny
- Přidán primární runbook: `docs/runbook/cutover.md`.
- Přidán closeout parity verdict: `docs/regen/15-closeout/parity-verdict.md`.
- Přidán release checklist: `docs/regen/15-closeout/release-checklist.md`.
- Aktualizována parity mapa (`docs/regen/parity/parity-map.yaml`):
  - normalizace statusů na `DONE|BLOCKED`,
  - doplnění `links` u všech modulů na closeout parity verdict anchor.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `python - <<'PY'\nimport yaml, pathlib\np=pathlib.Path('docs/regen/parity/parity-map.yaml')\nd=yaml.safe_load(p.read_text())\nmods=d['modules']\nassert all(m.get('status') in {'DONE','BLOCKED'} for m in mods)\nassert all(isinstance(m.get('links'), list) and len(m['links'])>0 for m in mods)\nprint('modules', len(mods))\nPY`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`

## E) Rizika/known limits
- Tři moduly zůstávají `BLOCKED` (záměrné architektonické omezení nebo nedořešená CI stabilizace) a vyžadují explicitní release akceptaci.
- Ověřovací odkazy v parity mapě míří na closeout verdict anchors; při přejmenování sekcí je nutné anchor linky aktualizovat.

## F) Handoff pro další prompt
- Potvrdit release-owner signoff pro `BLOCKED` položky uvedené v `parity-verdict.md`.
- V případě odblokování modulu `ci_e2e_smoke_auth_stabilization` připravit samostatný fix-only prompt a změnit status na `DONE`.
