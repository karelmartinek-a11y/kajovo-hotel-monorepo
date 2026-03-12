# Dokumentace KájovoHotel

Tento adresář je **hlavní zdroj dokumentace** pro vývoj, provoz a audit portálu `hotel.hcasc.cz`.

## Začít zde

- `docs/developer-handbook.md` — kompletní onboarding pro vývojáře bez přístupu na server.
- `docs/how-to-run.md` — lokální spuštění (API, admin, web).
- `docs/how-to-deploy.md` — produkční deploy přes GitHub Actions a fallback postup.
- `docs/ci-gates.md` — popis CI gate kontrol.
- `docs/release-checklist.md` — release checklist.

## Forenzní a parity dokumentace

- `docs/SSOT_SCOPE_STATUS.md` — jediný autoritativní status/scope dokument.
- `docs/forensics/finalization-log.md` — průběžný pracovní forenzní log finalizace.
- `docs/feature-parity-matrix.csv` — maticové srovnání legacy vs. monorepo.
- `docs/forensics/` — důkazní implementační a closure dokumenty.

## Provozní dokumentace

- `docs/cutover-plan.md`, `docs/cutover-runbook.md`
- `docs/disaster-recovery.md`
- `docs/observability.md`
- `docs/test-accounts.md`

## Závazná pravidla designu

- Root soubor `ManifestDesignKájovo.md` je SSOT a je kontrolovaný CI gate.
