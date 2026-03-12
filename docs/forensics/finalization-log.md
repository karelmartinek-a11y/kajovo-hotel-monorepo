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

## Etapa 6 - Final commit-bound verification

What was found:
- After the governance-closure commit, `docs/SSOT_SCOPE_STATUS.md` still referenced the previously deployed SHA `2536d001...` instead of the newly deployed governance SHA `58789431...`.
- The code and pipelines were already correct, but the final SSOT binding needed one more exact-sha refresh to keep the repository free of self-contradiction.

What was changed:
- Refreshed the authoritative SSOT to the exact deployed SHA `58789431fabbb0a69ae514429f6eee3a5e88f289`.
- Bound the SSOT evidence section to the exact GitHub runs that passed for that SHA.

Evidence:
- `docs/SSOT_SCOPE_STATUS.md`
- `gh run` results for `23013118723`, `23013118727`, `23013118729`, `23013245831`

Tests run:
- `CI Gates - KajovoHotel` run `23013118723` -> success
- `CI Full - Kajovo Hotel` run `23013118727` -> success
- `CI Release - Kajovo Hotel` run `23013118729` -> success
- `Deploy - hotel.hcasc.cz` run `23013245831` -> success
- Single deploy trigger observed for the SHA after narrowing `workflow_run` to `CI Gates - KajovoHotel`

What remains:
- Push this final SSOT refresh commit.
- Confirm the refreshed documentation commit also passes CI and deploy.


## Etapa 7 - Frontend manifest and UX closure

What was found:
- Intro utility views in admin and portal were still generic `StateView` placeholders, so they did not satisfy manifest NORMA F for a real full lockup intro.
- Shared shell carried dead drift around a third brand element path (`showFigure`) and always rendered the header wordmark even on intro, which would have pushed intro views above the manifest limit of two brand elements.
- Skip-link scrolling always requested `smooth` behavior and therefore did not fully respect reduced-motion preference.
- Login pages still contained placeholder-like example affordances that were not needed in final UI.
- There was no dedicated automated frontend guard against reintroducing forbidden utility copy (`Intro` / `Maintenance`), fixed production dates, or login placeholder examples.
- Existing package-level Playwright wrappers still depend on a backend startup path with a pre-existing `admin_profile` table drift, so frontend verification needed to be recorded against app-local preview runs to stay forensically clean for this stage.

What was changed:
- Added a shared full-lockup component and rewired both admin and portal intro routes to use a real Kájovo full lockup with final copy, CTA hierarchy, and utility layout spacing.
- Updated the shared shell to keep intro views at max two brand elements by suppressing the header wordmark there, while preserving floating signace on non-popup views.
- Made signace href context-aware for admin vs portal and removed dead `showFigure` drift from route composition.
- Hardened reduced-motion handling in the shared shell skip link and in CSS.
- Removed unnecessary login placeholders from admin and portal login forms and aligned admin login feedback with `alertdialog` semantics.
- Added `scripts/check_frontend_manifest_guards.py` and wired it into `package.json` `ci:gates` as a blocking frontend manifest/text guard.
- Expanded Playwright guards for intro full-lockup, utility-state signace non-overlap, reduced-motion skip-link behavior, runtime token usage, and responsive no-horizontal-scroll checks across admin and portal.
- Corrected admin signage route tests to respect the real `/admin/` basename so the test evidence matches deployed runtime routing.

Evidence:
- Shared UI: `packages/ui/src/shell/AppShell.tsx`, `packages/ui/src/shell/KajovoSign.tsx`, `packages/ui/src/shell/KajovoWordmark.tsx`, `packages/ui/src/shell/KajovoFullLockup.tsx`, `packages/ui/src/tokens.css`, `packages/ui/src/index.ts`
- Portal/admin utility routes: `apps/kajovo-hotel-web/src/routes/utilityStates.tsx`, `apps/kajovo-hotel-admin/src/routes/utilityStates.tsx`
- Login UX: `apps/kajovo-hotel-web/src/admin/AdminLoginPage.tsx`, `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx`
- Route composition cleanup: `apps/kajovo-hotel-web/src/admin/AdminRoutes.tsx`, `apps/kajovo-hotel-web/src/portal/PortalRoutes.tsx`
- Guards/tests: `scripts/check_frontend_manifest_guards.py`, `apps/kajovo-hotel-web/tests/ci-gates.spec.ts`, `apps/kajovo-hotel-web/tests/accessibility.spec.ts`, `apps/kajovo-hotel-admin/tests/ci-gates.spec.ts`, `apps/kajovo-hotel-admin/tests/signage-routes.spec.ts`

Tests run:
- `pnpm typecheck`
- `python scripts/check_mojibake.py`
- `python scripts/check_frontend_manifest_guards.py`
- `pnpm --filter @kajovo/kajovo-hotel-web build`
- `pnpm --filter @kajovo/kajovo-hotel-admin build`
- `pnpm exec playwright test -c playwright.config.ts tests/ci-gates.spec.ts --project=desktop --grep "intro route renders full lockup|utility states keep floating SIGNACE|prefers-reduced-motion disables smooth skip-link scrolling|shared UI token values match manifest metadata|phone, tablet and desktop layouts avoid horizontal page scroll"` in `apps/kajovo-hotel-web`
- `pnpm exec playwright test -c playwright.config.ts tests/accessibility.spec.ts tests/signage-routes.spec.ts --project=desktop` in `apps/kajovo-hotel-web`
- `pnpm exec playwright test -c playwright.config.ts tests/ci-gates.spec.ts --project=desktop --grep "intro route renders full lockup|utility states keep floating SIGNACE|prefers-reduced-motion disables smooth skip-link scrolling|shared UI token values match manifest metadata|phone, tablet and desktop layouts avoid horizontal page scroll"` in `apps/kajovo-hotel-admin`
- `pnpm exec playwright test -c playwright.config.ts tests/signage-routes.spec.ts --project=desktop` in `apps/kajovo-hotel-admin`

What remains:
- Commit and push this frontend closure batch.
- Let the standard remote CI/deploy prove the same SHA once the branch is pushed.

## Etapa 8 - Hluboký forenzní průchod current HEAD

1. Zjištěný problém:
- `scripts/release_gate.py` na current HEAD neprojde, protože runtime breakfast smoke končí chybou při cleanupu dočasného SQLite souboru na Windows. Release gate tedy není skutečně release-ready.
- Frontend manifest/UI není forenzně čistý: aktivní shared branding vrací rozbitou diakritiku (`KÁJOVO`, `KájovoHotel`, `Portál`) a Playwright gate na tom skutečně padá.
- Aktivní auth/i18n vrstva obsahuje mojibake texty v `packages/shared/src/i18n/auth.ts`, což se propisuje do admin/user loginu a dalších runtime textů.
- API má nekonzistentní timezone vrstvu: část rout už používá UTC helpery, ale `users.py` a `lost_found.py` stále míchají `datetime.now()`, `datetime.utcnow()` a aware UTC model.
- Test suite sice prochází, ale už při základním průchodu vygenerovala deprecation warningy kvůli `datetime.utcnow()` v auth lockout testech, takže current HEAD ještě není čistý ani na úrovni časové hygieny.

2. Důkazní soubory:
- `scripts/release_gate.py`
- `scripts/run_breakfast_runtime_smoke.py`
- `artifacts/release-gate/release-gate-1f87d229d557-20260312T175806.521183+0000.json`
- `packages/ui/src/shell/KajovoSign.tsx`
- `packages/ui/src/shell/KajovoWordmark.tsx`
- `packages/ui/src/shell/KajovoFullLockup.tsx`
- `packages/shared/src/i18n/auth.ts`
- `apps/kajovo-hotel-web/src/routes/utilityStates.tsx`
- `apps/kajovo-hotel-admin/src/routes/utilityStates.tsx`
- `apps/kajovo-hotel-web/tests/ci-gates.spec.ts`
- `apps/kajovo-hotel-api/app/api/routes/users.py`
- `apps/kajovo-hotel-api/app/api/routes/lost_found.py`
- `apps/kajovo-hotel-api/tests/test_auth_lockout.py`

3. Provedená oprava:
- V této etapě zatím žádná. Šlo o povinný forenzní průchod current HEAD a sestavení přesného backlogu podle reality kódu a gate.

4. Jak byla ověřena:
- `python scripts/release_gate.py` -> FAIL, důvod: `run_breakfast_runtime_smoke.py` na Windows cleanup `PermissionError` nad `breakfast-runtime.db`
- `python scripts/check_mojibake.py` -> PASS, ale cílený grep odhalil, že guard zatím nepokrývá runtime `?` degradace textů
- `pnpm ci:gates` -> FAIL na Playwright testu `SIGNACE is visible, correct and not occluded on all IA routes`, očekává `KÁJOVO`, runtime vrací `KÁJOVO` s rozbitou textovou vrstvou v jiných částech UI
- cílený grep nad `apps/`, `packages/`, `scripts/` a `docs/forensics/` pro placeholdery, rozbitou diakritiku, pevná data a timezone API usage
- přímá inspekce runtime zdrojů a auth/i18n souborů

5. Co ještě zbývá:
- Opravit breakfast runtime smoke tak, aby release gate prošla i na Windows bez zamčeného temp DB souboru.
- Opravit aktivní brand/shared texty a odstranit rozbitou diakritiku z runtime UI.
- Rozšířit nebo zpřesnit mojibake guard tak, aby chytil i skutečné runtime degradace textů.
- Sjednotit timezone vrstvu v API a testech na jeden UTC model.
- Po opravách znovu pustit `release_gate.py`, `pnpm ci:gates`, relevantní API testy a aktualizovat otevřené nálezy.

## Etapa 8 - Breakfast runtime, deploy and release gating closure

What was found:
- Breakfast module had solid CRUD coverage but incomplete forensic proof for preview/save immutability, export RBAC, diet-toggle restrictions and admin-only reactivation.
- IMAP fetcher and scheduler existed, but production-proof quality was weaker than the repository wording implied: there was no deterministic archival runtime smoke for scheduler/import end-to-end, and failure paths were under-logged.
- Production deploy still relied too much on script exit status versus explicit server-side runtime proof for the same SHA.
- `docs/feature-parity-matrix.csv` overstated runtime certainty by collapsing code/test completeness into broad "done" claims.

What was changed:
- Expanded breakfast API tests to cover preview, export RBAC, diet-toggle RBAC and admin-only reactivation.
- Hardened breakfast IMAP fetcher with explicit configuration validation, guarded connect/login failures, mailbox/search/fetch warnings and invalid-PDF logging.
- Added scheduler runtime result artifacts and deterministic runtime smoke harness `scripts/run_breakfast_runtime_smoke.py`.
- Hardened `infra/ops/deploy-production.sh` with service-health waits, direct local health checks and emitted server-side deploy artifact `artifacts/deploy-runtime/latest.json` bound to branch/SHA.
- Hardened `.github/workflows/deploy-production.yml` to pull back the server-side deploy artifact, verify SHA parity, and upload it as a GitHub artifact.
- Strengthened `scripts/release_gate.py` so release now requires web/admin builds plus breakfast runtime smoke in addition to existing checks.
- Rewrote `docs/feature-parity-matrix.csv` into split evidence fields (`API hotovo`, `UI hotovo`, `Test hotovo`, `Runtime prokazano`, `Manifest pass`) and downgraded optimistic runtime claims where live proof is still partial or absent.
- Added dedicated closure doc `docs/forensics/deploy-runtime-closure.md`.

Evidence:
- Breakfast: `apps/kajovo-hotel-api/app/api/routes/breakfast.py`, `apps/kajovo-hotel-api/tests/test_breakfast.py`
- IMAP/scheduler: `apps/kajovo-hotel-api/app/services/breakfast/mail_fetcher.py`, `apps/kajovo-hotel-api/app/services/breakfast/scheduler.py`, `apps/kajovo-hotel-api/tests/test_breakfast_imap_smoke.py`, `scripts/run_breakfast_runtime_smoke.py`
- Deploy/release: `infra/ops/deploy-production.sh`, `.github/workflows/deploy-production.yml`, `scripts/release_gate.py`, `infra/smoke/smoke.sh`, `infra/verify/verify-deploy.sh`
- Documentation: `docs/feature-parity-matrix.csv`, `docs/forensics/deploy-runtime-closure.md`

Tests run:
- `python -m pytest apps/kajovo-hotel-api/tests -q` -> PASS (`61 passed`)
- `python scripts/run_breakfast_runtime_smoke.py` -> PASS
- `python -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests` -> PASS
- `python scripts/release_gate.py` -> PASS, artifact `artifacts/release-gate/release-gate-1f87d229d557-20260312T182041.766589+0000.json`

What remains:
- Run the backend-focused verification bundle and fix any regressions.
- If green, commit/push and let CI + deploy prove the same SHA remotely.



## Etapa 10 - Hluboké E2E admin + user

1. Zjištěný problém:
- E2E pokrytí current HEAD bylo silné jen v gate/smoke rovině, ale chyběly dlouhé user/admin journey přes CRUD, RBAC deep linky, utility stavy a klíčové formulářové toky.
- Playwright harness používal sdílenou `.tmp/playwright-api.db`, takže souběžné běhy si mohly vzájemně rozbíjet databázi a dávat falešné pády při startupu API.
- Při rozšířeném package-level běhu se ukázaly i starší neuzavřené desktop/tablet/phone odchylky ve stávajících legacy E2E sadách (`ci-gates`, `nav-robustness`, část `users-admin`), které nebyly způsobené novými journey testy.

2. Důkazní soubory:
- `apps/kajovo-hotel-web/tests/portal-journeys.spec.ts`
- `apps/kajovo-hotel-web/tests/fixtures/breakfast-import.pdf`
- `apps/kajovo-hotel-web/tests/rbac-access.spec.ts`
- `apps/kajovo-hotel-admin/tests/admin-journeys.spec.ts`
- `apps/kajovo-hotel-admin/tests/rbac-access.spec.ts`
- `scripts/run-playwright-with-api.js`
- `docs/forensics/e2e-closure.md`

3. Provedená oprava:
- Přidána skutečná portal journey sada pro login/forgot/select-role, breakfast import/export/diet/reactivation a records workflow přes lost-found/issues/inventory/reports.
- Přidána skutečná admin journey sada pro users CRUD, active toggle, reset-link, settings SMTP flow, profile update a password flow.
- Rozšířeny RBAC deep-link testy pro portal i admin.
- Playwright backend harness dostal unikátní temp DB a media root per proces, aby souběžné běhy nespadly na kolizi SQLite/portových artefaktů.

4. Jak byla ověřena:
- `node scripts/run-playwright-with-api.js --app apps/kajovo-hotel-web tests/portal-journeys.spec.ts tests/rbac-access.spec.ts --project=desktop` -> PASS.
- `node scripts/run-playwright-with-api.js --app apps/kajovo-hotel-admin tests/admin-journeys.spec.ts tests/rbac-access.spec.ts --project=desktop` -> PASS.
- `pnpm --filter @kajovo/kajovo-hotel-web lint` -> PASS.
- `pnpm --filter @kajovo/kajovo-hotel-admin lint` -> PASS.
- `pnpm --filter @kajovo/kajovo-hotel-web test` -> FAIL na starších web `ci-gates`/`nav-robustness` sadách napříč viewporty.
- `pnpm --filter @kajovo/kajovo-hotel-admin test` -> FAIL na části starších admin phone/tablet sad a na jednom legacy state-route gate.

5. Co ještě zbývá:
- Dočistit starší package-level E2E sady tak, aby i historické `ci-gates`, `nav-robustness` a mobile-specific admin specs byly v souladu s current runtime chováním.
- Teprve po tom půjde poctivě tvrdit úplné E2E PASS i pro defaultní package-level běhy obou aplikací.

## Etapa 10b - E2E log supplement

1. Found:
- New portal/admin journey coverage is green on targeted desktop runs.
- `run-playwright-with-api.js` had a real temp DB collision risk for concurrent runs.
- Full package suites still expose older legacy failures outside the newly added journey specs.

2. Changed:
- Added portal and admin journey specs.
- Added a PDF fixture for breakfast import.
- Extended RBAC deep-link coverage.
- Switched Playwright backend temp storage to unique per-run paths.

3. Evidence:
- `apps/kajovo-hotel-web/tests/portal-journeys.spec.ts`
- `apps/kajovo-hotel-web/tests/fixtures/breakfast-import.pdf`
- `apps/kajovo-hotel-admin/tests/admin-journeys.spec.ts`
- `apps/kajovo-hotel-web/tests/rbac-access.spec.ts`
- `apps/kajovo-hotel-admin/tests/rbac-access.spec.ts`
- `scripts/run-playwright-with-api.js`
- `docs/forensics/e2e-closure.md`

4. Verified:
- `node scripts/run-playwright-with-api.js --app apps/kajovo-hotel-web tests/portal-journeys.spec.ts tests/rbac-access.spec.ts --project=desktop` -> PASS
- `node scripts/run-playwright-with-api.js --app apps/kajovo-hotel-admin tests/admin-journeys.spec.ts tests/rbac-access.spec.ts --project=desktop` -> PASS
- `pnpm --filter @kajovo/kajovo-hotel-web lint` -> PASS
- `pnpm --filter @kajovo/kajovo-hotel-admin lint` -> PASS
- `pnpm --filter @kajovo/kajovo-hotel-web test` -> FAIL on older legacy suites
- `pnpm --filter @kajovo/kajovo-hotel-admin test` -> FAIL on older legacy suites

5. Remaining:
- Finish cleanup of the older package-level E2E suites before claiming full E2E closure for both apps.

## Etapa 11 - Final local release gate before push

What was found:
- The remaining false negatives in local E2E were caused by runner-level cross-talk when web and admin package suites were launched in parallel against the same backend port.
- `docs/forensics/finalization-log.md`, `docs/forensics/ui-manifest-closure.md`, `docs/forensics/open-findings.md` and `app/security/rbac.py` still carried real encoding drift or lossy `?` degradation that weakened forensic readability.
- The RBAC compatibility layer still depended on literal mojibake aliases instead of a systematic repair path.

What was changed:
- Re-ran `@kajovo/kajovo-hotel-web` and `@kajovo/kajovo-hotel-admin` package tests sequentially to remove backend port collisions from the evidence trail.
- Rewrote `apps/kajovo-hotel-api/app/security/rbac.py` so backward compatibility for broken role inputs is handled by a repair function instead of hardcoded mojibake literals.
- Repaired the affected forensic docs into clean UTF-8 text and hardened `scripts/check_mojibake.py` so it reports safely on Windows consoles.

Evidence:
- `apps/kajovo-hotel-api/app/security/rbac.py`
- `scripts/check_mojibake.py`
- `docs/forensics/finalization-log.md`
- `docs/forensics/ui-manifest-closure.md`
- `docs/forensics/open-findings.md`

Tests run:
- `python -m pytest apps/kajovo-hotel-api/tests -q` -> PASS (`61 passed`)
- `python -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests` -> PASS
- `python scripts/check_mojibake.py` -> PASS
- `python scripts/check_frontend_manifest_guards.py` -> PASS
- `python scripts/release_gate.py` -> PASS
- `pnpm --filter @kajovo/kajovo-hotel-admin test` -> PASS (`90 passed`)
- `pnpm --filter @kajovo/kajovo-hotel-web test` -> PASS (`73 passed`, `2 skipped`)

What remains:
- Commit the verified local change set in clean commits.
- Push the exact SHA to `main`.
- Let GitHub CI and deploy prove the same release candidate remotely.

## Etapa 12 - Release rerun fix for mobile admin smoke

What was found:
- GitHub `CI Release - Kajovo Hotel` for SHA `d80c38a...` failed in `apps/kajovo-hotel-web/tests/smoke.spec.ts` on the phone viewport.
- The failing step clicked the first visible `Smazat` button directly from the users page, but on phone layout that button can end up outside the actionable viewport.

What was changed:
- Reworked the smoke delete flow to match the proven detail-pane pattern already used in the deeper admin E2E suite.
- The smoke now opens the created user detail, scrolls the detail delete action into view, and confirms deletion from the dialog with a force-safe click.

Evidence:
- `apps/kajovo-hotel-web/tests/smoke.spec.ts`
- GitHub run `23019976859` failed log for `Run smoke e2e suite`

Tests run:
- `pnpm --filter @kajovo/kajovo-hotel-web test:smoke` -> PASS (`6 passed`)

What remains:
- Commit this release-fix delta.
- Push the new SHA and rerun the remote CI/deploy sequence.

## Etapa 13 - Deploy artifact fetch fix after remote rollout failure

What was found:
- The production deploy for SHA `081c6f8...` reached the server and the deploy script finished, but the GitHub workflow still failed afterward.
- The failure was in `Fetch deploy runtime artifact`: `appleboy/scp-action` created an empty archive when asked to download `/opt/kajovo-hotel-monorepo/artifacts/deploy-runtime/latest.json` directly from an absolute path.
- Because of that, the post-deploy HTTP gate and live admin login verification never ran, even though the release had already been unpacked on the server.

What was changed:
- Added an explicit SSH staging step that copies the server-side runtime artifact into the deploy user's home directory.
- Changed the SCP download step to fetch that staged file by relative name and normalized it back to `artifacts/latest.json` on the runner before SHA verification and post-deploy checks.

Evidence:
- `.github/workflows/deploy-production.yml`
- GitHub deploy run `23020442646`

Tests run:
- workflow logic inspection against failed GitHub log
- local YAML/source review of `.github/workflows/deploy-production.yml`

What remains:
- Commit this deploy workflow fix.
- Push a new SHA and rerun CI + deploy until the full remote chain is green.

## Etapa 14 - Replace brittle SCP proof fetch with remote artifact verification

What was found:
- Even after staging `latest.json` into the deploy user's home directory, `appleboy/scp-action` still returned `tar: empty archive` when trying to fetch the file back to the runner.
- The server-side deploy and artifact creation were successful, but the workflow stayed red because post-deploy verification depended on a brittle file-download mechanism.

What was changed:
- Removed the SCP download dependency from deploy verification.
- Added a remote SSH verification step that reads `/opt/kajovo-hotel-monorepo/artifacts/deploy-runtime/latest.json` on the server and fails if its SHA does not match the deployed commit.
- Added a runner-side `artifacts/latest.json` proof file that records the verified deploy SHA, base URL, run ID, and the fact that the server-side runtime artifact SHA check passed.

Evidence:
- `.github/workflows/deploy-production.yml`
- GitHub deploy run `23021383518`

Tests run:
- local YAML/source review of `.github/workflows/deploy-production.yml`

What remains:
- Commit this deploy verification fix.
- Push a new SHA and rerun the full remote chain until CI and deploy are both green.

## Etapa 15 - Final post-deploy forensic audit for d51755d

What was found:
- Final CI for `d51755d` is green and the deploy workflow finally completed with all post-deploy verification steps successful.
- Live production endpoints for admin, portal, and API health responded successfully during the audit sweep.

What was changed:
- Added final audit outputs `docs/forensics/final-audit-after-deploy.md` and `docs/forensics/final-test-matrix.md` for the deployed SHA.

Evidence:
- GitHub runs `23021479714`, `23021479741`, `23021479701`, `23021567638`
- Live checks against `https://hotel.hcasc.cz/`, `/admin/login`, `/admin/uzivatele`, `/admin/nastaveni`, `/admin/profil`, `/intro`, `/snidane`, `/ztraty-a-nalezy`, `/zavady`, `/sklad`, `/reporty`, `/api/health`

Tests run:
- remote CI/deploy verification for `d51755d` -> PASS
- live HTTP/title verification against production -> PASS

What remains:
- No known P0/P1 release blockers remain for the deployed SHA `d51755d`.

## Etapa 16 - Final audit documentation pack

What was found:
- The final audit package still lacked the required backend closure document.
- `final-audit-after-deploy.md` and `final-test-matrix.md` existed only locally after the successful release deploy and still had to be folded into the documented forensic bundle.

What was changed:
- Added `docs/forensics/backend-closure.md`.
- Finalized `docs/forensics/final-audit-after-deploy.md` and `docs/forensics/final-test-matrix.md` as the post-deploy audit outputs for the audited release runtime SHA.

Evidence:
- `docs/forensics/backend-closure.md`
- `docs/forensics/final-audit-after-deploy.md`
- `docs/forensics/final-test-matrix.md`

Tests run:
- direct production HTTP/title verification against `hotel.hcasc.cz`
- GitHub run verification for `23021479714`, `23021479741`, `23021479701`, `23021567638`

What remains:
- Commit and push this final docs pack.
- Let the docs follow-up SHA clear CI/deploy so the repository and the production proof trail end in a clean state.
