# ORF-09 Prompt 14/15 – release checklist

## Gate 0: Documentation completeness
- [x] Primární cutover runbook existuje: `docs/runbook/cutover.md`.
- [x] Closeout parity verdict existuje: `docs/regen/15-closeout/parity-verdict.md`.
- [x] Verification evidence existuje: `docs/regen/15-closeout/verification.md`.

## Gate 1: Quality gates
- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm unit`

## Gate 2: Parity governance
- [x] `docs/regen/parity/parity-map.yaml` má pro každý modul stav `DONE` nebo `BLOCKED`.
- [x] Každý modul obsahuje `links` s ověřovacím odkazem.
- [x] BLOCKED položky jsou explicitně uvedené v parity verdictu.

## Gate 3: Cutover readiness
- [x] Rollback příkazy jsou dostupné pro každý kritický krok runbooku.
- [x] Ověření po switchi je měřitelné (`health`, `ready`, `healthz`, smoke).
- [x] Monitoring plan (logs + error-rate) je součástí runbooku.

## GO/NO-GO rozhodnutí
- **GO podmínka:** všechny checkboxy výše splněné a BLOCKED položky explicitně akceptované release ownerem.
- **NO-GO podmínka:** jakýkoliv nesplněný quality gate nebo neakceptovaný BLOCKED modul.
