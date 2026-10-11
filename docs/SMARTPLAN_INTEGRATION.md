# SmartPlan in Dagmar

The hotel authenticates the voice owner and runs a backend HTTPS gateway to the independent SmartPlan service. It stores no scenarios, schedules, timers, execution queues or device state. The model composes the eleven deployed `smartplan_*` tools. The exact input schemas are packaged in `smartplan_contract.json`; there is no hotel intent classifier or replacement API.

## Pinned public contracts

- SmartPlan `1.0.1`, contract `1.0`, release `v1.0.1-20261011-r2`, `https://smartplan.hcasc.cz/mcp`.
- Contract SHA256 `ca52f4a36807850478640630718af64f9b36b778b077c4688c742134bdfa9850`.
- Upstream contract SHA256 `dd0ef3bb9b16643083e4ac9f7e784bb411f25ed514398cd10096576a3120ba98`, KajaVoiceHA `v2.1.18-20261011-f2631faf6fdb`, `https://apimcpkajavoiceha.hcasc.cz/mcp`.
- Upstream handoff schemas are packaged alongside the SmartPlan contract. No upstream service credential, `/smartplan/v1` call, HA connection, shared database or implementation import is used by the host.

Initialization and tools/list are verified once per voice connection. All eleven names and complete schemas must match before tools become available. Each new connection revalidates the catalog. A protocol/authentication incompatibility removes only SmartPlan; normal conversation, memory, Mail and immediate technologies retain their existing paths. The existing Realtime function-result/continuation coordinator processes results; browser clients only observe managed functions.

Upstream business error codes are bounded identifiers; a code containing the host credential is replaced with a generic error, just as credentials are excluded from successful tool results.

Ready SmartPlan continuations inherit the acknowledged session tools instead of resending the full schemas on every response. Its fixed schema token count is added to the existing context-pressure allowance only while SmartPlan is ready; the conversational allowance and 4,000-token/24,000-byte reconnect snapshot remain unchanged.

## Credential and owner

The handed-off credential is named `SMARTPLAN_VOICE_HOST_TOKEN`. Its protected source is `/etc/smartplan/credentials/voice-host-token`; it is copied through stdin into the hotel-owned AES-GCM secret store `dagmar_smartplan_secrets`, using the existing voice master key with separate associated data. The source file is never mounted or shared with the hotel. No credential browser endpoint or public acceptance bypass exists.

After the additive migration, import without placing the value in process arguments:

```sh
docker exec -i kajovo-prod-api-1 python -m app.services.import_smartplan_secret < /etc/smartplan/credentials/voice-host-token
```

The normal authenticated Dagmar panel uses `GET /smartplan` and `POST /smartplan/link` under the existing host prefix and CSRF/session policy. The subject comes from the backend's verified voice namespace, never a request/model user ID. SmartPlan's owner must log into its browser and explicitly approve `/host/link`; only then does the stored `X-SmartPlan-Link` authorize MCP and `/host/confirm`. The same SmartPlan owner sees the same scenarios/history from ChatGPT OAuth and voice. Actual ChatGPT UI linking is a separate user action and is not established by fixtures. Owner link/host scopes and revocation remain enforced on every remote request.

## Routing and references

Immediate control remains `smart_technologie`. Future/recurring scenarios use SmartPlan. Device selection uses the original authenticated Kaja MCP session: search → describe → SmartPlan bind context → Kaja smartplan_handoff issue → SmartPlan bind redeem. The host requires its own unexpired context, current selection and actual described row/kind/function before issue. Internal HA IDs, owner-binding envelopes and credentials are excluded from model/browser outputs. Persistent SmartPlan bindings replace session selections in scenarios.

The complete Scenario/Patch schema supports typed schedules, nested conditions and multiple actions. The host forwards supported structures without interpreting dates or calculating solar times. Instructions distinguish anchors from ISO parity, dawn/sunrise/sunset/dusk, and require clarification of ambiguous time. Weather is not added. Current upstream cannot prove temporary ownership: automatic restore may be safely skipped; unconditional set-delay-set must be described as such.

## Mutation and confirmation

Read-only tools and preview do not execute actions. Prepare returns the server proposal, fingerprint, revision, expiry, concrete summary, next occurrences and warnings. The host reads this exact data with tools disabled. Only a completed matching provider audio response, matching drained output buffer and the next genuine native committed audio input with an unambiguous confirmation can authorize it. Model fields, text messages, tool data, old audio, a changed proposal, expiry or another provider session cannot supply confirmation.

The backend writes metadata-only receipts before `/host/confirm`, then commits the same `proposal_id`. Lost acknowledgements replay the original persisted input event and proposal. A completed commit is read back by the same proposal ID; no new prepare/run identity is manufactured. Pre-dispatch prepare/bind deliveries are reserved against native audio intent and argument digest; duplicate/uncertain delivery requires a new actual instruction, not an automatic replay. No proposal content, audio or transcript is stored in the durable tables.

Existing scenarios require `expected_revision`; a conflict is surfaced, followed by a fresh detail and clarification. Rename preserves server identity/history. Pause/delete affect future starts; server runs continue under their original revision, including delayed steps. Voice Stop/disconnection does not cancel server work. Results preserve per-target unknown/partial/uncertain states and distinguish command/verification receipt timestamps from physical measurement.

## Validation, deployment and rollback

Isolated HTTP fixtures derive all tool inputs from the pinned deployed schemas. They exercise catalog drift, owner/scopes, handoff, exact audio-event provenance, expiry, barge-in, changed proposals, original-ID timeout recovery, duplicate submissions and business errors. Existing Smart/registry/memory/Mail lifecycle regressions remain mandatory. Complete `pnpm ci:gates`, portable copy-out and actual API-image CI apply. No paid provider/audio call, physical control or production scenario mutation belongs to this validation.

Ship directly on current main with `Hotel-Deploy-Scope: api-admin`; recreate API/admin with `--no-deps`. Preserve Mail's existing exact release/acceptance configuration and owner policy. Compare protected service PID/start/restarts, web/PostgreSQL containers, listeners and nginx hashes before/after. Runtime/source hashes and public authenticated read-only MCP evidence must refer to the deployed host SHA. Evidence lives outside Git; it contains no credentials, private tool bodies or audio.

Rollback is a compatible main-only host adapter correction (or disabling/removing its capability), preserving encrypted secrets, owner links and delivery/confirmation metadata. It never restores SmartPlan DB, deletes scenarios or cancels server runs.

Remaining user acceptance: after approving the account link, start voice normally and ask “Které scénáře mám?” and “Co se spustí dnes večer?”. This run does not certify natural speech interpretation, actual ChatGPT UI connection or physical device results. Paid OpenAI/WebRTC/audio tests are NOT_RUN_BY_OWNER_POLICY.
