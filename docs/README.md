# Dokumentace KajovoHotel

Tento adresar je hlavni zdroj dokumentace pro vyvoj, provoz a audit portalu `hotel.hcasc.cz`.

## Zacit zde

- `docs/developer-handbook.md` - onboarding pro vyvojare bez pristupu na server
- `docs/how-to-run.md` - lokalni spusteni API, admin a web
- `docs/how-to-deploy.md` - produkcni deploy a fallback postup
- `docs/ci-gates.md` - popis CI gate kontrol
- `docs/release-checklist.md` - release checklist

## Aktualni auditni source of truth

- `docs/SSOT_SCOPE_STATUS.md` — jediný autoritativní status/scope dokument.
- `docs/forensics/finalization-log.md` — průběžný pracovní forenzní log finalizace.
- `docs/feature-parity-matrix.csv` — maticové srovnání legacy vs. monorepo.
- `docs/forensics/` — důkazní implementační a closure dokumenty.

## Historicke auditni dokumenty

Tyto soubory jsou dulezite jako casova stopa, ale nejsou current-state SSOT:

- `docs/forensic-audit-2026-03-11-deep.md`
- `docs/remediation-plan-2026-03-11-by-module.md`
- `docs/remediation-task-breakdown-2026-03-11.md`
- starsi unorne a breznove auditni reporty

## Provozni dokumentace

- `docs/cutover-plan.md`
- `docs/cutover-runbook.md`
- `docs/disaster-recovery.md`
- `docs/observability.md`
- `docs/test-accounts.md`

## Zavazna design pravidla

- root soubor `ManifestDesignKajovo.md` je SSOT a je kontrolovany CI gate
