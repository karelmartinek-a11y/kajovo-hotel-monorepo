# Testing

Tento dokument popisuje current-state testovací vrstvy v repozitáři.

## 1. Lokální příkazy

### Instalace závislostí

```bash
pnpm install
```

### TypeScript a frontend kontrola

```bash
pnpm typecheck
```

### Backend unit testy

```bash
pnpm unit
```

Spouští:

```bash
python -m pytest apps/kajovo-hotel-api/tests
```

### Frontend gate

```bash
pnpm ci:gates
```

Obsah:

- token guard
- brand asset guard
- signage guard
- text integrity guard
- frontend manifest guard
- runtime integrity guard
- web live smoke
- KDGS visual geometry guard pro web i admin

### Admin smoke

```bash
pnpm ci:e2e-smoke
```

### Contract freshness

```bash
pnpm contract:check
```

### API lint

```bash
python -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests
```

## 2. Playwright vrstvy

### Web live smoke

Script:

```bash
pnpm --filter @kajovo/kajovo-hotel-web test
```

nebo

```bash
pnpm --filter @kajovo/kajovo-hotel-web test:smoke
```

Aktuálně běží nad [`apps/kajovo-hotel-web/tests/live-smoke.spec.ts`](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-web/tests/live-smoke.spec.ts).

### Admin smoke

Script:

```bash
pnpm --filter @kajovo/kajovo-hotel-admin test:smoke
```

Aktuálně běží nad [`apps/kajovo-hotel-admin/tests/e2e-smoke.spec.ts`](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-admin/tests/e2e-smoke.spec.ts).

### KDGS visual geometry

Skripty:

```bash
pnpm ci:visual
```

nebo jednotlivě:

```bash
pnpm --filter @kajovo/kajovo-hotel-web test:visual
pnpm --filter @kajovo/kajovo-hotel-admin test:visual
```

Aktuálně běží nad:

- [`apps/kajovo-hotel-web/tests/visual.spec.ts`](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-web/tests/visual.spec.ts)
- [`apps/kajovo-hotel-admin/tests/visual.spec.ts`](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-admin/tests/visual.spec.ts)

Guard blokuje:

- chybějící nebo nadbytečné brand prvky mimo povolený rozsah
- horizontální overflow na `html` a `body`
- průchod povinných utility a autentizovaných view napříč breakpointy

### Visual baseline snapshoty

Repo už obsahuje baseline snapshoty v:

- [`apps/kajovo-hotel-web/tests/visual.spec.ts-snapshots`](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-web/tests/visual.spec.ts-snapshots)
- [`apps/kajovo-hotel-admin/tests/visual.spec.ts-snapshots`](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-admin/tests/visual.spec.ts-snapshots)

Snapshot adresáře v repu zůstávají jako doplňkový artefakt, ale current-state blokující důkaz je vykonávaný přes výše uvedené `visual.spec.ts`.

## 3. GitHub Actions

### `CI Gates - KajovoHotel`

Blokuje:

- release gate
- admin `e2e-smoke`
- policy guardrails
- lint
- typecheck
- unit tests

### `CI Full - Kajovo Hotel`

Blokuje:

- plné API testy
- web Playwright testy
- admin smoke
- lint a contract freshness
- auth smoke

### `CI Release - Kajovo Hotel`

Je samostatná release pipeline navázaná na `main`.

### `Deploy - hotel.hcasc.cz`

Po úspěšném `CI Gates - KajovoHotel` na `main` provádí:

- deploy archivu na server,
- post-deploy HTTP gate,
- live admin login verify,
- live users smoke verify.

## 4. Vztah ke KDGS

KDGS nepožaduje jen běh testů, ale důkaz:

- povinných stavů,
- brand přítomnosti,
- token souladu,
- absence neřízeného overflow,
- geometrické validity,
- reduced-motion souladu,
- UTF-8 bez BOM.

Aktuální testovací sada tyto požadavky kryje přes token guardy, signage guard, runtime guardy, smoke testy a vykonávaný `ci:visual`.
