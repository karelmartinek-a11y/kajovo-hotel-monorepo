# Final Test Matrix

| oblast | co bylo kliknuto/spuštěno/ověřeno | očekávání | výsledek | důkazní test nebo log |
|---|---|---|---|---|
| Manifest brand layer | intro, key IA views, utility states, floating signace, brand-count guard | max 2 brand elements, signace visible, no overlap, manifest token usage | PASS | `apps/kajovo-hotel-web/tests/ci-gates.spec.ts`, `apps/kajovo-hotel-admin/tests/ci-gates.spec.ts`, `scripts/check_frontend_manifest_guards.py` |
| Responsive UX | desktop/tablet/phone navigation, no horizontal overflow outside table containers | no broken nav, no page-level horizontal scroll | PASS | `apps/kajovo-hotel-web/tests/nav-robustness.spec.ts`, `apps/kajovo-hotel-admin/tests/nav-robustness.spec.ts` |
| Reduced motion + WCAG | reduced motion behavior and WCAG baseline on IA routes | no motion regression, baseline accessibility checks pass | PASS | admin/web `ci-gates.spec.ts` WCAG + reduced-motion tests |
| Admin auth + users | admin login, create/edit/delete user workflow, reset link, active toggle, validation | admin workflows usable and role-safe | PASS | `apps/kajovo-hotel-admin/tests/admin-journeys.spec.ts`, `apps/kajovo-hotel-admin/tests/users-admin.spec.ts`, web smoke `tests/smoke.spec.ts` |
| Admin RBAC | hidden modules, deep-link denial, module switcher per role | unauthorized admin-view actions hidden or denied | PASS | `apps/kajovo-hotel-admin/tests/rbac-access.spec.ts` |
| Portal auth + role select | invalid login, forgot flow, role selection | correct errors and role-aware portal entry | PASS | `apps/kajovo-hotel-web/tests/portal-journeys.spec.ts` |
| Portal breakfast | import preview/save, export PDF, diets, serving, reactivation, summary restrictions | breakfast flows and permissions behave correctly | PASS | `apps/kajovo-hotel-web/tests/portal-journeys.spec.ts`, `apps/kajovo-hotel-api/tests/test_breakfast.py` |
| Lost-found / issues / inventory / reports | list/detail/create/edit workflows, media-related usage, route accessibility | CRUD and record flows stay operable | PASS | `apps/kajovo-hotel-web/tests/portal-journeys.spec.ts`, API tests |
| Backend auth + RBAC | login/logout/lockout/role normalization/permission checks | consistent auth and permission enforcement | PASS | `apps/kajovo-hotel-api/tests/*.py`, `apps/kajovo-hotel-api/app/security/rbac.py` |
| Time + audit hygiene | UTC helper usage, no naive drift in audited routes/tests | consistent timestamp handling | PASS | `apps/kajovo-hotel-api/app/time_utils.py`, `apps/kajovo-hotel-api/app/audit_utils.py`, backend pytest |
| Breakfast IMAP runtime | scheduler/import runtime smoke | deterministic smoke passes and logs are produced | PASS | `python scripts/run_breakfast_runtime_smoke.py`, `apps/kajovo-hotel-api/tests/test_breakfast_imap_smoke.py` |
| Release gate | build + tests + smoke + manifest checks | no release marked done without full gate | PASS | `python scripts/release_gate.py`, `CI Gates - KajovoHotel` run `23021479714` |
| Release smoke | smoke E2E suite for release workflow | smoke suite passes on GitHub for deployed SHA | PASS | `CI Release - Kajovo Hotel` run `23021479741` |
| Deploy verification | archive upload, server deploy, runtime artifact verification, HTTP gate, live admin login | deploy workflow must stay green end-to-end | PASS | `Deploy - hotel.hcasc.cz` run `23021567638` |
| Live production availability | root, admin login, admin deep links, portal deep links, api health | public runtime returns `200` and expected titles | PASS | live HTTP checks executed during this audit for `https://hotel.hcasc.cz/*` |
