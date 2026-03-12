# A) Cíl
Zajistit determinismus brand kompozice v shellu (max 2 brand elementy na view) a nahradit pevně zakódované datum v admin service za runtime utilitu `toLocalDateInputValue()` respektující lokální časovou zónu.

# B) Exit criteria
- `AppShell` defaultuje `showFigure = false` a nekompozituje třetí brand element na non-popup views.
- Admin login view obsahuje přesně dva brand elementy (wordmark + figure).
- Formulářové výchozí hodnoty data vycházejí z runtime lokálního dne (žádný hardcoded placeholder `2026-02-19` ani `defaultServiceDate`).
- CI testy (guardrails, lint, unit-tests, e2e-smoke) projdou bez chyb.

# C) Změny
- `packages/ui/src/shell/AppShell.tsx`: výchozí hodnota `showFigure` změněna na `false`.
- `apps/kajovo-hotel-admin/src/main.tsx`: odstraněn duplikátní plovoucí sign, wordmark opatřen `data-brand-element="true"`.
- `apps/kajovo-hotel-admin/src/dateDefaults.ts`: nový soubor s utilitou `toLocalDateInputValue()`.
- `apps/kajovo-hotel-admin/tests/ci-gates.spec.ts`: rozšíření Playwright testů o timezone-aware aserce výchozích dat a počtu brand elementů.
- `docs/forensic-closure-ssot.md`: SSOT dokument mapující nálezy → soubory → testy → done-criteria.

# D) Ověření
- Spustit `pnpm --filter @kajovo/kajovo-hotel-admin lint` a ověřit, že nevznikají chyby.
- Ověřit absenci `defaultServiceDate` a `2026-02-19` v admin zdrojovém kódu (`grep -r defaultServiceDate apps/kajovo-hotel-admin/src`).
- CI pipeline musí projít kompletně: lint, typecheck, unit-tests, e2e-smoke, guardrails.

# E) Rizika/known limits
- Playwright browser artefakty musí být dostupné v CI prostředí; CDN 403 blokuje lokální spuštění.
- Timezone-aware test závisí na systémovém nastavení TZ v CI runneru.

# F) Handoff pro další prompt
Při dalších úpravách brand kompozice udržovat pravidlo max 2 brand elementy na view a aktualizovat ci-gates.spec.ts. Datum-defaulty řešit vždy přes `toLocalDateInputValue()` z `dateDefaults.ts`.
