# A) Cíl
- Finalizovat audit remediation PR tak, aby prošel CI na PR i po merge do `main`.

# B) Exit criteria
- PR checky `lint`, `guardrails`, `lint-and-contract`, `lint-test-build` a navazující smoke/e2e joby jsou zelené.
- Workflow nepadají na `pnpm not found`.
- OpenAPI kontrakt a generovaný klient jsou synchronizované (`contract:check` bez diffu).

# C) Změny
- Opraveno pořadí a konfigurace Node/pnpm setupu ve workflow (`ci-core`, `preview`, `release`), aby setup-node nepoužíval `cache: pnpm` před instalací pnpm.
- Doplněny chybějící artefakty pro `contract:check` (OpenAPI + shared client).
- Srovnané importy v `auth.py` kvůli Ruff.

# D) Ověření
- Spuštěno lokálně: `pnpm lint`, `pnpm contract:generate`, `python -m pytest apps/kajovo-hotel-api/tests/test_users.py`.
- PR checky sledované přes `gh pr checks` a `gh run view --log-failed`.

# E) Rizika / known limits
- Playwright CI běhy závisí na dostupnosti runner dependencies; hermetický backend bootstrap je součástí repa.

# F) Handoff
- Po merge sledovat `release` workflow na `main` a navazující deploy joby.
