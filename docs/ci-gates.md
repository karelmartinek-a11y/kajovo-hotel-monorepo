# CI guardy

Tento dokument popisuje current-state blokující kontroly pro branch `main`.

## 1. Autorita

Pokud se dokument rozchází s workflow nebo skripty, přednost mají:

- `.github/workflows/*.yml`
- `package.json`
- `scripts/check_android_release_integrity.py`
- `scripts/check_runtime_integrity.mjs`
- `scripts/check_mojibake.py`

## 2. Lokální guardy

### `pnpm ci:gates`

Aktuálně skládá:

1. `pnpm ci:tokens`
2. `pnpm ci:brand-assets`
3. `pnpm ci:signage`
4. `pnpm ci:text-integrity`
5. `pnpm ci:frontend-manifest`
6. `pnpm ci:policy-test`
7. `pnpm ci:android-release-integrity`
8. `pnpm ci:android-smoke`
9. `pnpm ci:runtime-integrity`
10. `pnpm ci:web-smoke`
11. `pnpm ci:visual`

### Další blokující příkazy

- `pnpm ci:policy`
- `pnpm contract:check`
- `pnpm typecheck`
- `pnpm unit`
- `pnpm ci:e2e-smoke`

## 3. GitHub Actions

### `CI Gates - KajovoHotel`

Hlavní blokující workflow pro merge a deploy.

Kryje zejména:

- typecheck
- build webu a adminu
- backend testy
- release gate
- parity a brand guardy
- Android release integrity
- Android smoke
- web smoke
- visual běhy
- admin smoke

### `CI Full - Kajovo Hotel`

Širší regresní běh nad rámec hlavní gate.

### `CI Release - Kajovo Hotel`

Release vrstva navázaná na buildy a produkční release tok.

### `Deploy - hotel.hcasc.cz`

Nasazení až po úspěšném průchodu blokujících gate.

## 4. Co guardy explicitně hlídají

- drift v textových souborech a mojibake
- přítomnost povinných brand assetů a signace
- drift mezi routami, manifesty a runtime realitou
- drift mezi API kontraktem a sdíleným klientem
- drift mezi Android release manifestem, veřejnou APK a live API
- neporušení parity mezi webem a Androidem
