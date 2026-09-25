# Testing

## Minimum před releasem

- lint a typecheck pro dotčené aplikace
- build portálu a administrace
- backend testy, pokud jsou dotčené API trasy
- Playwright smoke/visual testy pro hlavní role a breakpoints
- `python3 scripts/check_mojibake.py`
- `pnpm ci:portal-translations` a snímky s viditelnými texty pro `cs`, `en`, `uk` na desktopu, tabletu a mobilu

## Důraz

- žádný horizontální scroll v základních mobilních tocích
- žádné překrytí formulářů brandingem
- jazykově správné chybové a prázdné stavy portálu; admin zůstává česky
- přístupné focus stavy a hlavní klávesová navigace
- release matice kryje pouze web, admin, API, OpenAPI klient a živé provozní smoke scénáře
