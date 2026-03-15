# Dokumentace KajovoHotel

Tento adresář je hlavní zdroj dokumentace pro vývoj, provoz, audit a release rozhodnutí portálu `hotel.hcasc.cz`.

## Začít zde

- `docs/developer-handbook.md` - onboarding pro vývojáře bez přístupu na server
- `docs/how-to-run.md` - lokální spuštění API, admin a web
- `docs/how-to-deploy.md` - produkční deploy a fallback postup
- `docs/ci-gates.md` - popis CI gate kontrol
- `docs/release-checklist.md` - release checklist

## Aktivní závazné dokumenty

- `docs/Kajovo_Design_Governance_Standard_SSOT.md` - jediný závazný dokument pro značku, UI, ergonomii a pravidla finálnosti výstupu
- `docs/forensics/runtime-truth-ssot-2026-03-15.md` - jediný aktivní forenzní audit runtime pravdivosti, simulací, bootstrap vrstev a otevřených nálezů
- `docs/feature-parity-matrix.csv` - maticové srovnání legacy vs. monorepo a rozsahu reálně doložené parity
- `docs/forensics/finalization-log.md` - chronologický pracovní log; není autoritativní verdict

## Historické auditní dokumenty

Tyto soubory jsou důležité jako časová stopa, ale nejsou current-state SSOT:

- `docs/forensic-audit-2026-03-11-deep.md`
- `docs/remediation-plan-2026-03-11-by-module.md`
- `docs/remediation-task-breakdown-2026-03-11.md`
- starší únorové a březnové auditní reporty

Staré closeout dokumenty byly z repozitáře odstraněné, aby nevytvářely falešný dojem uzavřeného stavu.

## Provozní dokumentace

- `docs/cutover-plan.md`
- `docs/cutover-runbook.md`
- `docs/disaster-recovery.md`
- `docs/observability.md`
- `docs/test-accounts.md`

## Závazná design pravidla

- `docs/Kajovo_Design_Governance_Standard_SSOT.md` je závazná norma pro brand, UI, ergonomii a release blokace
- `ManifestDesignKájovo.md` je podřízený technický a assetový dokument, nikoliv nadřazené governance SSOT
