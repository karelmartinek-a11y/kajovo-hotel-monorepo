# Verification — 03-visual-states-fix

## Co bylo cílem

- Opravit pád web testů ve visual states sweep:
  - `[phone] ... reports-list loading/empty/error state snapshot desktop`
- Zabránit tomu, aby phone/tablet/desktop Playwright projekt vykonával snapshot assert pro jinou viewport variantu.

## Jak ověřeno

1. Kontrola testového souboru:
   - `apps/kajovo-hotel-web/tests/visual.spec.ts`
   - Očekávání: testy v viewport smyčkách mají guard `if (testInfo.project.name !== viewport.name) return;`.

2. Typecheck web projektu:
   - `pnpm -C apps/kajovo-hotel-web lint`
   - Očekávání: `tsc --noEmit` bez chyb.

## Co se změnilo

- `apps/kajovo-hotel-web/tests/visual.spec.ts`
  - přidán project/viewport guard do viewport-smyček (dashboard/breakfast utility snapshots + states sweep snapshots),
  - guard zajistí, že test běží jen pro odpovídající Playwright project (`phone|tablet|desktop`).
- `docs/regen/parity/parity-map.yaml`
  - přidán modul `web_visual_snapshot_project_scope` se stavem `DONE`.

## Rizika / known limits

- Guard je aplikační ochrana proti cross-project snapshot assertions; neřeší případné vizuální rozdíly uvnitř stejné platformy.
- Plné E2E spuštění v tomto prostředí může být omezeno dostupností Playwright browser artifactů.
