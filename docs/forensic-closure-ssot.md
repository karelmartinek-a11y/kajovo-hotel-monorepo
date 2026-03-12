# Forensic closure SSOT (current)

- Date (UTC): 2026-03-12
- Commit SHA binding rule: use `git rev-parse HEAD` at verify/release time for this exact tree.
- Scope: authoritative closure status for active forensic blockers handled in this change-set.

## Implementation map

| Finding | Files changed | System change | Tests / checks | Done criterion |
|---|---|---|---|---|
| F-01 Brand composition >2 elements | `packages/ui/src/shell/AppShell.tsx`, `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-admin/tests/ci-gates.spec.ts` | Unified default shell composition to max 2 non-popup brand elements (wordmark + sign); login keeps exactly 2 (wordmark + figure). | `pnpm --filter @kajovo/kajovo-hotel-admin lint`; Playwright gate spec (`brand elements convention`) | PASS when `[data-brand-element="true"] <= 2` on routed views. |
| F-02 Hardcoded service date | `apps/kajovo-hotel-admin/src/dateDefaults.ts`, `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-admin/tests/ci-gates.spec.ts` | Replaced hardcoded defaults with runtime local-date utility (`toLocalDateInputValue`) used in breakfast + inventory defaults. | `pnpm --filter @kajovo/kajovo-hotel-admin lint`; grep check for removed `defaultServiceDate`; timezone-aware Playwright test added. | PASS when defaults are generated from runtime local day and hardcoded `defaultServiceDate` is absent. |

## Release evidence (this change-set)

1. TypeScript gate for admin frontend must pass.
2. Brand-gate and date-default Playwright specs are in CI gate suite (execution may depend on browser artifact availability in environment).
3. Screenshot evidence archived: admin login brand composition.

## Document governance

This file is the active SSOT for this change-set. Older audit summary files remain historical context and are non-authoritative for this delta unless they explicitly reference this file and commit SHA.
