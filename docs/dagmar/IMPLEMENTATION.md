# Dagmar implementation protocol

Status at the verified release checkpoint: Stage A (4398c656) and Stage B (ff67163d) deployed. Stage B production migration/API/responsive UI/export passed. Native acceptance and cost comparison have the limits recorded below; no physical acoustic claim. Physical iPhone test cancelled by user.
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

| Finding | Implemented / evidence | Remaining acceptance |
|---|---|---|
| V01 | Whole own UI/server packages; static and clean install/build/run copy-out | PASS production ff67163d |
| V02 | Encrypted bounded diagnostics; actual A production UI/API/export, synthetic recorder UI | B production UI/API passed; Safari formats not physically verified |
| V03 | Available archived logs examined; phase-safe errors added | October 3 cause remains unproven |
| V04 | Bounded genuine-human provenance; explicit writes after mail; injection regression | native paid mail scenario unavailable within remaining budget |
| V05 | Compatible tokenizer, explicit units, separate byte cap, pinned profile/inventory | no provider-exact tokenizer claim |
| V06 | Unified facts/notes/summaries search and responsive list/read | PASS production read |
| V07 | Coalesced shared invalidation; strong forget barrier and provider-item deletion | PASS production release |
| V08 | Safe error phase/code/class/status/stack, curator skip metadata | historical root causes not reconstructed without evidence |
| V09 | Protected profile; playback-ready one greeting, logical-call CAS and drain/interruption | paid native greeting not measured |
| V10 | Concise accepted acknowledgements, honest partial/uncertain/rejected, exact readback preserved | native isolated control timed out before mutation; no success claim |
| V11 | Mic gate/checkbox/manual interrupt removed; AEC/settings recorded; native synthetic barge-in passed | physical iPhone test cancelled by user; acoustics unverified |
| V12 | Epoch/turn/response fences, dedup/continuation and unsent/sent distinction | event race regression and synthetic native barge-in passed |
| V13 | Unique response usage, cache/modalities, curator/transcription, versioned pricing | missing usage remains unknown; no invoice agreement claim |
| V14 | Deduplicated session updates, bounded inventory/curation, native policy token measurement | no comparable provider before/after saving established |
| V15 | Public HTTPS-only HA boundary/redirect protection | MCP server changes remain separate and out of scope |
| V16 | Mail envelope request_id and per-request HTTP/X-Request-ID correlation | absent optional remote headers do not block calls |
| V17 | Own shared-space migration; IDs/revisions/origins/receipts preserved in real PG restore | PASS production migration/verification |
| V18 | Existing model guard/contract matrix and fallback validation preserved | native capability coverage incomplete |

Paid ledger: USD **9.914630 committed/held**, USD **0.085370 available** from the
shared USD 10 cap. These are reservations plus reconciled charges, **not a bill**.
The completely measured Realtime subset is USD 0.0546296; missing response and
transcription usage keep their reservations locked. A first harness attempt failed
before response usage because its socket wrapper used an unsupported iterator;
that mistake was corrected but its unknown reservation was not released.
A bounded native `gpt-realtime-2.1` WebRTC synthetic speech/barge-in test passed.
Two short isolated MCP tests reached catalog/search/describe but did not send a
control before the budget watchdog: FAIL, not completed control acceptance.
No additional meaningful conservative native test fits the remaining reservation.
No real SMTP/device write occurred. Native mail/readback, isolated control completion
and comparative cost savings remain unverified. [Ledger](evidence/paid-ledger.json),
[native barge-in](evidence/native-2.json), [control attempt](evidence/native-3.json),
[second control attempt](evidence/native-4.json).

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
- At the Stage A checkpoint paid usage was USD 0; subsequent Stage B calls are accounted above. No production MCP mutation or SMTP send performed. User cancelled the mandatory physical iPhone test on 2026-10-04. Physical baseline/final acoustics are unverified and no longer an acceptance blocker.

Rollback for Stage A: use the prior exact release/image through the authorized deployment gate; preserve the separate diagnostic volume and its independent content key. Diagnostic schema v1 does not modify hotel memory or consent journals. Never replace the live hotel DB with the restore-drill copy.

Stage A exact-SHA CI/deploy/runtime/API checkpoint: [sanitized evidence](evidence/stage-a-4398c656.json). Synthetic fixture 5b77fe714de346fab2d7b3c1076d257e was inspected through the real production UI, downloaded, then explicitly deleted as disposable acceptance data. No real call content is published.

## Stage B historical implementation checkpoints

Before the ff67163d commit, the implementation extracted full browser panels/console and server orchestration,
MCP clients/catalog validation, confirmation logic, configuration/key storage, memory,
curation, logical call journal and own schema migrations. Hotel modules are compatibility
imports and a technical/auth adapter; no portable module imports hotel models/routes.
The clean copy-out installs generic Voice Core and Dagmar packages plus the standalone
host into an empty directory with its own venv/node_modules. Independent install, tests,
UI build and running test-auth API/own DB/mock provider passed. This does not prove a
paid native provider scenario or real acoustics. At that historical checkpoint, production still ran Stage A 4398c656.

Earlier Stage B checkpoint checks: portable server 14 passed, core browser 16 passed, diagnostic
browser four passed, host memory/diagnostic API 31 passed, targeted lifecycle last run
50 passed. The final full release gate must pass before commit/push/deploy.
Own shared-space migration preserves source tables and IDs/revisions/lineage; receipts
retain original IDs and backend author namespaces with original-key recovery.
PostgreSQL migration/restore and responsive UI passed as recorded below. Complete
native scenarios/cost comparison remain limited by the paid ledger; final exact-SHA
CI/deployment and production verification are still required.
No Stage B completion claim is made. Physical iPhone acceptance was explicitly cancelled
by the user and is not an outstanding dependency.

Current additional Stage B evidence: authenticated responsive memory UI 6/6, registry 3/3,
mail 3/3, diagnostics 3/3 (actual two browser streams and playable reconstructed export).
PostgreSQL 16.4 own empty-schema and production API image journal/consent checks passed.
A fresh protected production dump (4,309,485 bytes) restored into an internal-network
PostgreSQL 16.4 container and migrated with exact projected-field checksums/counts.
The drill exposed a verifier bug for journals whose primary key is request_id rather
than id; the projection now uses each table's actual primary-key tuple. Source tables
remain untouched, rerun is idempotent, 11 existing facts, 2 notes and 4 summaries are
preserved in this dated snapshot. [Sanitized migration proof](evidence/stage-b-restore-migration.json).
This is a restore drill, not the production migration. The final gate rerun is required
because the verifier and lifecycle fixtures changed after the prior run began.

## Scenario evidence boundaries

| Area | Environment and observed result |
|---|---|
| Debug UI/audio | Isolated real Chromium API/UI: desktop/tablet/phone, on/off/flush/reconnect, orange DEBUG and keyboard; two existing recorder streams and playable segment export passed. Unsupported MIME, upload failure, offline/backpressure, pagehide and generation fences are package regressions. No Safari physical PASS. |
| Quota/security | Own storage tests: exact four decimal pools, reservation concurrency, oldest closed eviction, open/pinned protection, atomic pin refusal, orphan recovery, complete active delete fence, encryption/redaction and unknown usage. Host API tests cover anonymous/nonvoice/CSRF/ownership/revocation. A production fixture export/pin/delete passed. |
| Memory | Own and host tests: two authorized namespaces, note retrieval at small context, receipt collision/conflict, migration lineage, post-mail explicit intent and tool injection, protected profile, revision conflict, shared invalidation/forget. Own actual PostgreSQL image passed. |
| Lifecycle/consent | Mock provider/tool tests cover reorder, unknown response, late result, cancel unsent, original sent recovery, reconnect/rate limit, full mail/registry matched audio/drain and no interrupted consent. Native synthetic barge-in passed; full native mail/control not passed. |
| Cost | Unique usage and modality/cache regressions, scalar curator cache, atomic concurrent paid ledger passed. Native response data stored in sanitized evidence. Tool-schema JSON bytes are not tokens. No claimed saving percentage. |
| Portability | Clean directory with only four packages and minimal test-auth host, separate venv/node_modules, own schema/database, mock provider and isolated public MCP contract: install/build/server/API passed. Own generated OpenAPI/TS checked without host schemas. |
| Recovery | Fresh protected production snapshot restored on PostgreSQL 16.4; source projected checksums/counts preserved. Post-migration backup/new-write/original-key replay and separate key restoration drill: see recovery proof and runbook. |

Classifications supported by these runs: native synthetic barge-in is a genuine
input turn; late/orphan response behavior is proved by isolated lifecycle tests.
Pickup/echo and correctly heard but wrongly interpreted native control are not
established by the short catalog-only failures. Those runs and the October 3
incident remain unknown where lifecycle/audio evidence is missing. Transcript
similarity alone is not used as a universal input prohibition.

[Compatible recovery/rollback procedure](ROLLBACK.md). The original private memory
tables are preserved import sources, not an acceptable live rollback read path.
Physical iPhone acceptance was cancelled by the user; no physical acoustic success
is claimed. Automatic mutations only used isolated transports/fixtures.

The final responsive run exposed a concurrent deterministic-profile INSERT despite
green browser assertions. Profile seeding now uses a nested transaction and resolves
the already committed profile on uniqueness conflict. A forced concurrent two-call
regression returns one durable pinned ID/revision; no exception/body is published.
Migration checksum ordering also handles non-id primary keys deterministically.

A fresh pre-deploy backup and another isolated post-migration restore/key drill
passed immediately before the main push. See [backup metadata](evidence/stage-b-predeploy-backup.json)
and [fresh recovery proof](evidence/stage-b-predeploy-recovery.json). Keys and data
remain in the protected directory; only counts/hashes are published.

## Final local checkpoint before Stage B push

All 28 release-gate checks passed on the frozen working tree (parent HEAD 4398c656;
this is not an exact B CI claim). API/core/Dagmar suite: 587 passed. Own isolated
server suite: 19 passed; generic server copy-out: 22 passed. Browser core: 16;
Dagmar diagnostics browser: 4. Responsive UI: baseline 6, memory 6, registry 3,
mail 3, diagnostics 3, generic Chromium/WebKit console 8 passed. Own contract check,
static boundaries, clean whole-product install/build/run, typecheck and builds passed.
Docker API import/PostgreSQL regression and fresh restore/new-write/key drill passed.
Full UI logs after the profile fix contain no duplicate profile exception.
The existing fixture breakfast scheduler messages are not voice/model failures.
No paid scenario ran in the release gate.

Stage B push/CI/deployment evidence will be collected after this source checkpoint;
production still runs Stage A at the time of this commit. The deployment pipeline
requires successful exact-SHA push CI and current main; there is no deploy bypass.

## Verified Stage B release checkpoint

Commit/main push: `ff67163d3f27935d248e4bc09f83dfe7315e5016`.
[Exact CI](https://github.com/karelmartinek-a11y/kajovo-hotel-monorepo/actions/runs/37217614892)
and [exact deploy](https://github.com/karelmartinek-a11y/kajovo-hotel-monorepo/actions/runs/37218084330)
succeeded. Runtime artifact confirms that SHA and healthy PostgreSQL/API/web/admin.
[Complete sanitized runtime/API/UI/cleanup proof](evidence/stage-b-ff67163d.json).

All original projected rows match the fresh protected backup hashes/counts in live
PostgreSQL: memory IDs/revisions/origins, notes/items/tombstones/summaries and
confirmation/idempotency journals. Public API inventory is 12 facts (11 preserved
plus the approved pinned profile) and two notes; four existing summaries preserved.
No content is in this report. The configured native model is gpt-realtime-2.1;
no provider call was made during this production acceptance.

Actual authenticated production Chromium UI passed at desktop 1440×900, tablet
834×1112 and phone 390×844: own panels/list retrieval, old speaker/manual-interrupt
controls absent, next-call debug off, exact protected manifest/partial disclosure,
no page errors or horizontal overflow. This automated browser is distinct from the
user's manually logged-in Chrome, whose Mac was locked at the final checkpoint.
No screenshot containing private memory was published.

Production HTTPS/API passed anonymous 401, CSRF 403, no-store and all four exact
capacity maxima. A disposable, explicitly synthetic debug fixture uploaded two
WAV sources, exported playable audio with checked object hashes/redaction and a
partial manifest, then pinned successfully. Export 28672 bytes, SHA256
`e7669c6e15705303bce0ba186ba14db7a5f8c9f9efab2ba887e21d74f83be63d`.
It was explicitly deleted afterwards; detail/export return 404 and listing omits
it. Real records were untouched. This is fixture ingestion/export evidence, not
actual microphone capture, native provider output or physical acoustic success.

Debug on/off/orange orb and actual MediaRecorder segment reconstruction passed in
isolated responsive UI. Production capture during a paid call, native isolated
control completion, native mail/readback and comparable before/after cost savings
remain unverified under the exhausted conservative test allowance. The cancelled
physical iPhone test is not an acceptance dependency. October 3 cause remains
unproven. No MCP server was changed and no real SMTP/device mutation was tested.

The release checkpoint is recorded separately from a later documentation-only
commit. That commit must use the same normal CI/deploy gate; its runtime SHA is
reported in the handoff. No application code changes follow ff67163d here.
