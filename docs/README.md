# Dokumentace KajovoHotel

Tento adresář je hlavní zdroj dokumentace pro vývoj, provoz, audit a release rozhodnutí portálu `hotel.hcasc.cz`.

## Začít zde

- `docs/developer-handbook.md` - stručný onboarding pro vývojáře bez přímého přístupu na server
- `docs/how-to-run.md` - lokální spuštění API, adminu a webu
- `docs/how-to-deploy.md` - produkční deploy a fallback postup
- `docs/ci-gates.md` - popis CI gate kontrol
- `docs/release-checklist.md` - release checklist

## Aktivní závazné dokumenty

- `docs/Kajovo_Design_Governance_Standard_SSOT.md` - jediný závazný dokument pro značku, UI, ergonomii a pravidla finálnosti výstupu
- `docs/forensics/runtime-truth-ssot-2026-03-15.md` - jediný aktivní forenzní audit runtime pravdivosti, simulací, bootstrap vrstev a otevřených nálezů
- `docs/forensics/bootstrap-and-simulation-inventory-2026-03-15.md` - autoritativní inventář test-only simulací, compat vrstev a legitimních bootstrap domén
- `docs/forensics/live-proof-backlog-2026-03-15.md` - autoritativní backlog k položkám parity matrix, které ještě nemají live runtime důkaz
- `docs/feature-parity-matrix.csv` - maticové srovnání legacy vs. monorepo a rozsahu reálně doložené parity
- `docs/forensics/finalization-log.md` - chronologický pracovní log; není autoritativní verdict

## Historické auditní dokumenty

Historické closeout a remediation dokumenty, které normalizovaly mock nebo fallback režimy jako přijatelnou evidenci, byly z repozitáře odstraněné.
Za current-state zdroj se považují pouze aktivní SSOT dokumenty uvedené výše.

## Provozní dokumentace

- `docs/cutover-plan.md`
- `docs/cutover-runbook.md`
- `docs/disaster-recovery.md`
- `docs/observability.md`
- `docs/test-accounts.md`

## Závazná design pravidla

- `docs/Kajovo_Design_Governance_Standard_SSOT.md` je závazná norma pro brand, UI, ergonomii a release blokace
- `ManifestDesignKájovo.md` je podřízený technický a assetový dokument, nikoliv nadřazené governance SSOT
