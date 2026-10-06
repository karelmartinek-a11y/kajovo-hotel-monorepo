# Voice Core v1

Voice Core is a portable speech-to-speech product. The administration hosts it at `/admin/hlasovy-chat`; the employee portal and native Android application have no voice access.

## Product boundary

`packages/voice-core` contains browser contracts, WebRTC/audio lifecycle, an explicit state reducer, responsive Voice Console and audio-reactive ORB. It depends on React and browser APIs, without importing host UI, auth, URLs, entities or roles. It provides source exports and a standalone declaration/JavaScript build.

`packages/voice-core-server` is an installable Python package containing validated configuration, model/voice/language catalogs, fixed instruction construction, provider errors, the Realtime session client and generic auth/config/secret/capability ports. It does not import FastAPI, SQLAlchemy or application code.

Host adapters reside in the admin `voice-integration` directory and the API voice router/service. Dependency direction is host -> portable product. Copy both portable packages to another application and supply its auth, stores, session adapter and shell. `scripts/verify_voice_core_copy_out.py` builds and tests copied packages in a temporary directory with no host sources.

## Authentication and API

The existing signed, persistent and revocable session is authoritative. Every `/api/v1/admin/voice-core` endpoint requires an admin actor with the admin base role. Portal sessions and forged client role flags cannot grant access. Existing CSRF rules protect all writes. Admin navigation uses the shared `voice_core` permission vocabulary. Android treats permission strings as an extensible list and has no admin scope.

- `GET /config`: global validated settings, revision, configured status and portable catalogs.
- `PUT /config`: the six settings plus expected revision; conflict returns 409.
- `PUT /api-key`: write-only `api_key` secret, returning configured status and settings.
- `DELETE /api-key`: remove persistent ciphertext, even if its master key is unavailable.
- `POST /sessions`: SDP offer and expected revision; returns SDP answer, selected model, optional opaque session identity, backend-managed functions and technology readiness.
- `GET /sessions/{session_id}`: owner-only public readiness and renewal state.
- `POST /sessions/{session_id}/heartbeat`: owner-only 45-second lease renewal; does not refresh web activity.
- `DELETE /sessions/{session_id}`: owner-only termination of the sideband and provider call.

All response models omit secrets. Voice responses are `no-store`. Request bodies, including malformed key submissions and SDP, are excluded from audit capture. Voice validation errors return a safe category without input values. Provider exceptions never expose response bodies or headers.

## Secret handling

The singleton `voice_core_settings` record stores configuration JSON, a monotonic revision and optional ciphertext. Configured status is derived from ciphertext presence. There is no second user database or transcript store.

`KAJOVO_API_VOICE_MASTER_KEY` is a base64-encoded random 32-byte AES-256-GCM key supplied only to the API runtime. There is no development default or fallback to SMTP encryption. Ciphertext uses a fresh 12-byte nonce and versioned associated data. Missing, malformed, wrong or damaged encryption inputs fail closed. The deploy workflow can supply `KAJOVO_API_VOICE_MASTER_KEY` from its dedicated GitHub secret; the SSH adapter preserves an existing server value if the secret is absent. Losing or changing this key makes stored ciphertext unreadable. Database backups may contain encrypted historic records; deletion removes the active stored key, not existing backups.

A key typed into the password field necessarily exists briefly in browser memory and the HTTPS upload. It is cleared after submission, never returned by the server, and never stored in browser storage, bundles, telemetry or normal logs. Master-key changes require planned re-encryption or re-entry of the OpenAI key; this version does not implement automatic key rotation.

## Realtime and fixed policy

The browser obtains microphone access from the Start action, creates one peer connection and one data channel, and posts SDP to the host. The server loads the persistent configuration and decrypted key and sends a multipart request to OpenAI `/v1/realtime/calls`. Audio then travels directly between browser and OpenAI; the host does not proxy Realtime audio. No diagnostic recording or upload runs in the application. No OpenAI credential is returned to the browser.

Automatic mode selects `gpt-realtime-2.1`, then `gpt-realtime-2` only after a documented model-unavailable error. Authentication, permission, quota, rate-limit and transport errors do not cause fallback. Manual mode never substitutes another model.

Defaults: automatic model, automatic language, medium response and `marin`. The central catalog contains the ten documented built-in voices and Czech, English, German and Slovak. Short/medium/long policies prefer 1–2, 3–5 and 6–10 sentences and combine instructions with 512/1024/2048 maximum output tokens. The token limit is a protective ceiling, not a guaranteed sentence count.

Instructions require honest uncertainty, no invented sources or live/private facts, clarification of ambiguous requests, no claims of external actions and the selected language/length. No user-editable prompt is exposed or accepted by the host API. Model compliance is probabilistic, not a zero-hallucination guarantee; instructions are not secret credentials and OpenAI session events may expose their text. The browser application's supported transport sends no prompt/tool configuration updates; a hostile client is not an immutable-policy security boundary for OpenAI's own data-channel API.

Standalone capability registries are empty, tool configuration is omitted and `tool_choice` is `none`. The portable browser has optional host lifecycle ports and may observe named backend-managed functions without executing them. The hotel-only integration is described in [Smart technologie](voice-smart-technologies.md): the shared hotel API sideband exposes independent `smart_technologie`, `assistant_memory` and one host-owned mail_conversation intent backed by 20 remote [MAIL MCP](voice-mail.md) tools; the technology adapter uses MCP v2 compact search and session-isolated selections and sends controls with durable identity and provider delivery receipts. Hotel sessions use a 4096-token output ceiling while retaining the selected sentence policy.

Official contracts verified on 2026-09-30:

- [WebRTC unified interface](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime)
- [Realtime conversations and interruption](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [Call creation, voices and limits](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create)
- [GPT-Realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1)

## Lifecycle and UI

Permission -> connecting -> listening -> user speaking -> processing -> assistant speaking are derived from microphone/peer/data-channel events. Generation completion does not falsely imply that playback has ended. Output-buffer events control speaking state. The ORB uses the same state and optional RMS meters and respects reduced motion.

Semantic VAD automatically creates responses and interrupts ongoing responses. In WebRTC OpenAI clears/truncates unplayed output. The browser does not issue duplicate `response.create` or cancellation loops. Duplicate event IDs are bounded and ignored.

Transient disconnects replace the connection with at most two attempts after 1 and 3 seconds, while keeping one microphone stream. Every handshake revalidates host auth and configuration revision. Interruption of microphone/OS audio and unrecoverable errors require a new user Start gesture. Configuration and key controls are disabled throughout an active call; mute and Stop remain available.

Stop, unmount, pagehide and errors abort requests, stop media tracks, close peer/channel/context, clear playback sources, analyzers, animation frames, timers and listeners. Late permission or handshake completions cannot revive a stopped call. Browser/OS routing handles Bluetooth and devices; there is no device selector.

Host Nginx permits `microphone=(self)` for administration documents and keeps it disabled elsewhere. Voice Console has scoped styles and no dependency on host navigation or business CSS.

## Local execution and validation

Use pnpm 10.34.4 and Python 3.11. Install the portable server before the API:

```sh
python3.11 -m venv .venv
.venv/bin/python -m pip install ./packages/voice-core-server -e './apps/kajovo-hotel-api[dev]'
pnpm install --frozen-lockfile
```

Provide a private local database URL, existing admin credential environment and `KAJOVO_API_VOICE_MASTER_KEY`; run migrations, start the existing API with Uvicorn, and start the admin with its Vite script. Use HTTPS or localhost for microphone permission. Do not print master/API keys or put them into tracked environment files.

```sh
pnpm ci:voice-core
python scripts/verify_voice_core_copy_out.py
# After building API/admin/web images with voice-core-*-check tags:
python scripts/verify_voice_core_proxy.py
pnpm --filter @voice-core/browser test:ui
pnpm typecheck
pnpm unit
pnpm contract:check
pnpm ci:gates
python scripts/release_gate.py
```

Activate the Python environment for these commands. Portable tests and the isolated harness use test-only fakes; production code uses actual browser/OpenAI/host adapters. CI verifies the API import inside its actual Docker image.

The paid smoke is separate. Start a local host, enter the OpenAI key in its UI, provide a WAV speech fixture with pauses and an interruption utterance, and set `VOICE_CORE_LIVE_SMOKE=1`, `VOICE_CORE_AUDIO_FIXTURE` and optionally `VOICE_CORE_BASE_URL`. Run `python scripts/voice_core_live_smoke.py`. Without the opt-in the runner exits before any network/session request. Traces, screenshots, videos and conversation content capture are disabled. It observes event types only and checks speech, audio output, barge-in and microphone cleanup. Automated browser speech fixtures do not prove physical iPhone/Bluetooth behavior.

Production acceptance must identify the deployed SHA and actual scenario evidence separately from local tests. Synthetic audio does not prove physical microphone, speaker or device behavior.

Hotel memory, transient transcription/curation and bounded retrieval are defined in [Voice memory](voice-memory.md). The browser handles generic connection_state independently of individual backend capabilities; portable defaults remain tool-free.

Dagmar uses native Realtime/WebRTC barge-in with one microphone stream, peer and playback path. Playback does not disable input. The former speaker checkbox, microphone tail gate and manual interruption button are removed; mute and Stop remain. Native WebRTC VAD cancels interrupted output and adjusts unheard conversation audio. The backend fences queued tools and continuations by connection/turn/response identity; already sent mutations recover their original request instead of replaying. Exact mail/registry started/completed/drained audio consent remains mandatory. Default capture constraints and native playback remain unchanged; no acoustic improvement is claimed without measurement. Physical iPhone acceptance was cancelled by the user on 2026-10-04.

Whole Dagmar orchestration, UI/panels, memory/configuration, journals and public MCP clients are in `packages/dagmar-server` and `packages/dagmar-browser`. Hotel auth, revocation, infrastructure and navigation are host adapters. The standalone `examples/dagmar-host` uses loopback test auth and an injected mock provider; it is not a second production login. Its clean copy-out installs/builds/runs without hotel sources or host node_modules.

## R1–R3 functional repair

The application has no diagnostic capture/redaction service. Tool delivery and
operation identities remain functional state. The browser ignores duplicate ontrack
notifications for the same remote track and keeps
one native WebRTC capture/render path. Native barge-in remains active during output.

Dagmar greets only on the dedicated new-call instruction. Reconnect restores bounded
task data and accepted results without a greeting or renewed action consent. Normal
commands use at most Moment/Hotovo for true success; questions are answered directly.
Wait requests preserve the task and require no wake word to resume. Exact risky/mail
readback remains mandatory. Synthetic lifecycle tests do not prove acoustic AEC.
The 2026-10-05 physical R3 acceptance is unavailable; no unmeasured DSP/filter is enabled.
