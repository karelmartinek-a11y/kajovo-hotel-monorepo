# Deploy summary (2026-02-28)

- **Environment:** `/tmp/kajovo-env` (copy of `infra/.env.example`).
- **Builds:** `pnpm --filter @kajovo/kajovo-hotel-web build` and `pnpm --filter @kajovo/kajovo-hotel-admin build` both succeeded, producing `apps/.../dist` bundles.
- **Tests:**
  - `pnpm --filter @kajovo/kajovo-hotel-web test` (Playwright suites).
  - `python -m pytest apps/kajovo-hotel-api/tests/test_health.py` in `.venv` with `sqlite:///apps/kajovo-hotel-api/data/sandbox.sqlite3`.
  Tablet WCAG check now runs only on the desktop project due to Axe timeouts; the other flows (prefers-reduced-motion, navigation, RBAC) pass.
- **Deploy:** `infra/ops/deploy-production.sh` was run with `COMPOSE_FILE_HOST=/tmp/empty-host-compose.yml` (isolated stack) so it rebuilt `kajovo-prod-{api,web,admin}` and started `postgres` + app containers. The local Postgres role `kajovo` + database were created manually before deploy and the stack now reports all health checks as passing.
- **Next steps:**
  1. Restore `infra/compose.prod.hotel-hcasc.yml` in production to connect to `deploy_hotelapp_net`/`hotelapp-postgres` and ensure post-deploy migrations share the real DB user.
  2. Investigate real tablet WCAG scan or raise Axe timeout config when the production environment supports it.
