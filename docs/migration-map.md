# Migration map (legacy -> monorepo targets)

## Assumptions from current monorepo layout
- Target backend app: `apps/kajovo-hotel-api/`.
- Target frontend app: `apps/kajovo-hotel-web/`.
- Shared frontend building blocks: `packages/ui/`, `packages/shared/`, and brand tokens under `apps/kajovo-hotel/`.
- Legacy remains read-only source material under `legacy/`.

## 1) Path mapping: legacy -> target

| Legacy source path | Target path | Decision | Rationale |
|---|---|---|---|
| `legacy/hotel-backend/app/main.py` | `apps/kajovo-hotel-api/app/main.py` | **Rewrite (guided port)** | API app keeps FastAPI architecture; continue aligning imports, settings, and router composition to new app boundaries. |
| `legacy/hotel-backend/app/config.py` | `apps/kajovo-hotel-api/app/config.py` | **Rewrite** | Move to monorepo env conventions and remove legacy compatibility shims only after parity tests pass. |
| `legacy/hotel-backend/app/db/*` | `apps/kajovo-hotel-api/app/db/*` | **Move-as-is (phase 1), then cleanup** | Preserve schema and migration history first to avoid data drift; refactor naming/type cleanup in phase 2. |
| `legacy/hotel-backend/app/db/migrations/*` | `apps/kajovo-hotel-api/app/db/migrations/*` | **Move-as-is** | Alembic history must stay intact for reproducible upgrades. |
| `legacy/hotel-backend/app/security/*` | `apps/kajovo-hotel-api/app/security/*` | **Rewrite minimally** | Keep auth/CSRF/rate-limit behavior stable; only adapt module paths and settings interfaces. |
| `legacy/hotel-backend/app/services/breakfast/*` | `apps/kajovo-hotel-api/app/services/breakfast/*` | **Move-as-is (phase 1)** | Domain logic is cohesive and already isolated. |
| `legacy/hotel-backend/app/media/*` | `apps/kajovo-hotel-api/app/media/*` | **Move-as-is** | Shared backend media utilities with low coupling to web framework scaffolding. |
| `legacy/hotel-backend/app/api/*` | `apps/kajovo-hotel-api/app/api/*` | **Rewrite + normalize prefixes** | Ensure all routers are actually mounted in new `main.py`; resolve legacy mismatch where API aggregator exists but is not wired centrally. |
| `legacy/hotel-backend/app/web/routes*.py` | `apps/kajovo-hotel-api/app/web/routes*.py` (temporary) | **Rewrite (temporary compatibility layer)** | Keep SSR compatibility during transition; long-term ownership moves to SPA frontend in `apps/kajovo-hotel-web`. |
| `legacy/hotel-backend/app/web/templates/*` | `apps/kajovo-hotel-web/src/legacy-parity/` (componentized) | **Rewrite** | Convert Jinja templates into React routes/components while preserving behavior and states. |
| `legacy/hotel-backend/app/web/static/*` | `apps/kajovo-hotel-web/public/` + `apps/kajovo-hotel-web/src/styles/` | **Split: move assets, rewrite styles** | Binary/static assets can be moved; CSS should be rewritten to token-driven UI per monorepo direction. |
| `legacy/hotel-frontend/templates/*` | `apps/kajovo-hotel-web/src/legacy-parity/` | **Rewrite** | Same templates already synced into backend; canonical migration target is web app source code, not copied HTML artifacts. |
| `legacy/hotel-frontend/templates/partials/*` | `packages/ui/src/shell/*` (or `apps/kajovo-hotel-web/src/components/*`) | **Rewrite into reusable components** | `brand_rail`/`kajovo_signage` are cross-view primitives and should become shared UI components. |
| `legacy/hotel-frontend/static/brand/*` | `apps/kajovo-hotel-web/public/brand/` | **Move-as-is (asset relocation)** | Static brand images are already runtime assets; relocate first, optimize later. |
| `legacy/hotel-frontend/static/*.css` | `apps/kajovo-hotel-web/src/styles/*` + `apps/kajovo-hotel/ui-tokens/*` + `packages/ui/src/tokens.css` | **Rewrite** | Consolidate duplicated legacy CSS into token-based system required by monorepo architecture. |
| `legacy/hotel-frontend/static/frontend-version.json` | `apps/kajovo-hotel-web/public/frontend-version.json` (or build-generated metadata) | **Rewrite generation mechanism** | Replace ad-hoc sync stamping with CI build metadata step in web build pipeline. |
| `legacy/hotel-frontend/sync-to-backend.*` and `legacy/hotel-backend/sync-from-frontend.*` | **No direct target (delete workflow after cutover)** | **Drop legacy process** | Rsync coupling is anti-pattern in monorepo; use explicit web build + deploy artifact flow. |
| `legacy/hotel-backend/deploy/*` | `infra/` + app-local Docker files | **Rewrite selectively** | Reuse deploy intent, but align with current monorepo infra layout and service names. |

## 2) Module migration decisions (rewrite vs move)

### Move-as-is first (stability-first)
- DB models + Alembic migrations (`app/db/models.py`, `app/db/migrations/**`).
- Breakfast service internals (`app/services/breakfast/**`).
- Media processing utilities (`app/media/**`).

Reason: these are core data/processing paths with high regression risk if rewritten before parity tests.

### Rewrite first (architecture-first)
- All Jinja templates and partials into SPA/component architecture.
- Legacy CSS bundle set (`app.css`, `dagmar.css`, `hotel-brand.css`, `kajovo-ui.css`, `tailwind.css`) into tokenized styling.
- Sync scripts (`sync-to-backend`, `sync-from-frontend`) into CI-driven build/deploy steps.

Reason: these pieces encode old coupling and duplicate concerns that conflict with monorepo `apps/` + `packages/` ownership.

### Hybrid (port then refine)
- Web route handlers (`app/web/routes*.py`) retained temporarily for compatibility while equivalent React routes/API usage are delivered.
- Security/auth modules ported with minimal change first, then cleaned after automated coverage exists.

## 3) Key risks

1. **Router parity risk:** legacy has mixed web+API routing and a partially disconnected API aggregator; migration may silently drop endpoints if router wiring is not audited.
2. **Auth flow regressions:** admin session + CSRF + portal reset flows are tightly coupled between templates, middleware, and forms.
3. **Data integrity risk:** inventory and breakfast flows depend on existing schema semantics and stock recalculation logic.
4. **Behavioral drift in reports:** findings/issues share handlers with query filters; UI rewrite can alter default filters or state transitions.
5. **Asset/signage drift:** legacy partial chain controls consistent branding; component rewrite can miss mandatory brand rail/signage presence.
6. **Deployment provenance gap:** legacy `frontend-version.json` stamping is crude but functional; removal without replacement reduces traceability.

## 4) Required tests checklist (migration gates)

## Backend/API parity
- [ ] Health/version endpoints parity (`/api/health`, `/api/version`, `/api/v1/health`).
- [ ] Reports workflow: create -> list open -> mark done -> reopen -> delete history checks.
- [ ] Breakfast workflow: import/check/note/day endpoints + scheduler smoke test.
- [ ] Inventory workflow: ingredient CRUD, stock card IN/OUT, recalculation correctness.
- [ ] Device auth flow: register/status/challenge/verify anti-replay behavior.
- [ ] Auth/session: admin login/logout, portal login/reset, CSRF rejection/acceptance matrix.

## Database/migrations
- [ ] Fresh database migrate to head.
- [ ] Upgrade from a dump/state representing production baseline.
- [ ] Migration idempotency + rollback rehearsal for latest revision.

## Web parity (during transitional SSR and/or SPA replacement)
- [ ] Route coverage for dashboard/reports/findings/issues/breakfast/inventory/users/settings/profile.
- [ ] Form POST flows with CSRF tokens on all mutating operations.
- [ ] Media serving/auth checks for photos and inventory pictograms.
- [ ] Visual and navigation parity for admin sidebar active states.

## Build/deploy/CI
- [ ] Replace rsync workflow with deterministic web build artifact publication.
- [ ] CI step generates deploy/build metadata to replace `frontend-version.json` manual stamping.
- [ ] Container boot test: DB wait, optional migrations, app startup, health probe.
- [ ] End-to-end smoke test equivalent to legacy sandbox `run-tests.sh` intent.
