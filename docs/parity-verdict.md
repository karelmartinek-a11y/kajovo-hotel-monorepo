# Parity verdict: continue vs regenerate

## 1) Summary numbers

From `docs/feature-parity-matrix.csv`:
- Legacy features/capabilities tracked: **21**
- `FULLY_WORKING`: **7**
- `PARTIAL`: **6**
- `SKELETON`: **0**
- `MISSING`: **8**

Missing+skeleton ratio = **38.1%** (8/21).

## 2) Top 10 critical blockers

1. Missing admin auth/session model equivalent to legacy.
2. Missing portal login/forgot/reset flows.
3. Missing device registration/challenge/verify endpoints.
4. Missing users-management module (`/admin/users*` parity).
5. Missing settings/SMTP module (`/admin/settings*` parity).
6. Missing admin profile/password workflow parity.
7. Missing media authorization/thumbnail API path parity.
8. Missing breakfast scheduler/email ingest automation.
9. Inventory model divergence (ingredient/card/pictograms not preserved).
10. E2E test stack not runnable out-of-box in audited environment (missing browser binaries).

## 3) Operational readiness gaps

- Deploy and reverse-proxy cutover scripts exist, but smoke validation depends on externally running services.
- Backups/restores are available as PowerShell scripts, but no Linux-native equivalent observed.
- DB migrations are present and organized, but legacy-to-new functional migration is not fully represented as productionized workflow.
- Monitoring/observability exists for request context/logging in API, but no full parity evidence for legacy media/auth operational controls.

## 4) Recommendation

## **REGENERATE (constrained), not incremental hardening of all generated parts**

Rationale: The monorepo is strong for the five core business modules (breakfast, lost&found, issues, inventory, reports), but parity-critical identity/admin/automation surfaces exceed the 30% threshold of missing/skeleton-equivalent operational features (38.1% missing). Reconstructing these foundational cross-cutting capabilities on top of divergent assumptions (header RBAC vs cookie/session + device auth + portal auth) creates high integration risk and prolonged stabilization time. A constrained regeneration focused on preserving validated assets while rebuilding core architecture contracts is likely faster and safer.

## 5) Constrained regeneration plan

### Preserve

- Product/design SSOT and UX contracts: `ManifestDesignKájovo.md`, `apps/kajovo-hotel/ux/ia.json`.
- Brand assets and design tokens: `brand/**`, `packages/ui/**` (after targeted validation).
- Infra building blocks that already work conceptually: `infra/compose*.yml`, reverse-proxy switch/rollback scripts, smoke/verify skeletons.
- API domain schemas and module intent from existing CRUD modules where valid.

### Discard / rewrite

- Generated or partially aligned auth architecture in current API/web (`header-role-only` approach) where it conflicts with required legacy operational model.
- Module implementations with major domain divergence (notably inventory ingredient/card workflow and breakfast ingestion automation).
- Non-actionable broken generated fragments (including duplicate model-field definitions) that increase maintenance risk.

### Safe re-generation order

1. **Foundation contracts**: identity/auth contract (admin + portal + device), session model, permission matrix.
2. **Data model parity**: regenerate SQLAlchemy models + migrations from legacy parity map (including media + settings + user/auth tables).
3. **API layer**: regenerate/port endpoints module-by-module with contract tests first.
4. **Web layer**: regenerate IA-mapped routes preserving current IA/branding while reintroducing missing admin operational workflows.
5. **Infra + validation**: finalize compose/reverse-proxy/smoke; ensure Playwright browser provisioning in CI.
6. **Cutover rehearsal**: dry-run migration + smoke + rollback in staging before production hardening.
