# Dokumentace Kajovo Hotel

Adresář `docs/` je centrální rozcestník current-state dokumentace pro web, admin, API, Android, CI a produkční provoz.

## Začít zde

- `docs/SSOT_SCOPE_STATUS.md`: co je autoritativní current-state dokumentace a co je pouze historická evidence.
- `docs/repository-map.md`: forenzní mapa repozitáře po úklidu.
- `docs/developer-handbook.md`: rychlý onboarding do monorepa.
- `docs/how-to-run.md`: lokální spuštění webu, adminu, API a Androidu.
- `docs/testing.md`: lokální testy, Playwright vrstvy a minimální kontrolní sada.
- `docs/how-to-deploy.md`: produkční deploy a release evidence.
- `docs/ci-gates.md`: skutečné blokující guardy v CI.

## Current-state autority

- `docs/Kajovo_Design_Governance_Standard_SSOT.md`: brand, UI integrita a design governance.
- `docs/rbac.md`: role, scope a oprávnění.
- `docs/release-checklist.md`: release a deploy checklist včetně Android parity.
- `android/README_ANDROID.md`: current-state Android provozní a release pravidla.
- `android/release/android-release.json`: jediný zdroj pravdy pro Android release metadata.

## Vývoj a provoz

- `docs/how-to-run-web.md`
- `docs/how-to-run-api.md`
- `docs/how-to-run-smoke.md`
- `docs/testing.md`
- `docs/how-to-deploy.md`
- `docs/how-to-deploy-staging.md`
- `docs/observability.md`
- `docs/disaster-recovery.md`
- `docs/test-accounts.md`

## Doménové dokumenty

- `docs/module-snidane.md`
- `docs/module-ztraty-a-nalezy.md`
- `docs/module-zavady.md`
- `docs/module-sklad.md`
- `docs/module-reports.md`
- `docs/api-contract.md`
- `docs/pdf-export-import.md`

## Historická evidence

- `docs/archive/README.md`
- `docs/archive/docs-history/*`
- `docs/archive/android-history/*`
- `docs/archive/root-audits/*`

Historické forenzní a auditní dokumenty zůstávají v archivu jako evidence, ale nejsou samy o sobě current-state autoritou. Pokud jsou v rozporu s current-state dokumenty uvedenými výše, platí current-state dokumenty a runtime zdrojové kódy.
