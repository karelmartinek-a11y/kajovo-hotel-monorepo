# Finalization Log

Date: 2026-03-12
Current HEAD at start: `aeb726448d737b31c4c62147d11fb11d43c88c91`

## Etapa 1 - Initial forensic sweep

What was found:
- Active operational docs contained mojibake in workflow names and manifest references (`docs/how-to-deploy.md`, `docs/developer-handbook.md`, `docs/README.md`).
- The current mojibake guardrail only scanned `apps/` and `packages/`, so it did not protect `docs/`, `.github/`, or `scripts/`.
- `docs/SSOT_SCOPE_STATUS.md` is authoritative in wording but stale in commit binding versus current `HEAD`; it will need refresh after code/doc finalization.
- No working `docs/forensics/finalization-log.md` existed yet, so forensic progress was not being recorded in the requested form.

What was changed:
- Created this working finalization log as the running forensic record.

Evidence:
- Direct repository scan over manifest/workflows/docs at current `HEAD`.
- `rg` hits showing mojibake in active docs and the pre-existing limited scope of `scripts/check_mojibake.py`.

Tests run:
- Repository scan only in this stage.

What remains:
- Expand and harden mojibake detection.
- Repair active docs and workflow-facing references.
- Continue deeper sweep over current runtime/auth/RBAC/admin/API/deploy state and then refresh SSOT against final `HEAD`.

## Etapa 2 - Encoding guardrail hardening

What was found:
- Mojibake guardrail crashed on non-UTF text files instead of producing actionable evidence.
- Active docs still had real mojibake in workflow/manifest references.
- `docs/WEB_IMPLEMENTATION_PLAN.md` was a stale non-authoritative document in UTF-16 with broken Czech, which made the repo harder to audit.

What was changed:
- Hardened `scripts/check_mojibake.py` to scan active runtime/governance surfaces (`apps/`, `packages/`, `.github/`, `scripts/`, active docs, `docs/forensics/`) and report non-UTF text files as explicit failures.
- Repaired active operational docs (`docs/how-to-deploy.md`, `docs/developer-handbook.md`).
- Rewrote `docs/WEB_IMPLEMENTATION_PLAN.md` into a UTF-8 historical notice so it no longer presents as an active source of truth.

Evidence:
- Direct before/after file inspection and repository grep.
- The updated guardrail now covers the active governance surface instead of missing it.

Tests run:
- `python scripts/check_mojibake.py` (to be rerun after this edit block).

What remains:
- Rerun mojibake guardrail and clean any remaining active-surface hits.
- Continue with deeper sweep over auth/RBAC/API/runtime/SSOT drift.

## Etapa 3 - Deploy/docs governance alignment

What was found:
- Active deploy documentation claimed `/api/health` is part of the blocking post-deploy verification, but `.github/workflows/deploy-production.yml` only checked public root and admin login before live admin auth.
- Active documentation still pointed readers to older forensic summaries instead of the authoritative SSOT/finalization trail.

What was changed:
- Added blocking `/api/health` verification to the deploy HTTP gate in `.github/workflows/deploy-production.yml`.
- Updated active docs (`docs/developer-handbook.md`, `docs/README.md`) to point to `docs/SSOT_SCOPE_STATUS.md` and `docs/forensics/finalization-log.md` as the current governance path.

Evidence:
- Direct diff between deploy workflow checks and the active deploy handbook text.
- API health route exists in `apps/kajovo-hotel-api/app/api/routes/health.py`, so the gate now matches real runtime capability.

Tests run:
- `python scripts/check_mojibake.py`
- YAML parse of `.github/workflows/deploy-production.yml`

What remains:
- Refresh SSOT against final `HEAD` and current release evidence.
- Run final local verification bundle and, if code changes are committed, let CI/deploy prove the final SHA.

## Etapa 4 - Lost-found datetime hardening

What was found:
- Active admin and web lost-found forms still defaulted `event_at` to a fixed timestamp (`2026-02-18T10:00:00Z`).
- The `datetime-local` input conversion wrote local wall time back as a fake UTC string by appending `Z`, which could shift stored incident time outside UTC and local reality.

What was changed:
- Added shared runtime datetime helpers in both frontends for local input formatting and UTC conversion.
- Replaced the fixed lost-found default timestamp with runtime current local datetime.
- Replaced naive `:00Z` concatenation with local-time-to-UTC conversion based on `Date(...).toISOString()`.
- Added Playwright coverage for the runtime default in admin and web CI gates.

Evidence:
- `apps/kajovo-hotel-admin/src/lib/date.ts`, `apps/kajovo-hotel-web/src/lib/date.ts`
- `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-web/src/main.tsx`
- `apps/kajovo-hotel-admin/tests/ci-gates.spec.ts`, `apps/kajovo-hotel-web/tests/ci-gates.spec.ts`

Tests run:
- `pnpm typecheck`
- `pnpm exec playwright test -c playwright.config.ts --project=desktop tests/ci-gates.spec.ts --grep "date defaults use runtime local day"` in `apps/kajovo-hotel-admin`
- `pnpm exec playwright test -c playwright.config.ts --project=desktop tests/ci-gates.spec.ts --grep "lost-found form uses runtime local datetime default"` in `apps/kajovo-hotel-web`

What remains:
- Refresh SSOT against final `HEAD` and current verification evidence.
- Run final verification bundle and let CI/deploy validate the final commit.

## Etapa 5 - Release governance closure

What was found:
- Active GitHub workflow names still contained mojibake in the release layer, which kept broken Czech visible in the current operational surface.
- Production deploy was triggered from both `CI Release` and `CI Full`, which created two deploy workflow runs for the same `main` push and left a cancelled run beside the successful one. Concurrency prevented overlap, but the evidence trail was less clean than a release-ready pipeline should be.

What was changed:
- Repaired the active workflow names to ASCII-safe `Kajovo` labels in `.github/workflows/ci-gates.yml`, `.github/workflows/ci-full.yml`, and `.github/workflows/release.yml`.
- Narrowed production deploy triggering to the single authoritative workflow `CI Gates - KajovoHotel`.
- Updated active deploy/developer docs and SSOT language so the documented release path matches the actual single-source deploy governance.

Evidence:
- `.github/workflows/ci-gates.yml`
- `.github/workflows/ci-full.yml`
- `.github/workflows/release.yml`
- `.github/workflows/deploy-production.yml`
- `docs/how-to-deploy.md`
- `docs/developer-handbook.md`
- `docs/SSOT_SCOPE_STATUS.md`

Tests run:
- Repository inspection of workflow triggers before/after the change.
- Pending on the next pushed SHA: green `CI Gates`, `CI Full`, `CI Release`, and one successful `Deploy - hotel.hcasc.cz` run.

What remains:
- Push this governance-closure commit.
- Confirm the new SHA passes all CI and deploy with a single authoritative production rollout.
