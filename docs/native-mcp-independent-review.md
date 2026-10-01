# Independent Codex multi-agent forensic review

Result: **PASS — source review**, 2026-10-01. Production acceptance: **NOT_RUN**.

Hotel source: `381beeda2f550c4002616280fb0f9589687d02c2`; complete fingerprint `44259f65d6918c1676928870c4273cae812e15b35ae76ba6949bbe8a7f72ce69`.

MCP source: `178a87c088a1439864405f4fae340ac702a49a85`; complete fingerprint `668324b49c01d451f9650c0b216d4bd8d446b498987c9eb17aafc1fb2f773ad1`.

Six distinct agent sessions actually performed the recorded reviews. A/B/F did not author the implementation; C/D/E independently cross-reviewed other authors’ components and disclose exclusions below. JSON IDs and hashes are consistency evidence, not authentication of execution.

The successful GitHub PR run [36915890916](https://github.com/karelmartinek-a11y/kajovo-hotel-monorepo/actions/runs/36915890916) verified prepared browsers, production images, API/Android/portable contracts and all required jobs. Playwright: 176 web smoke, 8 admin smoke, 88 web visual, 40 admin visual and 20 responsive Voice tests passed. The final source delta after that run corrects an obsolete documentation paragraph; exact released main CI is still mandatory.

## Review records

### A — protocol

Agent: `/root/review_a_protocol`. Result: **PASS**.

Actual independent protocol review completed on the frozen source pair. Recomputed hotel complete Git-tree fingerprint and checked 28 relevant working source/test/doc blobs against its immutable objects; recomputed agentha complete fingerprint from its non-truncated recursive Git tree and verified all 44 local blob hashes. Reviewed native MCP exact three-tool/raw authorization wire and pinned counterpart auth/tool tests; immutable SHA/image-ID/archive-checksum build/import/Compose/runtime identity chain; producer/proxy test continuity; CI baseline and cumulative review dependency closure; verified MCP pair propagation; root readiness/runtime fence/worker/rollback/final acceptance lifecycle. Reinspected the final always-images and unconditional-readiness fix, and confirmed the sole 8427265 to 381beeda delta is the obsolete deploy-dedup paragraph correction in docs/how-to-deploy.md. No open CRITICAL/HIGH/MEDIUM finding remains in area A.

- PASS: ../hotel-test-venv/bin/python -m pytest -q scripts/tests/test_ci_scope.py scripts/tests/test_ci_required_jobs.py scripts/tests/test_release_images.py apps/kajovo-hotel-api/tests/test_independent_review.py apps/kajovo-hotel-api/tests/test_github_deploy_via_ssh.py apps/kajovo-hotel-api/tests/test_release_workflow_contract.py apps/kajovo-hotel-api/tests/test_transaction_fence.py packages/voice-core-server/tests/test_policy.py apps/kajovo-hotel-api/tests/test_voice_core.py apps/kajovo-hotel-api/tests/test_voice_core_tooling.py.

### B — security

Agent: `/root/review_b_security`. Result: **PASS**.

Independent inspection of workflow privileges, PR/cache boundaries, trusted main gate before candidate checkout and credentials, immutable bundle/run/image identity, content-bound review ancestry and MCP identity, root signing authority, transaction fencing and rollback lifecycle. Complete frozen Git tree fingerprint independently computed; 27 reviewed hotel files matched frozen blob IDs. 185 focused hotel tests passed; 90 immutable agentha cutover/review tests passed. All B findings independently verified resolved.

- 185 focused hotel tests passed; 90 agentha cutover/review tests passed: focused reviewer validation.

### C — ha_safety

Agent: `/root/ci_implementation`. Result: **PASS**.

Independent cross-review of independently authored deployment and MCP/HA safety sources at the frozen candidate. This agent authored CI orchestration and explicitly did not independently review its own CI implementation. Hotel frozen Git tree fingerprint and the MCP immutable API tree fingerprint were independently recomputed. Eleven reviewed/tested hotel blobs and four MCP blobs matched the frozen objects. Reviewed the trusted content-bound MCP SHA handoff, root signing authority and private key fingerprint, exact-pair readiness/timer, root-owned runtime fence, image import before container stop, managed worker persistence across CI disconnect, known-good image archives/anchors, deadline and final acceptance, and post-acceptance cleanup. Executed 26 isolated hotel safety/image/readiness tests, 44 isolated MCP cutover tests and the actual frozen schedule-candidate JavaScript with a historical artifact lookup trap; all passed. No production actions, HA actuator calls or paid live calls were performed.

CI Core/Gates/Full/Release, setup composites and Playwright configuration were authored by this agent and excluded from this independent C review. C review concerns deployment and MCP/HA source authored separately; it does not assert independent approval of this agent's own implementation.

- PASS: hotel-test-venv/bin/python -m pytest --noconftest apps/kajovo-hotel-api/tests/test_transaction_fence.py apps/kajovo-hotel-api/tests/test_github_deploy_via_ssh.py scripts/tests/test_release_images.py -q.
- PASS: PYTHONPATH=agentha-review-source hotel-test-venv/bin/python -m pytest --noconftest agentha-review-source/tests/test_cutover.py -q.
- PASS: node review_c_candidate_counterexample.js.
- PASS: bash -n review-c-frozen/infra/ops/deploy-production.sh.

### D — deployment

Agent: `/root/scope_review_implementation`. Result: **PASS**.

Independently inspected immutable-image CI build/test/export/import, trusted exact-run download, SSH readiness/preparation, production image selection and fences, root-owned partner worker/rollback/finalization, and accepted cleanup. Verified frozen Hotel source fingerprint and partner fingerprint/all 44 blob hashes. Executed 52 Hotel deployment tests, 44 partner cutover tests, and production shell syntax validation. No production or actual local Docker execution is claimed.

I authored CI scope/scoped review/release checker/legacy guard changes; D independently cross-reviews deployment files authored by another agent and partner deployment paths. My own changes are excluded from this D independence claim and are independently covered by A/B/F.

- 52 passed: PYTHONPATH=<isolated test dependencies>:<hotel>/scripts python -m pytest --noconftest scripts/tests/test_release_images.py apps/kajovo-hotel-api/tests/test_github_deploy_via_ssh.py apps/kajovo-hotel-api/tests/test_transaction_fence.py apps/kajovo-hotel-api/tests/test_release_workflow_contract.py -q.
- 44 passed: PYTHONPATH=<isolated test dependencies>:<verified agentha> python -m pytest --noconftest tests/test_cutover.py -q.
- PASS: bash -n infra/ops/deploy-production.sh.

### E — legacy_absence

Agent: `/root/deploy_implementation`. Result: **PASS**.

Independent cross-review at frozen hotel fingerprint: all 281 configured active-source files were materialized from frozen Git objects; 17 initially missing legacy hotel policy/brand blobs were retrieved by immutable GitHub blob SHA and independently byte-hash checked. Actual semantic guard reports PASS. The five independently reproduced Python alias/keyword/argument/constant-fstring counterexamples are now detected and covered by pinned regressions. Historical docs, docstrings, comments and dedicated negative fixtures remain preserved. Active hotel session route constructs native HomeAssistantMcpProvider tools through McpServerConfig(extra=forbid) and validates them in session_config before GA calls; no active local executor/legacy function wire remains. Agentha active files match immutable tree blob SHAs; main activates only StrictMcp StreamableHTTP and its native service/Nginx route. Scope is source/static-contract absence and its tested guard, not arbitrary dynamic-program proof or production runtime acceptance.

This agent authored deployment optimizations. Area E independently cross-reviews the semantic legacy guard authored by /root/scope_review_implementation and unchanged production MCP producers/consumers. It does not claim independent review of this agent’s own deployment changes.

- PASS: python3 scripts/check_native_mcp_cutover.py.
- PASS: /workspace/scratch/10ab6106deb5/hotel-test-venv/bin/python -m pytest --noconftest -q scripts/tests/test_native_mcp_cutover.py.
- PASS: /workspace/scratch/10ab6106deb5/hotel-test-venv/bin/python -m pytest --noconftest -q tests/test_forensic_boundary.py.
- PASS: Independent SHA256 over immutable Git tree metadata, evidence files excluded; SHA1 Git-blob byte verification for 17 fetched hotel files and 17 active agentha files.

### F — test_gaps

Agent: `/root/review_f_test_gaps`. Result: **PASS**.

Independent final tree/blob verification, nine-file corrective delta review, all CI test discovery/dependency/aggregator invariants and preserved smoke/visual scenarios. 87 script and 99 affected API tests passed. Actual Python cache repair shell independently executed in mounted, absent and existing-destination scenarios twice each; idempotent. Always current-SHA images and unconditional exact-pair root readiness separate test baseline from runtime acceptance.

- 186 tests passed: 87 script and 99 affected API: focused reviewer validation.
- 3 actual cache-repair shell scenarios passed twice each: focused reviewer validation.

## Findings

| Finding | Severity | Status | Resolution |
|---|---|---|---|
| A-001 | HIGH | resolved | scripts/ci_scope.py authenticates the latest completed successful exact-main baseline CI before reducing test scope; missing credentials/history or failed/cancelled/incomplete baseline selects full scope. |
| A-002 | HIGH | resolved | scripts/independent_review.py carries verified MCP source through reviewed ancestry; check_release_review outputs that SHA; readiness, upload, wait state and runtime fence bind the same hotel/MCP pair before runtime mutation. |
| A-003 | MEDIUM | resolved | scripts/ci_scope.py limits targeted frontend/shared UI changes to presentation styles and raster assets; executable TS/JS/JSON/SVG and unknown source paths select full dependency closure. |
| A-004 | HIGH | resolved | Every candidate builds and verifies current-SHA immutable runtime images, independently of code-impact deploy_required; preparation always queries exact root coordinator readiness after CI/review. |
| A-005 | HIGH | resolved | Historical deployment-job evidence is no longer runtime authority. Selective baseline proves tests only; current active exact-pair root readiness determines cutover/restoration, every candidate retains immutable images, and docs/how-to-deploy.md now states this lifecycle without stale dedup instructions. |
| B-001 | HIGH | resolved | Only historical non-normative notes/archive qualify for cosmetic scope; current policy and runbooks are full. |
| B-002 | HIGH | resolved | Scan executed nested template expressions, escapes and constant fragments with negative regression cases. |
| B-003 | HIGH | resolved | Executable TS/JS/JSON/SVG fail closed to full scope. |
| B-004 | MEDIUM | resolved | Validate configured target resolves only to approved IPv4 before SSH. |
| B-005 | MEDIUM | resolved | Trusted bootstrap installs verifier/SSH tools before gate; Python setup precedes checks and credentials. |
| B-006 | MEDIUM | resolved | All candidates retain verified images and readiness is unconditional; baseline authenticates tests only. |
| C-001 | MEDIUM | resolved | No MCP source change is required: the trusted gate derives exact MCP SHA from evidence inside the immutable hotel Git commit (or a verified immutable ancestor). Changing that MCP SHA changes the hotel evidence commit and therefore hotel SHA/release path. A same-hotel-SHA/different-MCP-SHA retained readiness marker is an ineligible pair, and the runtime fence correctly rejects it before any container mutation. An eligible same-hotel/same-MCP retry retains matching identity and active root/timer checks. |
| C-002 | MEDIUM | resolved | Removed historical successful-deployment artifact suppression from the schedule candidate. Exact current main remains eligible; the verified gate and current root transaction readiness determine whether runtime deployment can proceed. A historical GitHub success is not final coordinator acceptance or a current-runtime identity proof. |
| OPT-E-1 | MEDIUM | resolved | The guard now checks alias import components and aliases, keyword names and argument bindings, and folds constant Python JoinedStr/FormattedValue expressions; the separate guard author added five regression cases. |
| F-001 | HIGH | resolved | Install constrained pytest in fast profile and invoke actual pytest suite. |
| F-002 | HIGH | resolved | Only latest successful exact-main baseline tests allow reduced scope; missing/failed/cancelled baseline selects full. |
| F-003 | MEDIUM | resolved | Wire exact new suites into required fast-checks job. |
| F-004 | MEDIUM | resolved | Validate profile/review consistency and require verified images for every candidate. |
| F-005 | MEDIUM | resolved | Synchronize tests with trusted gate and conditional checks; update active runbooks. |

C-001’s original reliability interpretation was withdrawn after immutable-pair analysis; it is an expected rejection, not an MCP code change. Historical deploy SUCCESS is never root acceptance. Every candidate retains current-SHA verified images, and readiness always checks the live exact hotel/MCP transaction.

## Limits

A/B/F are non-author independent reviewers. C/D/E cross-review components authored by other agents and explicitly exclude their own implementations from independence claims. Actual session reviews are recorded; JSON identity does not authenticate execution. Complete tracked source trees are bound; local checkout lacks unrelated unchanged assets/APK. GitHub exact-main CI and coordinated production acceptance remain separate mandatory prerequisites.

No reviewer claims production deployment, private HA actuator execution or paid live OpenAI acceptance. Local Python tests used 3.12; authoritative CI uses 3.11. Unrelated absent binary blobs were retained in the complete tree fingerprint, not locally executed. See JSON for each reviewer’s exact tests, fingerprints and limitations.
