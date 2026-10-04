# Dagmar production stabilization — 2026-10-04

Baseline source/main/runtime: 33f15b02718cbb7fec9bd0ae30a758dbdae5f4a4.
Input audit: DAGMAR VOICE/AUDIT-20261004/ZPRAVA.md and sanitized reproductions.
No MCP implementation, shared-memory architecture or historical incident content is modified.

| Impact | Action |
|---|---|
| Source | batched encrypted writer, bounded priority collector, browser lifetime/recorders, response intent coordinator/error handling |
| Data | additive diagnostic SQLite format/accounting/final counters; preserve v1 reader and IDs; no PostgreSQL/memory migration |
| Tests | original races, noninstant IO, atomic audio pairs, 10-minute concurrent load, isolated audio configuration |
| CI | relevant existing full gates/copy-out; no provider payments or production mutations |
| Docs/AGENTS | batching/epoch/close/rollback and measured acceptance limits |
| Fixtures | synthetic audio/provider/MCP only; private incident sound stays outside Git/CI |
| Contracts/generated | regenerate diagnostic and status contracts as needed |
| Runtime | explicit exact-SHA CI/deploy, key/volume preservation, backup/restore and actual production UI/API |

D01–D07, D09 and D10 are in scope. D08 is a separate MCP task; voice policy must
interpret per-target results and summary, not journal completion as success.
The existing shared USD 10 paid ledger is retained; no new paid test is possible
without a conservative reservation fitting its remaining balance.
Physical iPhone acceptance remains cancelled; acoustic measurements and mock/API
configuration tests must be reported separately.

The diagnostic writer now groups bounded records into authenticated AES-GCM
objects by category and commits their index once. Individual IDs/checksums remain
export identities. Allocation totals make ordinary reservations independent of
historical object count; startup/periodic reconciliation repairs orphans and
funds DB/index/rollback-journal/directory allocation. Retired usage objects remain
charged until reconciliation. Explicit whole-call deletion also reconciles them.
Technical records are committed before optional debug text: a text quota or
capture-boundary failure cannot discard a response finale/usage record.

Critical transitions, errors, operation metadata and usage have a bounded
priority queue. Optional deltas are aggregated into bounded contiguous windows
with raw counts, sequence boundaries and provider event identities. Saturation,
producer tail and close timeout are explicit, including with debug Off. Capture
identity is frozen at ingress in an immutable segment view, without a disk lock
or segment transaction in the Realtime event loop.

Audio and decoder manifests commit as a pair. Recorder identities start their
own sequence/container namespace. Retries of a pre-v2 missing decoder manifest
can join only identical stored audio and cannot extend its Off boundary; the
original unknown capture/init is explicitly partial. Browser Stop freezes and
stops capture before releasing shared tracks, immediately revokes voice lifetime,
and drains diagnostics separately with finite deadlines. Only Start creates the
logical identity; late events/flush do not create calls. A delayed Start response
is also closed. Old reconnect cleanup cannot remove newly bound remote tracks.

All manual response.create paths reserve one intent before the transport lock
and recheck its generation/lifetime directly before send. The reader remains
free during acceptance; native response.created cannot acknowledge a manual
intent. Native pending automatic responses have priority, and late old intent
responses cannot replace the new turn. Completed generation is still separate
from playback drain and genuine audio consent. No blanket cancel/clear or sent
mutation replay was added.

Recoverable active-response/empty-commit/cancel rejection keeps the voice call;
unknown/fatal errors remain terminal and existing context/rate recovery remains
bounded. Error metadata correlates request event and intent IDs without raw
provider messages. Lease/Stop reasons are recorded. HA journal completion is
explicitly distinct from per-target results/summary success in the voice policy.

Usage is unique per call/provider response ID. Browser observations supplement
sideband data; authoritative sideband data may replace a browser observation,
and missing data may be upgraded. Completed then cancelled does not double count.
Numeric token counts survive structural redaction/export, while secret token
strings remain redacted. Missing modalities/cache/rates stay incomplete estimates.
No billing total or percentage saving is inferred from the old partial USD 1.25548.

| Item | Mechanism and regression evidence | Acceptance boundary |
|---|---|---|
| D01 | bounded batching, incremental allocation, priority windows, durable raw-tail/loss; 10-minute four-call test and overload/timeout tests | synthetic recording-load parameters and measured p95/p99 are in load.json; production longitudinal load separate |
| D02 | ingress capture generation plus delayed-worker test across Off/new On | no historical incident rewritten |
| D03 | atomic audio/manifest commit, disk failure/retry, bounded recorder/close, whole delete; actual synthetic AAC/fMP4 decode across six recordings | Safari physical MediaRecorder finalization not rerun; original missing final markers stay missing |
| D04 | reserved unique intent, post-lock fence, matching acceptance, reordered commit/native-pending tests | no evidence this race caused each historical interruption |
| D05 | synchronous old-epoch cleanup and asynchronous drain fence; delayed reconnect/new remote regression | native production reconnect/acoustics not inferred from mock |
| D06 | Start-only creation, terminal event before close, delayed Start/Stop, late emit/flush tests | ambiguous network loss is visibly incomplete, never an invented complete tail |
| D07 | one native capture/render path; safe UA/accepted track settings/devicechange telemetry; optional near_field/far_field backend candidate and accepted-config observation; unclear sound rule | acoustic fix NOT established; provider A/B cannot fit remaining shared paid reservation; no unmeasured DSP/filter enabled |
| D09 | priority durable usage, browser/sideband unique identity/authority, missing upgrade and export numeric-count tests | old 40 Realtime/43 transcription/3 curator observations remain partial; total billing unknown |
| D10 | correlated request rejection vs terminal error; regression preserves new native turn and closes on unknown fatal code | exact provider error behind old session_ended not proven |
| D08 (outside scope) | voice interprets results/summary, not journal completed as target success | MCP implementation unchanged; unavailable/invalid_parameters root cause remains separate |

Existing real acoustic evidence is the unmodified audit recording: AEC true,
about 124.372 s microphone and 125.375 s remote decode, 247 audio objects versus
246 decoder manifests, no final markers. Delayed signal similarity supports
residual pickup but is not ground truth for each VAD/task. Human confirmed an
iPhone with built-in speaker and music from another device. Exact hardware/iOS/
browser version is absent from the available original evidence; MIME is not used
to guess it. New physical acceptance is not claimed or reinstated as a gate.
Near-end/far-end/noise, stronger/weaker barge-in, simultaneous speech, short
consent yes/no, music with/without vocals and reconnect A/B remain unmeasured.
The new candidate setting is off by default and changes neither model nor
semantic VAD eagerness; it is preparation for an authorized measured comparison.

Verification: 28 required local gates passed on the frozen working tree, including
604 Python API/voice tests, 34 copy-out portable tests, 9 diagnostic browser tests,
17 Voice Core browser tests, full standalone install/build/server/own DB/mock
provider, generated contracts, responsive desktop/tablet/phone authenticated UI,
WebM/MP4-capable recorder export decode and genuine mail/registry consent suites.
The extra AAC/fMP4 harness decoded six synthetic recordings with finals and
rejected missing init. PostgreSQL 16.4-alpine with the actual API image verified
migration/idempotence/revision/journal constraints. Recovery restored the current
Dagmar-era schema, wrote an isolated fixture, restored again, replayed its receipt
and decrypted independently restored keys. All 6,966 old diagnostic record IDs/
checksums survived isolated v1→v2 restore. No production memory/SMTP/device test
mutation and no new provider charge occurred.

Protected predeploy backup metadata and hashes are in backup.json/snapshot.json;
SQL, encrypted audio archive, environment and independent keys remain private
0700/0600. These are explicit offline disaster-recovery copies, not a new
unbounded application export facility. Live diagnostic category accounting and
finite buffers are tested; infrastructure backup administration remains separate.
See ROLLBACK.md for the required v2-compatible forward rollback.

The original shared USD 10 ledger still holds USD 9.914630 conservatively and
has USD 0.085370 available, including unknown-usage reservations. This task added
zero paid calls. Production native-call On/Off/audio/filter/billing acceptance
cannot be asserted from an unpaid production metadata/UI probe.

Commit/main push, exact-SHA CI, server-authoritative deploy and subsequent runtime/
production API/UI evidence are delivered in the final external protocol after
release; local test success alone is not deployment or acoustic acceptance.

Final frozen load: 602.631 s, four concurrent calls, 116 raw deltas/s/call (twice the retained observed peak of 58, a lower bound where old events were lost), 8x short bursts, 5 ms fsync and 150 ms upload delay, 150,000 historical records and 48,906,240-byte seeded index. Storage p95 0.200 s, p99 0.310 s, maximum 2.164 s. Critical p99 0.386 s; 6,000/6,000 critical records, zero missing and zero producer losses. This meets p95/p99 goals, not an unlimited throughput or maximum-lag guarantee. Source hashes match the final writer/collector.

CI navíc chrání dekódování syntetických AAC/fMP4 exportů krátkým neplaceným testem; publikuje pouze souhrnné JSON metadata, nikoli audio.
