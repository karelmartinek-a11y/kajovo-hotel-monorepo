# Release checklist (kajovo-hotel-web)

## 1) State completeness audit
- Verify every IA route supports `?state=loading|empty|error|offline|maintenance|404` and renders the correct `StateView`/skeleton.
- Validate all empty states expose at least one actionable CTA (create item, refresh, or navigate back).
- Validate all error states expose a recovery action (reload/retry/navigation fallback).
- Validate global states `/offline`, `/maintenance`, `/404` include recovery navigation.

## 2) Visual and responsive quality
- Run Playwright visual tests for 390 / 820 / 1440 snapshots.
- Confirm no unintended horizontal overflow outside `.k-table-wrap`.
- Confirm skeletons reserve space (no visible layout shift when data loads).
- Confirm SIGNACE remains visible and unobstructed on all key routes.

## 3) Performance-safe defaults
- Confirm route-level lazy loading still works for utility routes (`/intro`, `/offline`, `/maintenance`, `/404`).
- Confirm fallback skeleton is shown while lazy route chunks load.
- Confirm skeleton animation respects `prefers-reduced-motion: reduce`.

## 4) Pre-production gates
- Run type/lint checks for touched packages.
- Run full Playwright suite including CI gates and navigation robustness.
- Review changed snapshots to ensure they reflect intentional UI updates only.
- Smoke test create/edit/detail workflows for: Breakfast, Lost&Found, Issues, Inventory, Reports.
