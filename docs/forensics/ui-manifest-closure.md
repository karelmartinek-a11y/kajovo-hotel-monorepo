# UI Manifest Closure

Date: 2026-03-12
Working HEAD before commit: `1f87d229d55787c386f61bc7a111ccb6cfa09011`
Scope: frontend, manifest design, UX, responsive behavior, utility states, and frontend guardrails.

## Original problem
- Intro states in admin and portal were still generic utility placeholders instead of a real Kájovo full-lockup intro required by `ManifestDesignKájovo.md` NORMA F.
- Intro composition could exceed the manifest maximum of two brand elements because the shell header wordmark stayed visible together with floating signace and the new intro branding.
- Reduced-motion support was incomplete because the shell skip link always requested smooth scrolling.
- Login flows still carried placeholder-style hints that were not necessary in final UI.
- There was no dedicated automated frontend guard against forbidden utility copy, reintroduced fixed dates, or login placeholder regressions.
- Frontend verification around signace, utility states, and responsive overflow was present only partially and not explicit enough for the current manifest closure.

## Exact repair
- Added a shared `KajovoFullLockup` component backed by the real exported full logo asset and used it on both intro routes.
- Reworked admin and portal intro routes into final utility layouts with finished copy, CTA hierarchy, and spacing that preserves signace clearance.
- Updated `AppShell` so intro routes suppress the header wordmark, preserving manifest max two brand elements while keeping floating signace outside popups.
- Made signace href context-aware and removed dead `showFigure` drift from the route layer.
- Respect `prefers-reduced-motion` in the skip-link scroll behavior and hardened reduced-motion CSS.
- Removed unnecessary login placeholders and restored `alertdialog` semantics for admin login failure feedback.
- Added a blocking frontend manifest guard script and expanded Playwright guard coverage for intro, utility states, responsive overflow, reduced motion, and runtime token usage.
- Corrected admin signage route tests to use the real `/admin/` basename.

## Evidence in code
- Shared shell and brand layer:
  - `packages/ui/src/shell/AppShell.tsx`
  - `packages/ui/src/shell/KajovoSign.tsx`
  - `packages/ui/src/shell/KajovoWordmark.tsx`
  - `packages/ui/src/shell/KajovoFullLockup.tsx`
  - `packages/ui/src/tokens.css`
  - `packages/ui/src/index.ts`
- Portal/admin route and login fixes:
  - `apps/kajovo-hotel-web/src/routes/utilityStates.tsx`
  - `apps/kajovo-hotel-admin/src/routes/utilityStates.tsx`
  - `apps/kajovo-hotel-web/src/admin/AdminLoginPage.tsx`
  - `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx`
  - `apps/kajovo-hotel-web/src/admin/AdminRoutes.tsx`
  - `apps/kajovo-hotel-web/src/portal/PortalRoutes.tsx`
- Guardrails and tests:
  - `scripts/check_frontend_manifest_guards.py`
  - `package.json`
  - `apps/kajovo-hotel-web/tests/ci-gates.spec.ts`
  - `apps/kajovo-hotel-web/tests/accessibility.spec.ts`
  - `apps/kajovo-hotel-admin/tests/ci-gates.spec.ts`
  - `apps/kajovo-hotel-admin/tests/signage-routes.spec.ts`

## How it was tested
- Static and source guardrails:
  - `python scripts/check_mojibake.py`
  - `python scripts/check_frontend_manifest_guards.py`
  - `pnpm typecheck`
- Frontend builds:
  - `pnpm --filter @kajovo/kajovo-hotel-web build`
  - `pnpm --filter @kajovo/kajovo-hotel-admin build`
- Portal preview verification:
  - targeted `ci-gates.spec.ts` run for intro brand count, utility-state signace clearance, reduced-motion skip link, runtime token usage, and responsive no-overflow
  - `accessibility.spec.ts`
  - `signage-routes.spec.ts`
- Admin preview verification:
  - targeted `ci-gates.spec.ts` run for intro brand count, utility-state signace clearance, reduced-motion skip link, runtime token usage, and responsive no-overflow
  - `signage-routes.spec.ts`

## Result
- Non-popup intro views are back within the manifest limit of two brand elements.
- Intro, offline, maintenance and 404 states for admin and portal are visually finished instead of placeholder utility screens.
- Floating signace remains present outside popups and is explicitly tested for visibility and non-overlap on utility views.
- Reduced motion is honored in shared shell behavior, not only in decorative animation CSS.
- Frontend source now has a dedicated blocking guard against forbidden utility copy, placeholder regressions, and fixed production dates.
