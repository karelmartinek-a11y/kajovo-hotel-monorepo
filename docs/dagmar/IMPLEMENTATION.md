# Dagmar implementation protocol

Status: implementation in progress; neither stage is accepted or deployed.
Baseline: d590599121023d877a011d85d0c025726e67569f, verified 2026-10-04.
The original Documents/GitHub checkout is protected and is not used for edits.

## Impact matrix

| Surface | Action |
|---|---|
| Browser, sideband, persistence | update; retain Stage A behavior baseline |
| Data and migrations | add isolated diagnostic store; Stage B own PostgreSQL schema and preservation migration |
| Tests | add behavioral diagnostics, concurrency, RBAC, media and migration scenarios |
| CI | add portable Dagmar contracts/copy-out; retain required gates |
| Docs and disclosure | update with debug content, shared memory and recording limitations |
| AGENTS/comments | update superseded policies together with their implementation |
| Fixtures | isolated MCP/SMTP and test memory only; no production mutation smoke |
| Generated API/client | regenerate after route changes |
| Build/runtime | explicit dependencies, volume/key provisioning, Docker import |

## Acceptance tracking

V01 portability pending; V02 diagnostics pending; V03 historical incident unknown;
V04 mail provenance pending; V05 token/inventory pending; V06 notes retrieval pending;
V07 shared invalidation pending; V08 safe errors pending; V09 persona/greeting pending;
V10 brevity pending; V11 physical acoustic acceptance waiting (iPhone unavailable);
V12 turn coordinator pending; V13 usage pending; V14 measured optimization pending;
V15 external HA server work out of scope; V16 Mail correlation pending;
V17 shared memory migration pending; V18 capability matrix pending.

Paid implementation usage so far: USD 0. Shared maximum: USD 10 for both stages.
No paid provider call is permitted without an atomic reservation ledger.
No actual SMTP or device mutation is authorized by the acceptance plan.

## Release requirements

Each stage: local gates, commit and fast-forward HEAD:main push, successful exact-SHA CI,
server-authoritative deploy, runtime artifact/image/health and authenticated UI/API proof.
Back up data and separately managed content keys and perform an isolated restore drill
before production migration. Never restore a test backup over live data.
Stage A is not completion of the complete assignment.

## Stage A local evidence (2026-10-04)

- Complete release gate passed before the final tracing/auth/export hardening; final rerun required before commit.
- Current hotel unit baseline: 566 passed; standalone diagnostic tests: 9 passed; targeted Smart/Mail/diagnostics: 112 passed. Final sideband capture test adds pre-on/post-off fencing, ordinary mail preservation, secret redaction, remote Mail request correlation and separate curator usage.
- Real authenticated UI/API tests: desktop 1440x900, tablet 834x1112, phone 390x844, all three passed. Provider peer is isolated. Existing microphone/remote MediaRecorder streams are real browser fixtures. Four reconstructed track segments after two debug toggles were decoded with positive duration. This is Chromium synthetic evidence, not Safari or physical acoustics.
- Native authenticated export now streams through browser download without a full JS Blob or permanent server copy. RBAC is revalidated during streaming, bypassing the host per-request auth cache. Cross-site browser exports are rejected.
- Diagnostic-only copy-out installed into an empty directory and Python venv, built browser packages with their own node_modules, started its test-auth server, and passed HTTP/auth/storage/export plus package tests. Whole Dagmar portability remains pending.
- Actual production PostgreSQL image 16.4-alpine preservation regression passed. Production backup of 4298648 bytes restored into an isolated network-none PostgreSQL 16.4-alpine container: 51 public tables, matching live schema count. Protected backup directory: /home/deploy-hotel/kajovo-protected-backups/dagmar-20261004-stage-a. Separate diagnostic key backup verified byte-equal; no key is in this protocol or manifest. The drill container was removed.
- Live source log recheck: available JSON timestamps start 2026-10-04T00:57:00.709607+00:00. 188 voice events include 171 response, six ready, six Mail delivery and five technologies events. These fragments do not establish the October 3 incident cause, acoustic success, billable price or complete call lifecycle.
- Paid usage remains USD 0. No production MCP mutation or SMTP send performed. iPhone unavailable; physical baseline and final acoustic acceptance remain waiting.

Rollback for Stage A: use the prior exact release/image through the authorized deployment gate; preserve the separate diagnostic volume and its independent content key. Diagnostic schema v1 does not modify hotel memory or consent journals. Never replace the live hotel DB with the restore-drill copy.
