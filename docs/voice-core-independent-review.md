# Standalone Voice Core independent review

Six distinct Codex agents actually reviewed the complete candidate source. Execution, rather than JSON consistency, is the evidence. Source commit: `6ef37e32cf19b4b59efe3a2e90fa35f5957b10a6`; tree: `2ee6855d9e315655bac1523864d5b1e6ae6ac43d`; fingerprint: `01f044a9b9055d631d8378b1d1c6e5a0b3a818c3b7dec317284773459bda6f61`. Only this document and the accompanying JSON are excluded from the source fingerprint.

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

Actual portable/server multipart, host API/RBAC/CSRF, runtime lifecycle and OpenAPI review; 23 server + 15 host tests and isolated TypeScript/boundary/normalized OpenAPI checks. Independently verified final full fingerprint and unchanged blobs, then rebuilt final runtime and ran 15 browser tests, zero skips.

## B: security

Actual security review of AES-GCM, redaction, standalone session, credential timing, literal env/master preservation, narrow root authority and fail-closed runtime fence. 116 Python tests passed on unchanged blobs; final delta/fingerprint independently verified and 15 browser tests including private playback-error redaction passed. B-ENV-SQL resolved.

## C: isolation

Actual portable/host import, routing, Docker/Compose/Nginx, no external provider/executor and unchanged business/Android/schema/client inspection. 43 Voice/API/tooling + 33 controller/env tests and 300 standalone policy combinations passed on unchanged blobs. Final independent copy-out rebuilt wheel/host ports/TypeScript and passed 23 server + 15 browser tests; boundary passed.

## D: deployment

Actual exact-main CI/review/image/SSH, installed-root-module hash, worker cgroup/fence/deadline/acceptance and actual topology/source/env/image rollback review. 102 Python tests plus 4 independent PostgreSQL helper subtests passed, and final runtime 15 browser tests passed. Real Compose CLI confirmed PostgreSQL tag versus snapshot-ID hash difference; no live daemon exec-kill test claimed. D-SQL-QUOTE and D-PG-AUTH resolved.

## E: artifact_closure

Actual file-by-file review of all 76 modified/deleted/created source artifacts, active instructions, docs, fixtures, workflows, constraints and independent Android graph. 176 Python tests plus boundary/runtime-integrity/Ruff/Bash/JS/whitespace checks passed. Independently verified final single-blob delta/fingerprint and ran 15 browser tests, zero skips; no production acceptance claimed.

## F: test_gaps

Actual CI scope/aggregate/exact-main/source review, immutable images/controller/fence/private-env and Voice security/multipart test-gap review. 196 Python tests passed on unchanged blobs; final isolated TypeScript build and 15 browser tests passed, zero skips. Exercised actual Host worker start/stop commands and real Compose CLI hashes/literal env. F-AUDIO-COVERAGE resolved; live Docker daemon/systemd acceptance not claimed.

The last delta preserves four existing audio tests. Each reviewer independently bound the result to the final fingerprint and inspected the actual delta; unchanged previously tested blobs were verified rather than assumed. CI/deployment tests run without production credentials or paid provider calls. GitHub exact-main CI and actual production runtime acceptance remain separate mandatory deployment conditions; this source report does not claim they have already occurred.
