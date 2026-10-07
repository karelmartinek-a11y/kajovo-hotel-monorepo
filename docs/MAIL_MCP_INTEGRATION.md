# Native Mail MCP integration

Mail uses OpenAI Realtime's native `mcp` tool (`hotel_mail`,
`https://mail.hcasc.cz/mcp`). The provider executes the tools. Dagmar has no mail
intent router, business-tool executor or duplicate function schemas. The pinned
catalog contains the 23 tools of Mail MCP 1.1.1 (build
`6dde2763d0dc4ff16ca712f26b258e6875514e7ff50a5fb5ea93fc22257495be`).
`mail_send_execute` is the only tool in `require_approval.always`; the other 22
are in `never`. Mail does not change the meanings of `smart_technologie` or the
hotel account SMTP configuration.

## Activation and credentials

Default `KAJOVO_API_VOICE_MAIL_ENABLED=false`. Enabling requires
`KAJOVO_API_VOICE_MAIL_ACCEPTANCE_SHA` to equal the current
`KAJOVO_API_VOICE_RELEASE_SHA`. With an absent or mismatched acceptance SHA,
Mail remains unavailable and no credential is sent to the provider.

Real provider acceptance is preferred by default. **Paid acceptance was explicitly
cancelled by the owner** for this particular integration on 2026-10-07, including
its final unpaid closure release. The authoritative `USER_ACCEPTED` decision
permits completion and activation after unpaid deterministic/protocol/security
gates, successful exact-SHA CI, matching runtime artifacts and protected-service
checks. Record that decision outside Git against the immutable final main SHA.

Real Realtime, WebRTC, audio acceptance and production voice smoke remain
`NOT_RUN_BY_OWNER_POLICY`. This does not mean PASS; synthetic protocol and event
fixtures do not establish actual model interpretation, credential redaction by
OpenAI or physical audio quality. These cancelled measurements do not block
activation or IMPLEMENTED status under this owner-approved completion policy.
No further test provider call, paid transcription/synthesis, budget reservation,
ledger, tunnel or public synthetic endpoint is permitted in this closure.

The exception applies only to this integration. Exact-SHA runtime checks,
credential boundaries, native import/schema checks, trusted audio consent,
idempotency and all unpaid gates remain mandatory. An environment flag alone
is not acceptance evidence. No public acceptance bypass is introduced.

`MailSecretStore.save` accepts the handoff's two credentials only in backend
context. It encrypts them in `dagmar_mail_secrets`, using the existing voice
master key and distinct authenticated data `dagmar:mail:mcp:v1` and
`dagmar:mail:approval:v1`. There is no browser credential route. Only the ordinary
MCP token enters the provider's native tool configuration. The approval token
is sent exclusively to the Mail control API. When separately authorized, a live probe uses
synthetic tokens and checks actual browser WebRTC events, HTTP answers and
frontend artifacts; filtering tokens after arrival does not satisfy this gate.

## Import and continuation

The backend checks the public catalog's names, input/output schemas and
annotations. The full native MCP definition is registered through `session.update`
once per provider session. Only a matching provider list with all input schemas
and completed import transport enable the session-scoped server label. Subsequent
updates reference that cached label without credentials. A real WebRTC measurement
can verify whether OpenAI returns authorization to the browser;
sideband alone is not evidence. An out-of-band response's tool cache is insufficient
for this session-level reuse. Import failure disables Mail; ordinary conversation, memory and technologies remain
available independently.

`TurnCoordinator` records human-input generation, provider responses and related
function, native MCP and approval items. An MCP transport completion is separate
from the result item. `response.done` alone does not prove business success.
Continuation waits for the response, every result and every approval; function
outputs must be acknowledged. A response's continuation is claimed once, with
the existing transport-lock lifetime/generation fence. Native VAD supersedes old
generations. A late result may update its journal, but cannot revive old speech.

While Mail is ready, native responses choose tools and produce completed answer
text silently (`output_modalities=["text"]`). Mixed message/tool responses never
start speech. A completed tool-free answer is spoken by a separate native audio
response with no tools, tied to its source response and current generation. This
is a generic response lifecycle, not a mail intent router; native MCP results
remain provider-owned and never become manually authored function outputs.
Native VAD continues to interrupt playback. Output-token exhaustion resumes only
after the matching audio buffer drains, within the turn bounds and generation;
it cannot replay tools or complete a truncated approval readback.
An unfinished silent text response continues within the same bounds before
speech. Its bounded partial text stays in process RAM and is cleared by a new
human generation, forgetting, disconnect or Stop. Duplicate response completion
cannot enqueue speech twice; reaching a limit reports incomplete reading.

Mail forbids all progress speech before a tool result, including “Chvilku”. The
technology-specific Moment/Hotovo rule does not apply to Mail. Principled mail
instructions require explicit account/folder scope, exact count
coverage, proven global ordering and every full-text cursor. They preserve
partial errors and treat mailbox content as untrusted data. These instructions
describe the intended model behavior; deterministic protocol tests establish
host behavior only. Actual model/audio measurement is `NOT_RUN_BY_OWNER_POLICY`
for this completion and is never inferred from those tests.

The browser observes only advertised `managed_mcp_servers` and
`managed_mcp_status`; its lifecycle never executes or approves MCP calls.
`mail` separately reports disabled/loading/ready/unavailable/incompatible.
Working and awaiting-approval UI states come from native lifecycle events.
An advertised managed MCP cache rejection does not close the browser's ordinary
voice connection; the backend owns the capability availability. The browser
does not retry, continue or approve the rejected request.

## Consent and recovery

An approval request must name `mail_send_execute` with its original request and
idempotency key. The backend reviews immutable content through
`GET /control/requests/{send_request_id}`. It binds the content hash, draft
version, expiration, authenticated owner, logical call, provider session and
approval item. Mail control accepts `content_hash`, not model-provided approval.

The host speaks the exact prepared envelope, body and attachment names once,
then one question. It requires a matching completed audio transcript and drained
provider output buffer, followed by the next committed native audio input and
unambiguous confirmation. Model arguments and text messages cannot grant it.
An immediate native "pošli to" bypasses a new question only when the exact
current hash/version content has already been fully heard. Interruption,
refusal, expiry, revocation or a draft change invalidates the old binding.

The single-use receipt is reserved transactionally before
`POST /control/approve`, which validates the current draft version/hash. Only a
successful control approval permits the corresponding native
`mcp_approval_response`. Receipts contain IDs, hash, version, timestamps,
expiration and state; no message content, recipient or audio transcript.
Send identities enter the metadata journal when the approval item is reviewed,
before control approval or provider execution, so a reconnect retains the original
status key even if no execution event arrived. Approval uncertainty does not permit a new send.

Working references and mutation/send identities stay in owner-isolated logical
call RAM. Restored context stays within 4000 compatible tokens / 24000 bytes and
is assistant output-text data, never renewed consent. A replaced provider
session never receives the previous approval item. Recovery initially exposes
read-only tools; uncertain send recovery uses the original `mail_send_status`
idempotency key. Stop/forget/revocation clears transient content. Durable
metadata remains for rollback and deduplication.

Default configurable per-turn limits are 64 continuations, 128 MCP calls,
600 seconds and 524288 bytes of results. Reaching a limit removes Mail tools
for that turn and produces an explicit incomplete-result context.

## Schema, deployment and rollback

Mail's additive `dagmar_mail_schema_version=1` is independent of the original
Dagmar marker and hotel checkpoint `0046_current_voice_schema`. Existing tables,
keys and journals are preserved. Migration runs inside the same PostgreSQL
advisory-locked transaction and is repeatable on an existing Dagmar database.

The explicit commit trailer `Hotel-Deploy-Scope: api-admin` selects the reduced
deploy, after source-scope validation and the existing exact-main CI gate.
It builds only API/admin, runs an additive migration in a `--no-deps` one-off
API container and recreates only API/admin with `--no-deps`. It compares
PostgreSQL/web container IDs, images and start times, protected MCP/Dagmar
service PIDs/start times and Nginx config hashes. It does not reload Nginx.
Existing TLS validity and runtime-artifact SHA verification remain required.
API/admin-only live user smoke verifies authenticated user-list access without
CRUD or reset-link calls: user creation implicitly sends onboarding mail. Both
mutation scenarios are explicitly `NOT_RUN`; the full-deploy smoke stays unchanged.

Rollback disables Mail and, if needed, ships a compatible main correction.
Never restore an older database or remove Mail tables, receipts, journals or keys.

## Evidence boundaries

The impact matrix is [mail-mcp-impact-matrix.md](mail-mcp-impact-matrix.md).
Unpaid regression tests exercise lifecycle ordering, catalog drift, encryption,
native-audio provenance, approval transactions, interruption and safe deployment
scope. Normal CI does not call paid providers or mutate actual MCP/SMTP services.
Real Realtime, model scenarios A–L and physical audio measurements are separate
evidence categories. Their unperformed paid tests are `NOT_RUN_BY_OWNER_POLICY`,
not inferred from fake-provider or protocol fixture results, and do not block
this owner-approved completion. The existing local TLS fixture verifies actual
Mail protocol, cursors and closed synthetic SMTP without OpenAI or public access.
Historical ledgers and usage holds remain untouched; this closure creates none.

`python scripts/mail_mcp_fixture_acceptance.py --source <isolated-copy>` runs in
the copied server's separate locked SDK environment. It rejects production paths
and escaped symlinks; `/tmp` aliases are resolved on macOS. The existing 50,000
message TLS fixture verifies the pinned 23 input/output schemas and annotations,
100-row pagination versus exact totals, cross-account/folder newest chronology,
all text cursors, MIME/attachment metadata, partial errors, draft versions/sender,
hash/expiry rejection, control approval and exactly one closed SMTP submission.
Reconnect uses original send status. An explicitly simulated uncertain journal
verifies status/replay without a second SMTP attempt; it is not a measured
network failure. No production credentials, database or content enter the copy.

## Historical reproducible native browser probe

The following runner and paid commands document the earlier live investigation.
**Do not run them for this closure.** Any future paid test needs a new explicit
owner instruction; historical opt-in flags and accounting do not authorize it.
Its historical evidence must not be rewritten to claim a later PASS.

The final acceptance run authorized on 2026-10-07 has separate, unlimited-by-fixed-cap
accounting, explicitly enabled with a fourth browser runner argument
`--authorized-final-run`. Its first argument is an outside-Git `COSTS.json`, not
the historical SQLite ledger. `live_mail/costs.py` records estimates and pending
or accounted usage without replacing or refunding historical reservations.
The old `--ledger` path still enforces the original authorization. Paid calls
remain opt-in and excluded from CI. Temporary synthetic endpoint/tunnel setup
is authorized for this final run and must be removed afterwards. Activation
uses the exact-SHA acceptance policy above, including the owner's explicitly
recorded decision for this completion run. Further paid calls were cancelled
by the owner after the provider reported exhausted credit.

`packages/dagmar-server/tests/live_mail/browser.mjs` starts the loopback test host
in `host.py` and the existing `examples/dagmar-host` Vite application. It runs the
actual Dagmar console, routes, orchestration, native MCP and OpenAI WebRTC. It
uses an empty temporary database, a random test master key and synthetic Mail
credentials. Automatic memory curation is disabled in this isolated process;
technologies are unavailable rather than connected to real devices.
An optional `synthetic_technologies` manifest entry uses the existing public
technology fixture contract through the host connector; it never connects to
production devices. The browser runner builds the actual candidate's existing
Dagmar test console before opening WebRTC, and records served bundle hashes.

First fetch `origin/main` and select an immutable clean candidate. Supply the
original SQLite ledger, or the explicitly authorized separate final-run accounting,
and a private (0600) fixture manifest outside the repo.
The manifest contains `synthetic: true`, `existing_authorized_endpoint: true`,
the already authorized HTTPS `server_url` ending in `/mcp`, distinct synthetic
`mcp_token`/`approval_token` starting with `dagmar-canary-`, and `input_wav`.
These declarations describe caller-owned fixture setup; they do not authorize
publication. The endpoint must use only synthetic data and a closed SMTP
receiver. All known production MCP/application hosts are rejected. This runner
does not create an endpoint, install a tunnel or change production configuration.

The input is a Czech synthetic PCM16 WAV of at most eight seconds, asking for
unread mail in recepce/INBOX. Free local speech synthesis may prepare this file;
paid synthesis must be reserved separately. Browser instrumentation connects it
to a genuine audio MediaStream; no user text, expected tool result or fabricated
provider event enters the conversation. It observes original data-channel
envelopes before the product handler, HTTP bodies, fetched frontend bundles,
browser storage and actual played remote audio energy associated with the response
whose playback starts after the result. Do not mistake the previous response's
remaining audio for a spoken result. Optional `audio_files` and `steps` run sequential
native audio prompts and compare business results with synthetic fixture counts.
Tokens are compared only
in Node memory: injecting the expected canary into the browser would invalidate
the test. Only metadata and artifact hashes survive outside the Git tree.

Run the unpaid preflight first (no key lookup or provider request):

```sh
python3.11 packages/dagmar-server/tests/live_mail/host.py \
  --ledger "$ORIGINAL_LEDGER" --fixture "$PRIVATE_FIXTURE_MANIFEST" \
  --evidence "$OUTSIDE_GIT_EVIDENCE.provider.json"
```

With successful preflight, existing fixture authorization and available funds:

```sh
VOICE_CORE_LIVE_SMOKE=1 node packages/dagmar-server/tests/live_mail/browser.mjs \
  "$ORIGINAL_LEDGER" "$PRIVATE_FIXTURE_MANIFEST" "$OUTSIDE_GIT_EVIDENCE"
```

The browser runner retrieves the current hotel voice key through
`VoiceSecretAdapter` in an API-container read-only database transaction. It
captures the encrypted SSH transport's output in Node RAM and passes the key
to the isolated backend on stdin. No separate Mail MCP OpenAI key is required.
The test backend stores it through the existing voice encryption adapter; no
key is supplied to frontend code, arguments, environment or reports.

`PaidBudget.open_original` verifies all eight original reservation identities,
models, amounts and the two already accounted charges without creating or
altering a file. Missing/foreign ledgers stop before key input or host creation.
Unknown costs retain their holds. The original four-call identity survives
later reconciliation and additional tests. Synthetic unit ledgers are not
authorization artifacts.

The short probe reserves USD 3.75 for Realtime and USD 0.05 for input ASR before
the first paid request. Test-only limits are 120 seconds, four responses before
closing on an unexpected fifth, 512 output tokens, 20000 initial/configuration
tokens, a pinned catalog below 21000 tokens and 16384 result bytes. A conservative
five-response bound (including a late cancelled response) is
`5 * ((20000+21000+16384+4*512)*4 + (12000+4*512)*32 + 512*64)/1e6`
or USD 3.60016, below the USD 3.75 reservation. Pricing is the current public
Realtime 2.1 tariff; cached input is conservatively charged uncached. These
limits bound this first probe, not the full scenario suite. Incomplete response
or ASR usage prevents reconciliation. No budget is newly authorized by the runner.

Probe PASS establishes only actual import, a successful native result, credential
observation and subsequent played audio. It does not establish the correctness
of spoken counts, full spoken reading, consent, synthetic SMTP, groups A–H,
latency statistics or production activation. Those remain separate `NOT_RUN`
gates until measured through the real model/audio. In particular, provider
transcripts and audio energy alone do not prove every spoken marker/address.
This probe alone does not authorize activation. For this completion, the
USER_ACCEPTED policy above permits activation after all mandatory unpaid gates
and exact-SHA checks. Final evidence belongs outside Git and identifies that
SHA; a later report commit cannot silently substitute a different release.
