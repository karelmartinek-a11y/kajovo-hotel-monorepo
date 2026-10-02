# Standalone Voice Core independent review

Six distinct Codex agents actually reviewed the complete candidate source. Execution, rather than JSON consistency, is the evidence. Source commit: `4e542f4e6d51615706f963b4632a0c6023c067d0`; tree: `ab92b231c2117416dd586d2ba331028a126eb2ac`; fingerprint: `1a37c1442bf6b378b33f6a67620bd686f2132f0c7dd57f8817e3df7fdcb2872f`. Only this document and the accompanying JSON are excluded from the source fingerprint.

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

Actual portable/server multipart, host API/RBAC/CSRF, runtime lifecycle and OpenAPI review; 23 server + 15 host tests and isolated TypeScript/boundary/normalized OpenAPI checks. Independently verified final full fingerprint and unchanged blobs, then rebuilt final runtime and ran 15 browser tests, zero skips. Final controller delta independently reviewed with identity of all other source modes/blobs verified: 7 regression tests and 8 additional error/redaction probes passed in an isolated copy. Voice multipart, lifecycle, API, RBAC/CSRF, client and database contracts are unchanged. Final container Git trust delta independently reviewed with all 1540 other source entries verified identical: 28 actual workflow tests passed, zero skips. Voice protocol/API/contracts/controller are unchanged. Exact workspace trust precedes source gate; R-GIT-WORKSPACE resolved.

## B: security

Actual security review of AES-GCM, redaction, standalone session, credential timing, literal env/master preservation, narrow root authority and fail-closed runtime fence. 116 Python tests passed on unchanged blobs; final delta/fingerprint independently verified and 15 browser tests including private playback-error redaction passed. B-ENV-SQL resolved. Final controller delta independently reviewed with other security, production and workflow blobs verified identical: 82 regression tests and 12 boundary/redaction controls passed. The exact empty-listing exception stays fail-closed for all other errors; private stderr is not published. R-EMPTY-UNIT-LIST resolved. Final exact-workspace Git trust security delta independently verified: 28 workflow tests passed, zero skips; actual Git rejects the other repository. Trusted checkout, trust, source gate, candidate checkout, image verification and credentials remain ordered. R-GIT-WORKSPACE resolved; no new GitHub deploy claimed.

## C: isolation

Actual portable/host import, routing, Docker/Compose/Nginx, no external provider/executor and unchanged business/Android/schema/client inspection. 43 Voice/API/tooling + 33 controller/env tests and 300 standalone policy combinations passed on unchanged blobs. Final independent copy-out rebuilt wheel/host ports/TypeScript and passed 23 server + 15 browser tests; boundary passed. Final controller delta independently reviewed with all other source blobs verified identical: 48 regression tests and 16 actual subprocess fixture cases passed, plus portable boundary and diff checks. R-EMPTY-UNIT-LIST resolved; portable/host isolation is unchanged. Final container Git trust isolation delta independently verified with other blobs identical: 28 workflow tests plus actual independent Git path/ownership/changed-candidate probe, boundary and diff checks passed. Exact workspace with spaces works; another repository remains rejected after checkout. R-GIT-WORKSPACE resolved.

## D: deployment

Actual exact-main CI/review/image/SSH, installed-root-module hash, worker cgroup/fence/deadline/acceptance and actual topology/source/env/image rollback review. 102 Python tests plus 4 independent PostgreSQL helper subtests passed, and final runtime 15 browser tests passed. Real Compose CLI confirmed PostgreSQL tag versus snapshot-ID hash difference; no live daemon exec-kill test claimed. D-SQL-QUOTE and D-PG-AUTH resolved. Final controller delta independently reviewed with other source blobs verified identical: 106 tests plus 10 subtests, 9 actual subprocess cases plus timeout, and installer Bash syntax passed. R-EMPTY-UNIT-LIST resolved. Native Ubuntu read-only absence probe was performed by root, not reviewer D. Final container Git trust deployment delta independently verified with production/controller/transport/image blobs identical: 46 regression tests and additional actual Git path-with-space/dollar probe passed; neighboring and nested repositories remain rejected. Trust survives verified checkout, precedes source gate/credentials. R-GIT-WORKSPACE resolved.

## E: artifact_closure

Actual file-by-file review of all 76 modified/deleted/created source artifacts, active instructions, docs, fixtures, workflows, constraints and independent Android graph. 176 Python tests plus boundary/runtime-integrity/Ruff/Bash/JS/whitespace checks passed. Independently verified final single-blob delta/fingerprint and ran 15 browser tests, zero skips; no production acceptance claimed. Final controller/test/runbook delta independently reviewed: exactly three source files changed, 1542 other source entries verified identical. 88 tests, Ruff/diff and seven actual subprocess fixture cases passed; stale evidence was confirmed to block the changed source with full scope. R-EMPTY-UNIT-LIST resolved. Final five-file Git trust/test/instruction/runbook/matrix delta independently reviewed with 1540 other source entries identical: 46 tests passed, zero skips, plus Ruff/whitespace. Actual Git scope and subsequent checkout passed; stale evidence rejected current source with full profile. R-GIT-WORKSPACE resolved.

## F: test_gaps

Actual CI scope/aggregate/exact-main/source review, immutable images/controller/fence/private-env and Voice security/multipart test-gap review. 196 Python tests passed on unchanged blobs; final isolated TypeScript build and 15 browser tests passed, zero skips. Exercised actual Host worker start/stop commands and real Compose CLI hashes/literal env. F-AUDIO-COVERAGE resolved; live Docker daemon/systemd acceptance not claimed. Final controller delta independently reviewed with other source blobs verified identical: 48 tests, Ruff/diff and actual subprocess executable cases passed. Other arguments, quiet mode, nonempty streams, other returns and missing executable all fail; private stderr remains hidden. R-EMPTY-UNIT-LIST resolved. Final container Git trust delta independently reviewed with 1540 other source entries identical: 28 actual workflow tests, Ruff/diff passed; other repository stays rejected after next checkout. Independently read failed Deploy36943854767 metadata confirming pre-credentials source gate failure and skipped acceptance. R-GIT-WORKSPACE resolved; new deployment not yet claimed.

Each reviewer independently bound the complete result to the final fingerprint, inspected the exact-workspace Git trust/test/instruction/runbook/matrix delta and verified unchanged previously tested blobs. Root also exercised the actual trust command on native Ubuntu using isolated synthetic repositories with genuinely different ownership; production runtime remained unchanged.

CI/deployment tests run without production credentials or paid provider calls. GitHub exact-main CI and actual production runtime acceptance remain separate mandatory deployment conditions; this source report does not claim they have already occurred.
