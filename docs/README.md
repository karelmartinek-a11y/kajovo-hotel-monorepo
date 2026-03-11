# Dokumentace KajovoHotel

Tento adresar je hlavni zdroj dokumentace pro vyvoj, provoz a audit portalu `hotel.hcasc.cz`.

## Zacit zde

- `docs/developer-handbook.md` - onboarding pro vyvojare bez pristupu na server
- `docs/how-to-run.md` - lokalni spusteni API, admin a web
- `docs/how-to-deploy.md` - produkcni deploy a fallback postup
- `docs/ci-gates.md` - popis CI gate kontrol
- `docs/release-checklist.md` - release checklist

## Aktualni auditni source of truth

- `docs/forensic-audit-2026-03-11-current-state.md` - aktualni current-state forenzni audit
- `docs/feature-parity-matrix.csv` - aktualni parity matice legacy vs monorepo
- `docs/parity-verdict.md` - aktualni rozhodnuti continue vs regenerate
- `docs/rbac.md` - aktualni session-backed auth a RBAC model

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
