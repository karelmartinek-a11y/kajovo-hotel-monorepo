# Prompt 19 – playwright binaries on main

## A) Cíl
- Zajistit, aby web testy nepoužívaly WebKit na `tablet` projektu, protože CI instaluje pouze Chromium binárky.

## B) Exit criteria
- `apps/kajovo-hotel-web/playwright.config.ts` má pro `tablet` explicitně `browserName: 'chromium'`.
- PR obsahuje verifikační dokument podle CI guardrail pravidel.

## C) Změny
- V `apps/kajovo-hotel-web/playwright.config.ts` doplněno `browserName: 'chromium'` do `tablet` projektu.
- Přidán tento verifikační dokument.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm --filter @kajovo/kajovo-hotel-web lint`
- PASS: `pnpm --filter @kajovo/kajovo-hotel-web exec playwright test tests/ci-gates.spec.ts --project=tablet --list`
- PASS: `pnpm --filter @kajovo/kajovo-hotel-admin exec playwright test -c playwright.smoke.config.ts --list`

## E) Rizika/known limits
- `CI Full` na `main` má i další dlouhodobé nebinárkové failury (API/contract), které nejsou součástí tohoto fixu.

## F) Handoff pro další prompt
- Po merge spustit rerun CI a ověřit, že web tablet testy už nechtějí WebKit binárku (`webkit/pw_run.sh`).
