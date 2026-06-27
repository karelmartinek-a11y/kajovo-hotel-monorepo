# Testing

## Minimum před releasem

- lint a typecheck pro dotčené aplikace
- build portálu a administrace
- backend testy, pokud jsou dotčené API trasy
- Playwright smoke/visual testy pro hlavní role a breakpoints
- `python3 scripts/check_mojibake.py`

## Důraz

- žádný horizontální scroll v základních mobilních tocích
- žádné překrytí formulářů brandingem
- české chybové a prázdné stavy
- přístupné focus stavy a hlavní klávesová navigace

Legacy Android test chain už není součástí aktivní testovací matice.
