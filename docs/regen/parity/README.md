# Parity map (`docs/regen/parity/parity-map.yaml`)

Tento soubor je deterministický baseline pro regen kaskádu KájovoHotel.

## Co obsahuje

- IA moduly a routy (legacy + aktuální stav)
- API endpointy (legacy + aktuální stav)
- Datové entity a migrace
- Joby (scheduler + ingest)
- RBAC role a permission identifikátory

Každá položka má `id`, `source` a `parity_status` (`baseline` nebo `unknown`).

## Jak aktualizovat

1. Forenzně projít pouze repozitář (`legacy/**`, `apps/**`, `docs/**`).
2. Doplnit/změnit pouze odvozenou specifikaci (bez kopírování implementace).
3. U každé nové položky nastavit `parity_status` podle doložitelnosti.

## Jak používat v regen promtech

- Prompty 01+ používají tento soubor jako SSOT parity rozsahu.
- URL kompatibilita a jazykové konvence jsou závazné podle sekce `conventions`.
