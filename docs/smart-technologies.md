# Smart technologies voice function

Hotel administration exposes one function, `smart_technologies`, with operations `search`, `state` and `execute`. Employee web/Android clients do not gain voice access. Portable Voice Core receives generic host tools and an optional `VoiceToolExecutor`; HA logic remains in host adapters.

The supplied XLSX has 225 device keys, 199 enabled classifications and 26 `Ignoruj` entries in F (`Sloupec1`). The backend imports only the stable key and manual classification. Names, aliases, areas, availability, measurements and per-device capabilities are fetched live from HA. Blank classifications or omitted rows in later imports preserve the existing decision; new unclassified devices remain excluded. Unassigned HA areas are returned as `Nezařazeno`.

Search combines filters with AND. `query` searches all whitespace-separated tokens across name, aliases, area and manual type without case/diacritics. `location`/`device_type` use normalized substring matching. `state` matches an exact raw value, state key or full human value on an available property. `property_key` scopes state and numeric `min_value`/`max_value` filters to that same property. `availability` is an exact enum. Pagination uses `limit` (1–50), `offset`, `total_count` and `has_more`.

```json
{"operation":"search","location":"Recepce","device_type":"Světlo","property_key":"power","state":"on"}
```

`state` can use a discovered `device_key`. `execute` requires exact `device_key`, `property_key`, `state_key` and `catalog_version` from a previous tool result. Each device exposes its own `controllable_properties.allowed_states`; identical types may have different operations. Ordinary value/timestamp changes do not invalidate the voice catalog version. Unknown/stale keys, ignored devices and unsupported states are rejected. Search filters cannot target execution and arbitrary HA services/parameters are forbidden. Existing denied/approval-domain policy applies; required approvals are returned without execution.

Function calls from completed responses go to `POST /api/v1/admin/voice-core/tools` with `name`, `call_id` and validated `arguments`. Cancelled responses never dispatch commands. Existing admin session and CSRF are required. The host derives a receipt ID from session plus call ID; the backend stores durable SQLite receipts. Same-ID retries return the saved result, changed arguments conflict and incomplete receipts never repeat an actuator call. Neither proxy nor HA smart submission retries transport failures. Stop aborts browser requests and discards late results; a command already submitted may still finish in HA.

`accepted` means HA acknowledged the service request. Returned current values are separately observed and may still be transitioning. `unknown` means the outcome/readback is unverified and must not be automatically resubmitted. Ambiguous targets require clarification. Device names and returned data are data, not instructions.

## Configuration

Companion backend in `karelmartinek-a11y/agentha`: `app/smart_technologies.py`, `app/voice_policy.py`, `scripts/import_voice_policy.py`, `config/voice-policy.json`.

- HA runtime: existing `HA_BASE_URL`/`HA_TOKEN` connect to HA on `ha3.hcasc.cz`. Set dedicated `HA_SMART_TOKEN`; optional `HA_VOICE_POLICY_PATH` defaults to `./config/voice-policy.json` and persistent `HA_SMART_RECEIPTS_PATH` defaults to `./data/smart-receipts.sqlite3`.
- Publish the agent's authenticated `POST /v1/smart-technologies` through HTTPS explicitly. Publishing `/v1/catalog` does not expose this route automatically.
- Hotel runtime: `KAJOVO_API_SMART_TECHNOLOGIES_URL` is the exact HTTPS endpoint; server-only `KAJOVO_API_SMART_TECHNOLOGIES_TOKEN` matches `HA_SMART_TOKEN`. Compose and SSH deployment preserve/configure both. GitHub can supply the URL variable and token secret of these names.
- Without both hotel values, sessions retain tool-free policy and calls return `smart_technologies_not_configured`. Environment changes require API restart and a new voice session.

Import later deltas with `python scripts/import_voice_policy.py SOURCE.xlsx config/voice-policy.json`. Preserve the data directory, stable key registry and receipts across deployments. Verify authenticated search/state before testing an explicitly selected operation. No actuator command is needed for a connectivity check.

Realtime handling follows the official [tool contract](https://developers.openai.com/api/docs/guides/realtime-mcp) and [function output flow](https://developers.openai.com/api/docs/guides/realtime-conversations), checked 2026-10-01.
