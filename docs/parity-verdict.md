HISTORICAL DOCUMENT - superseded by docs/SSOT_SCOPE_STATUS.md (2026-03-12).

# Parity verdict: continue vs regenerate

## Summary numbers

From `docs/feature-parity-matrix.csv` after the latest inventory, ops hardening and breakfast mail-ingestion removal wave:

- Legacy capabilities tracked: **21**
- `FULLY_WORKING`: **19**
- `PARTIAL`: **1**
- `REMOVED`: **1**
- `MISSING`: **0**

The repo no longer sits in a "regenerate core architecture" state and no longer carries the previously open P2 operational parity gaps. The remaining `PARTIAL` row is limited to one report lifecycle UX detail. The former breakfast mail-ingestion path is no longer tracked as an open gap because it was explicitly removed from the target product.

Implemented and verified:

- server-side admin/session model
- device lifecycle
- report media flow
- admin profile/password
- portal self-service password change
- live admin dashboard KPI
- non-stub housekeeping admin surface
- guarded inventory bootstrap
- explicit SMTP operational status
- legacy inventory ingredient/card split and card workbench
- backup manifest/checksum, forced restore integrity checks and safer deploy verification
- removed breakfast IMAP/mail scheduler codepath from the active backend

## Current verdict

## **CONTINUE incrementally, do not regenerate**

Rationale:

- The backend and both UI surfaces have working auth/session contracts, real CRUD modules and end-to-end evidence.
- The previous parity blockers are closed.
- The remaining work is minor release hardening, not architecture replacement.

## What is still open

1. Reports status lifecycle uses generic update flow rather than dedicated done/reopen commands.

## Recommendation

Proceed only with constrained hardening:

1. Keep the new critical visual baseline in release gating and use the full snapshot matrix only as extended audit sweep.
2. Decide whether reports need dedicated done/reopen commands or whether generic status mutation remains acceptable.

## What not to do

1. **Foundation contracts**: identity/auth contract (admin + portal + device), session model, permission matrix.
2. **Data model parity**: regenerate SQLAlchemy models + migrations from legacy parity map (including media + settings + user/auth tables).
3. **API layer**: regenerate/port endpoints module-by-module with contract tests first.
4. **Web layer**: regenerate IA-mapped routes preserving current IA/branding while reintroducing missing admin operational workflows.
5. **Infra + validation**: finalize compose/reverse-proxy/smoke; ensure Playwright browser provisioning in CI.
6. **Cutover rehearsal**: dry-run migration + smoke + rollback in staging before production hardening.

