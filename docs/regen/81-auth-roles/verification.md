# A) Cíl
- Sladit auth/role chování portálu s testovacími maticemi (multi-role, recepce/snídaně) a opravit padání CI (typecheck, e2e smoke).

# B) Exit criteria
- Všechny CI joby pro PR #81 zelené (CI Gates, CI Full).
- Typové chyby v `ci-gates.spec.ts` odstraněny.
- E2E smoke testy projdou na čistém checkoutu (bez UTF-16 artefaktů).
- Generovaný OpenAPI / klient aktuální (netýká se PR81).

# C) Změny
- Úprava `ci-gates.spec.ts` – korektní použití `test.skip` s podmínkou projektu.
- Přegenerování testovacích uživatelů/rolí v `tests/conftest.py` (role recepce, snídaně).
- Přepsání `e2e-smoke.spec.ts` do UTF-8 (odstranění NUL znaků).
- Přidání tohoto verifikačního dokumentu.

# D) Ověření
- Lokálně: `pnpm install`, `pnpm contract:generate` (ověřeno v kopii), `pnpm typecheck` (čeká na CI), `pnpm ci:e2e-smoke` implicitně v CI.
- CI: očekávám zelené běhy CI Gates + CI Full pro PR #81.

# E) Rizika/known limits
- CI běhy mohou zůstat nestabilní kvůli externím downloadům Playwright; retry může být potřeba.
- Neupravoval jsem produkční kód API/FE kromě test/gate skriptů.

# F) Handoff pro další prompt
- Pokud CI stále padá, zkontroluj nové logy typecheck/e2e po tomto commitu.
- Po zeleni mergni PR #81 do `main`, smaž vzdálenou větev.
