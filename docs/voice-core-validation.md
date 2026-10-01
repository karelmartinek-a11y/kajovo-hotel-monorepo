# Standalone Voice Core validation

The active implementation uses the portable packages and existing admin host. Sessions contain tool_choice: none and no tools; the capability registry is empty. Provider/session tests inspect the actual multipart wire request. Unexpected tool events terminate the browser session without any executor.

Local commands are `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm unit`, `pnpm contract:check`, `pnpm ci:voice-core`, `python scripts/verify_voice_core_copy_out.py`, portable responsive UI, `pnpm ci:gates`, `pnpm ci:e2e-smoke` and `python scripts/release_gate.py`. Python uses the API dev manifest and central constraints. The reusable GitHub Gates graph additionally validates the actual immutable production images and proxy chain for the candidate SHA.

Root controller tests exercise failed/expired workers, fencing, accept/deadline serialization, stale identities, real snapshot/rollback Compose topology, retained images/data and secret-free public status. Image tests reject altered archives, wrong SHA/platform/service IDs and substituted loaded images. Release tests protect trusted workflow source, successful exact-current-main CI and genuine content-bound independent review.

Automatic production acceptance validates the stored-key status, empty key input, admin auth/CSRF, invalid SDP rejection, retired tool endpoint and responsive standalone UI without provider calls. Voice config/key are not modified. The hotel module regression scenarios remain required. Actual commit/CI/runtime acceptance evidence belongs to the source-bound review and runtime artifacts; a local green check alone is not deployment evidence.

A paid speech-to-speech check is a separate explicit `VOICE_CORE_LIVE_SMOKE=1` run outside ordinary CI. It uses a local speech WAV fixture and aggregate event categories only; audio, transcripts, raw provider events and secrets are not retained. Physical iPhone, Bluetooth and OS audio routing require real device testing.

OpenAPI, generated client, database revision and native Android DTOs remain unchanged by this standalone restoration. Android has no admin Voice consumer. Independent Android CI still validates native shared-API changes without blocking the web deployment chain. The eight-category closure is in [impact matrix](voice-core-impact-matrix.md).
