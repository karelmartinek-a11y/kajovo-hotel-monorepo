# Independent Codex multi-agent forensic review

Date: 2026-10-01. **Review PASS; production acceptance NOT RUN.** This is Codex evidence, not human review.

## Reviewed resulting trees

- HOTEL: `0aa675d2c8d5af471bcb55953b58ddbe0ea67893 → 9a9b895ff27b6d12a9975668a710b71be81ed161`
  Source fingerprint: `70a23438dc0004f3650e167c1210f381088a18071a63fd162a5c7fc4014e969a`
- AGENTHA: `251902e614012e84c9b5f86d2a672641ee733bde → c9c291f342eb947ef3dcc7886ad210e4db55724c`
  Source fingerprint: `668324b49c01d451f9650c0b216d4bd8d446b498987c9eb17aafc1fb2f773ad1`

The complete tracked tree is bound, including tests, instructions, workflows and other documentation. Only this report and its JSON companion are excluded to avoid a self-referential digest. Report-only commits and merges are valid only when the complete source fingerprint remains identical.

## Independent reviewers

- A — protocol; `/root/final_a_protocol`; PASS. Current official Realtime Calls/MCP wire, response/call/approval lifecycle and spoken completion; independently examined final cumulative trees and relevant regression/failure paths.
- B — security; `/root/final_b_security`; PASS. Secrets, sole signing authority, scoped credentials, informed approval and durable at-most-once actions; independently examined final cumulative trees and relevant regression/failure paths.
- C — ha_safety; `/root/final_c_ha_safety`; PASS. Live HA classifications, exact capabilities, stable identity, availability and read-only filters; independently examined final cumulative trees and relevant regression/failure paths.
- D — deployment; `/root/review_a_protocol`; PASS. Private preflight, immutable releases, managed workers, transactional fencing, deadlines and exact-image rollback; independently examined final cumulative trees and relevant regression/failure paths.
- E — legacy_absence; `/root/final_e_cleanup`; PASS. Legacy source/config/process retirement, protected canonical data and resumable post-acceptance cleanup; independently examined final cumulative trees and relevant regression/failure paths.
- F — test_gaps; `/root/final_f_test_gaps`; PASS. Actual exception, reconnect, race, lifecycle and deployment/rollback test gaps; independently examined final cumulative trees and relevant regression/failure paths.

## Findings, fixes and regressions

One duplicate rollback finding (F1) is consolidated into D-1. All 18 distinct findings are resolved: 5 HIGH, 13 MEDIUM. Open CRITICAL/HIGH/MEDIUM/LOW: **0/0/0/0**.

| Finding | Severity | Source / symbol | Fix | Regression | Final verification |
|---|---|---|---|---|---|
| A-1 | MEDIUM | `scripts/verify_live_voice_mcp.mjs` / voice acceptance event observer and completion predicate | Correlate successful grounded transcript, completed response and stopped playback; reject failed/cancelled/cleared responses. | scripts/mcp_spoken_completion.test.mjs: transcript and partial RTP never prove spoken completion | A: resolved PASS |
| B-1 | HIGH | `packages/voice-core/src/mcp.ts` / McpLifecycle.handle / VoiceConsole approval prompt | Validate bounded approval context against imported schemas and show exact target/property/state without opaque credentials; malformed context blocks approval. | packages/voice-core/tests/mcp.test.mjs: approval context keeps exact target and state and removes opaque credentials; packages/voice-core/tests/console.spec.ts: unverified approval details disable approve | B: resolved PASS |
| B-2 | MEDIUM | `scripts/cutover.py` / prepare signing key provisioning | Require root-owned regular non-symlink authority with private directory/file modes before reading; never adopt an exposed key or rotate it during deploy. | tests/test_cutover.py::test_existing_nonroot_signing_authority_is_rejected_without_rotation; tests/test_cutover.py::test_signing_authority_owner_and_private_modes_fail_closed | B: resolved PASS |
| C-1 | HIGH | `app/voice_policy.py` / load_policy / HomeAssistantCapabilityService.snapshot | One classification invariant fails closed across search/state/execute for blank and ignored classifications regardless of enabled flag. | tests/test_capabilities.py::test_enabled_flag_cannot_override_unclassified_or_ignored_policy | C: resolved PASS |
| C-2 | HIGH | `app/inventory.py` / _light_descriptors / _select_option | Exact raw dynamic choices have deterministic digest-bound unique state keys; ambiguous exact bindings reject. | tests/test_device_inventory.py::test_raw_choices_have_unique_bounded_stable_keys_and_current_value; tests/test_capabilities.py::test_execute_each_colliding_raw_choice_submits_only_its_discovered_payload | C: resolved PASS |
| C-3 | MEDIUM | `app/inventory.py` / _availability | Unknown entities are unavailable in aggregate state and filters, consistent with individual properties. | tests/test_capabilities.py::test_unknown_entity_states_align_device_availability_and_filters | C: resolved PASS |
| D-1 | HIGH | `scripts/cutover.py` / rollback | Recognize an already restored real directory and safely retry later recovery failures instead of attempting a symlink over it. | tests/test_cutover.py::test_rollback_restores_routes_and_pinned_hotel_images_without_live_ha_calls | D: resolved PASS |
| D-2 | HIGH | `agentha/scripts/cutover.py; hotel/infra/ops/deploy-production.sh` / rollback/finalize vs hotel deployment runtime mutations | Root serialization, revoked transaction state, managed process-group termination and a shared runtime fence prevent late deployment from republishing after rollback. | tests/test_cutover.py::test_rollback_cancels_worker_before_exclusive_runtime_restore; tests/test_cutover.py::test_watchdog_serializes_with_acceptance_under_real_process_lock; apps/kajovo-hotel-api/tests/test_transaction_fence.py | D: resolved PASS |
| D-3 | MEDIUM | `scripts/verify_mcp.py` / verify | Run search, exact state and repeated search in the same authenticated SDK session; later client failures cannot yield preflight PASS. | tests/test_verify_mcp.py::test_preflight_repeats_live_reads_in_one_session_and_returns_aggregate_only; tests/test_verify_mcp.py::test_closed_or_failed_client_on_later_read_cannot_report_preflight_pass | D: resolved PASS |
| E-1 | MEDIUM | `scripts/cutover.py` / cleanup | Retire confirmed verification/staging roots after acceptance while preserving canonical source and data. | tests/test_cutover.py::test_actual_accepted_cleanup_retires_confirmed_archives_and_preserves_data_provenance | E: resolved PASS |
| E-2 | MEDIUM | `scripts/cutover.py` / cleanup | Retire every coordinator-owned obsolete backup generation and image anchor; prune captured obsolete images only when unused. | tests/test_cutover.py::test_actual_accepted_cleanup_retires_confirmed_archives_and_preserves_data_provenance; apps/kajovo-hotel-api/tests/test_github_deploy_via_ssh.py::test_post_acceptance_cleanup_preserves_current_and_only_removes_unused_captured_images | E: resolved PASS |
| F-2 | MEDIUM | `packages/voice-core/src/runtime.ts` / VoiceRealtimeClient.handle | Catch follow-up send failure, release resources and never retransmit a consumed continuation. | packages/voice-core/tests/runtime.test.mjs: failed MCP followup send closes session and never retries the consumed turn | F: resolved PASS |
| F-3 | MEDIUM | `packages/voice-core/src/runtime.ts` / VoiceRealtimeClient.connect peer.ontrack | Behavioral remote-track tests cover rejected playback, audio errors, stream fallback, stale callbacks and graph/resource cleanup. | packages/voice-core/tests/runtime.test.mjs: remote audio reject reports playback failure and releases graph; packages/voice-core/tests/runtime.test.mjs: reconnect disconnects old playback graph and rejects late tracks and play failures | F: resolved PASS |
| F-4 | MEDIUM | `scripts/cutover.py` / finalize / cleanup | Persist accepted_cleanup_pending and permit idempotent cleanup retry; never roll back completed acceptance due to retirement failure. | tests/test_cutover.py::test_accepted_cleanup_failure_resumes_without_verification_or_rollback; tests/test_cutover.py::test_retirement_failure_keeps_provenance_and_retry_finishes_missing_first_root | F: resolved PASS |
| A-001 | MEDIUM | `scripts/mcp_spoken_completion.mjs` / SpokenCompletion.handle / ready | Bind semantic successful name-filtered search to its parent or a new follow-up after completed parent/all-call boundary; invalidate interrupted chains and preexisting unrelated responses. | scripts/mcp_spoken_completion.test.mjs: preexisting unrelated playback cannot borrow successful search grounding; scripts/mcp_spoken_completion.test.mjs: followup requires completed parent and every correlated call terminal; scripts/mcp_spoken_completion.test.mjs: late old MCP completion after barge-in cannot ground a new user turn | A: resolved PASS |
| D-FINAL-1 | MEDIUM | `scripts/cutover.py` / finalize | Bound the final verifier to the remaining rollback deadline and check the deadline again immediately before acceptance commit. | tests/test_cutover.py::test_final_verifier_is_bounded_and_cannot_accept_after_deadline | D: resolved PASS |
| E-001 | MEDIUM | `scripts/cutover.py` / cleanup | Delete the two confirmed legacy archive roots only after acceptance and canonical data snapshot; retain private aggregate provenance and support interrupted/missing-root retry. | tests/test_cutover.py::test_actual_accepted_cleanup_retires_confirmed_archives_and_preserves_data_provenance; tests/test_cutover.py::test_actual_cleanup_preacceptance_guard_preserves_confirmed_archive_roots; tests/test_cutover.py::test_retirement_failure_keeps_provenance_and_retry_finishes_missing_first_root | E: resolved PASS |
| F-01 | MEDIUM | `packages/voice-core/src/mcp.ts` / McpLifecycle.handle / turn | Register responses on response.created so interruption before the first delayed MCP call cancels that old response permanently. New legitimate response still gets exactly one follow-up. | packages/voice-core/tests/mcp.test.mjs: barge-in cancels a created response before its first delayed MCP call; packages/voice-core/tests/runtime.test.mjs: interruption before delayed first MCP call never sends an old followup | F: resolved PASS |

The JSON companion retains concrete original problems, reproducible scenarios, consequences, duplicate mapping and final reviewer report digests. Reviewer findings were reproduced independently; fixes were tested and the affected areas re-reviewed at the final source state.

## Objective release gates

Require exact current main CI Gates, CI Full and CI Release, native MCP regressions, architecture guards, secret/redaction tests, deployment/rollback tests, this content-bound six-agent evidence and zero open blocking findings. Branch/PR CI Core must also pass before merge. No paid external reviewer, bot response or quota notice is a release dependency.

## Production gates still required

Preserve the healthy known-good hotel runtime/images, old backend and original routes. Start only the new private 18103 candidate and exercise authenticated initialize/list of exactly three tools and repeated search/state/search with production HA. Verify key fingerprints and exact image archive before canonical cutover. Then verify all hotel health, public MCP protocol, native Realtime import, name-filtered canonical read and completed grounded speech. Acceptance performs no actuator calls and logs aggregate evidence only. Cleanup starts only after all acceptance gates pass; failure restores the exact known-good runtime.

## Impact matrix

Production source, unit/protocol/wire/UI/failure tests, CI/deploy/review gates, documentation, instructions and current fixtures are synchronized. OpenAPI/generated client, Android consumers and persistent identity/policy contracts are verified unchanged. Legacy artifacts are physically retired only after final acceptance; canonical persistent data and private aggregate provenance are preserved.
