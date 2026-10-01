# Standalone Voice Core independent review

Six distinct Codex agents actually reviewed the complete candidate source. Execution, rather than JSON consistency, is the evidence. Source commit: `174813a95c985b648ac400555c71343fe292a82e`; tree: `912386250fcd83415be80673f194c331c0507228`; fingerprint: `032df5dc9c160c664a9c334f5edd3733c6ac7a09cb678ae8d2a0a69210546c73`. Only this document and the accompanying JSON are excluded from the source fingerprint.

| Area | Independent reviewer | Result |
|---|---|---|
| A / protocol | /root/review_a_protocol | PASS |
| B / security | /root/review_b_security | PASS |
| C / isolation | /root/review_c_isolation | PASS |
| D / deployment | /root/review_d_deployment | PASS |
| E / artifact_closure | /root/review_e_artifact_closure | PASS |
| F / test_gaps | /root/review_f_test_gaps | PASS |

Open findings: CRITICAL 0, HIGH 0, MEDIUM 0, LOW 0. Resolved findings and concrete regression evidence are recorded in [review JSON](voice-core-independent-review.json).

## A: protocol

Actual portable/server multipart, host API/RBAC/CSRF, runtime lifecycle and OpenAPI review; 23 server + 15 host tests and isolated TypeScript/boundary/normalized OpenAPI checks. Independently verified final full fingerprint and unchanged blobs, then rebuilt final runtime and ran 15 browser tests, zero skips. Final controller delta independently reviewed with identity of all other source modes/blobs verified: 7 regression tests and 8 additional error/redaction probes passed in an isolated copy. Voice multipart, lifecycle, API, RBAC/CSRF, client and database contracts are unchanged.

## B: security

Actual security review of AES-GCM, redaction, standalone session, credential timing, literal env/master preservation, narrow root authority and fail-closed runtime fence. 116 Python tests passed on unchanged blobs; final delta/fingerprint independently verified and 15 browser tests including private playback-error redaction passed. B-ENV-SQL resolved. Final controller delta independently reviewed with other security, production and workflow blobs verified identical: 82 regression tests and 12 boundary/redaction controls passed. The exact empty-listing exception stays fail-closed for all other errors; private stderr is not published. R-EMPTY-UNIT-LIST resolved.

## C: isolation

Actual portable/host import, routing, Docker/Compose/Nginx, no external provider/executor and unchanged business/Android/schema/client inspection. 43 Voice/API/tooling + 33 controller/env tests and 300 standalone policy combinations passed on unchanged blobs. Final independent copy-out rebuilt wheel/host ports/TypeScript and passed 23 server + 15 browser tests; boundary passed. Final controller delta independently reviewed with all other source blobs verified identical: 48 regression tests and 16 actual subprocess fixture cases passed, plus portable boundary and diff checks. R-EMPTY-UNIT-LIST resolved; portable/host isolation is unchanged.

## D: deployment

Actual exact-main CI/review/image/SSH, installed-root-module hash, worker cgroup/fence/deadline/acceptance and actual topology/source/env/image rollback review. 102 Python tests plus 4 independent PostgreSQL helper subtests passed, and final runtime 15 browser tests passed. Real Compose CLI confirmed PostgreSQL tag versus snapshot-ID hash difference; no live daemon exec-kill test claimed. D-SQL-QUOTE and D-PG-AUTH resolved. Final controller delta independently reviewed with other source blobs verified identical: 106 tests plus 10 subtests, 9 actual subprocess cases plus timeout, and installer Bash syntax passed. R-EMPTY-UNIT-LIST resolved. Native Ubuntu read-only absence probe was performed by root, not reviewer D.

## E: artifact_closure

Actual file-by-file review of all 76 modified/deleted/created source artifacts, active instructions, docs, fixtures, workflows, constraints and independent Android graph. 176 Python tests plus boundary/runtime-integrity/Ruff/Bash/JS/whitespace checks passed. Independently verified final single-blob delta/fingerprint and ran 15 browser tests, zero skips; no production acceptance claimed. Final controller/test/runbook delta independently reviewed: exactly three source files changed, 1542 other source entries verified identical. 88 tests, Ruff/diff and seven actual subprocess fixture cases passed; stale evidence was confirmed to block the changed source with full scope. R-EMPTY-UNIT-LIST resolved.

## F: test_gaps

Actual CI scope/aggregate/exact-main/source review, immutable images/controller/fence/private-env and Voice security/multipart test-gap review. 196 Python tests passed on unchanged blobs; final isolated TypeScript build and 15 browser tests passed, zero skips. Exercised actual Host worker start/stop commands and real Compose CLI hashes/literal env. F-AUDIO-COVERAGE resolved; live Docker daemon/systemd acceptance not claimed. Final controller delta independently reviewed with other source blobs verified identical: 48 tests, Ruff/diff and actual subprocess executable cases passed. Other arguments, quiet mode, nonempty streams, other returns and missing executable all fail; private stderr remains hidden. R-EMPTY-UNIT-LIST resolved.

Each reviewer independently bound the complete result to the final fingerprint, inspected the controller/test/runbook delta and verified unchanged previously tested blobs. The exact empty systemd listing was additionally exercised read-only on native production Ubuntu by root. Controller installation and runtime activation were not performed as part of source review.

CI/deployment tests run without production credentials or paid provider calls. GitHub exact-main CI and actual production runtime acceptance remain separate mandatory deployment conditions; this source report does not claim they have already occurred.
