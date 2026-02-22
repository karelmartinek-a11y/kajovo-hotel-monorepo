# ORF-15 Nav tablet initial state fix Verification

## A) Cíl

Opravit flaky/failing web test `tablet collapses earlier and keeps overflow available` stabilizací počátečního media-state v `ModuleNavigation`.

## B) Exit criteria

- `ModuleNavigation` neinitializuje phone/tablet stav na `false`, ale z aktuálního `matchMedia`.
- Nedochází k prvnímu renderu v desktop režimu na tablet viewportu.
- `pnpm lint`, `pnpm typecheck`, `pnpm unit` prochází.

## C) Změny

- `packages/ui/src/navigation/ModuleNavigation.tsx`:
  - přidána utilita `mediaMatches(query)`.
  - `isPhone`/`isTablet` state inicializován lazy funkcí z `matchMedia` místo fixního `false`.

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- WARNING (env blocker): `pnpm --filter @kajovo/kajovo-hotel-web test -- tests/nav-robustness.spec.ts --project=tablet` (lokálně nelze spustit bez Playwright browser binary; CI má install krok)

## E) Rizika / known limits

- Lokální e2e verifikace v tomto prostředí je blokovaná chybějícím Playwright browser balíkem.

## F) Handoff pro další prompt

- Pokud se upraví breakpoint logika nav, ověřit `tests/nav-robustness.spec.ts` na phone/tablet/desktop projektech.
