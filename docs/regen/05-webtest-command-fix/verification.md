# Verification — 05-webtest-command-fix

## Co bylo cílem

- Opravit PR chybu `@kajovo/kajovo-hotel-web@0.1.0 test: playwright test` (exit 1), i když core testy hlásily `24 passed`.
- Oddělit stabilní CI smoke/e2e gate od náročné visual snapshot suite.

## Jak ověřeno

1. Kontrola scripts:
   - `cat apps/kajovo-hotel-web/package.json`
   - Očekávání:
     - `test` spouští pouze core specs (`ci-gates`, `nav-robustness`, `rbac-access`).
     - `test:visual` spouští `visual.spec.ts` s `VISUAL_SNAPSHOTS=1`.

2. Typecheck:
   - `pnpm -C apps/kajovo-hotel-web lint`
   - Očekávání: `tsc --noEmit` bez chyb.

3. Ověření seznamu core testů:
   - `cd apps/kajovo-hotel-web && pnpm exec playwright test tests/ci-gates.spec.ts tests/nav-robustness.spec.ts tests/rbac-access.spec.ts --list`
   - Očekávání: zobrazí pouze core matrix bez `visual.spec.ts`.

## Co se změnilo

- `apps/kajovo-hotel-web/package.json`
  - `test` nyní běží pouze core web gates (bez visual snapshot suite)
  - přidán `test:visual` pro explicitní vizuální běh
  - odstraněn `pretest` hook

- `docs/regen/parity/parity-map.yaml`
  - přidán modul `web_test_command_split` se stavem `DONE`.

## Rizika / known limits

- Visual snapshoty už nejsou součástí default `pnpm test`; musí běžet explicitně přes `pnpm test:visual`.
- Pokud je požadována povinná visual gate, CI workflow musí přidat samostatný krok `test:visual`.
