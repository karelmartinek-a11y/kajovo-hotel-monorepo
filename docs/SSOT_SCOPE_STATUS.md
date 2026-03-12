# SSOT Scope/Status (Authoritative)

Date: 2026-03-12  
Authoritative snapshot base SHA: `44e4cde30b3f720ec0a46b15abc3b44ed1af061b`  
Authority: This is the single active status/scope/audit closure document for this repository.

## Release blockers (binary)
- `manifest_status`: PASS
- `scope_status`: PASS
- `deploy_verify_status`: PASS (gated by `scripts/release_gate.py` artifact for the exact released SHA)
- `open_findings_f01_f09`: 0

## F-01..F-09 closure status
- F-01: PASS — brand composition normalized to max 2 elements across shell/login/utility views.
- F-02: PASS — runtime timezone-safe day defaults replaced hardcoded date values in UI logic.
- F-03: PASS — device provisioning domain implemented (`register/status/challenge/verify`) with tests.
- F-04: PASS — report media pipeline implemented with thumbnails/original retrieval.
- F-05: PASS — inventory semantic parity documented and matrix aligned.
- F-06: PASS — admin profile + secure password change API/UI workflow implemented.
- F-07: PASS — breakfast IMAP smoke scenario implemented and wired to release gate checks.
- F-08: PASS — unified release gate script with archive artifact (date + SHA + checks) implemented.
- F-09: PASS — this SSOT established as sole authority; historical docs marked non-authoritative.

## Evidence index
- Implementation map: `docs/forensics/implementation-map-2026-03-12.md`
- Inventory mapping: `docs/forensics/inventory-legacy-parity-map-2026-03-12.md`
- Device tests: `apps/kajovo-hotel-api/tests/test_device_provisioning.py`
- Reports media tests: `apps/kajovo-hotel-api/tests/test_reports.py`
- Admin profile tests: `apps/kajovo-hotel-api/tests/test_admin_profile.py`
- Breakfast IMAP smoke: `apps/kajovo-hotel-api/tests/test_breakfast_imap_smoke.py`
- Unified gate: `scripts/release_gate.py`, workflow `.github/workflows/ci-gates.yml`

## Governance rule
Any future status/parity claim is valid only when it references:
1. exact commit SHA,
2. execution date/time,
3. release-gate artifact under `artifacts/release-gate/` for the same SHA.
