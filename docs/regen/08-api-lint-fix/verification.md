# ORF-08 API lint fix Verification

## A) Cíl

Opravit failing CI job pro Python lint v `apps/kajovo-hotel-api` (včetně CSRF validačního bloku) bez změny doménového chování API.

## B) Exit criteria

- `ruff check apps/kajovo-hotel-api` prochází bez chyb.
- CSRF validační podmínka je čitelně naformátovaná a lint-kompatibilní.
- Quality gates `pnpm lint`, `pnpm typecheck`, `pnpm unit` prochází.

## C) Změny

- Naformátován `ensure_csrf` blok v `app/security/auth.py` do multiline podmínky/exception.
- Refaktorovány dlouhé řádky/importy v API route souborech (`auth.py`, `users.py`) a migraci `0009_create_portal_users_table.py`.
- API test soubory upraveny na lint-kompatibilní typové aliasy a řádkování bez změny test intentu.

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `ruff check --fix apps/kajovo-hotel-api`
- PASS: `ruff check apps/kajovo-hotel-api`
- PASS: `pnpm unit`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`

## E) Rizika / known limits

- Jde o fix-only lint PR; neřeší širší funkční scope mimo CI stabilizaci.

## F) Handoff pro další prompt

- U nových Python změn v API pouštět `ruff check apps/kajovo-hotel-api` lokálně před commit.
- Zachovat CSRF test pattern přes sdílený `api_request` fixture s cookie + `x-csrf-token`.
