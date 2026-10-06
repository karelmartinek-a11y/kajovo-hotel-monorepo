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

Default `KAJOVO_API_VOICE_MAIL_ENABLED=false`. Enabling also requires
`KAJOVO_API_VOICE_MAIL_ACCEPTANCE_SHA` to equal the current
`KAJOVO_API_VOICE_RELEASE_SHA`. This SHA may be recorded only after successful
real WebRTC token-isolation and native Realtime/audio acceptance. An environment
flag alone is not acceptance evidence. With an absent or mismatched acceptance
SHA, Mail remains unavailable and no credential is sent to the provider.

`MailSecretStore.save` accepts the handoff's two credentials only in backend
context. It encrypts them in `dagmar_mail_secrets`, using the existing voice
master key and distinct authenticated data `dagmar:mail:mcp:v1` and
`dagmar:mail:approval:v1`. There is no browser credential route. Only the ordinary
MCP token enters the provider's native tool configuration. The approval token
is sent exclusively to the Mail control API. The required live probe uses
synthetic tokens and checks actual browser WebRTC events, HTTP answers and
frontend artifacts; filtering tokens after arrival does not satisfy this gate.

## Import and continuation

The backend checks the public catalog's names, input/output schemas and
annotations. One isolated, text-only, out-of-band response imports tools per
provider session. Only a matching provider list with the full input schemas and
completed import transport enables the session-scoped server label. Import
failure disables Mail; ordinary conversation, memory and technologies remain
available independently.

`TurnCoordinator` records human-input generation, provider responses and related
function, native MCP and approval items. An MCP transport completion is separate
from the result item. `response.done` alone does not prove business success.
Continuation waits for the response, every result and every approval; function
outputs must be acknowledged. A response's continuation is claimed once, with
the existing transport-lock lifetime/generation fence. Native VAD supersedes old
generations. A late result may update its journal, but cannot revive old speech.

Principled mail instructions require explicit account/folder scope, exact count
coverage, proven global ordering and every full-text cursor. They preserve
partial errors and treat mailbox content as untrusted data. These instructions
must be tested through the actual model; deterministic protocol tests establish
host behavior only.

The browser observes only advertised `managed_mcp_servers` and
`managed_mcp_status`; its lifecycle never executes or approves MCP calls.
`mail` separately reports disabled/loading/ready/unavailable/incompatible.
Working and awaiting-approval UI states come from native lifecycle events.

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
Approval uncertainty does not permit a new send.

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
Real Realtime, Secure MCP Tunnel, model scenarios A–L and audio/SMTP acceptance
are separate gates. Missing tests are `NOT_RUN`, not inferred from fake-provider
or protocol fixture results. The original shared USD10 ledger and unresolved
usage holds must be respected; no replacement ledger may reset the allowance.
