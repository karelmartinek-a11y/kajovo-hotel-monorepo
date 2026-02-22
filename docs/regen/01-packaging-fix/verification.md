# Verification — 01-packaging-fix

## Co bylo cílem

- Opravit CI chybu při `pip install -e apps/kajovo-hotel-api`:
  - `Multiple top-level packages discovered in a flat-layout: ['app', 'alembic']`.

## Jak ověřeno

1. Kontrola editable metadata buildu (bez síťové build-isolation):
   - `python -m pip install -e apps/kajovo-hotel-api --no-build-isolation`
   - Výsledek: build backend úspěšně prošel přes `Preparing editable metadata (pyproject.toml): finished with status 'done'`.
   - Tím je ověřeno, že původní package discovery chyba je odstraněna.

2. Omezení prostředí:
   - Stejný příkaz končí až na runtime požadavku verze Pythonu:
     - `ERROR: Package 'kajovo-hotel-api' requires a different Python: 3.10.19 not in '>=3.11'`
   - Tento fail je environment limitation (lokální Python 3.10), nikoliv packaging discovery problém.

## Co se změnilo

- `apps/kajovo-hotel-api/pyproject.toml`
  - přidána explicitní package discovery konfigurace:
    - `include = ["app*"]`
    - `exclude = ["alembic*"]`
- `docs/regen/parity/parity-map.yaml`
  - doplněn modul `api_packaging` se stavem `DONE`.

## Rizika / known limits

- V tomto prostředí nelze plně dokončit editable instalaci kvůli Python 3.10 vs požadavek projektu `>=3.11`.
- Fix řeší konkrétní CI chybu package discovery; neřeší jiné doménové parity body.
