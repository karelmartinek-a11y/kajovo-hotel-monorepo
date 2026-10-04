# Dagmar diagnostics — Stage A

Stage A preserves the historical voice behavior, including the speaker microphone
gate and mail-private memory lock. These are baseline mechanisms, not the final behavior.
The full Dagmar extraction and Stage B acceptance remain pending.

## Recording

The in-call toggle starts content collection only after backend segment creation.
Off stops both MediaRecorders immediately, preserves the first immutable capture
boundary and flushes bounded queued data. Another call starts off. Reconnection
creates new media recorders and a visible gap within the same logical call.
Recorders consume the existing microphone/remote streams, never stop shared tracks,
and feature-detect MIME. Missing support is a partial recording.

Microphone audio is browser-processed input. Remote audio proves received media,
not acoustic speaker output. Provider/playback/track events supplement it. Neither
transcripts nor matching assistant text alone prove an acoustic cause.

Whole provider outputs are collected only when a response/input identity was seen
starting inside the current debug segment. Mid-turn/late boundaries are partial.
Text redaction is structural plus secret-value patterns; ordinary mail remains useful
content. Audio cannot be automatically redacted and is sensitive.

## Storage and API

The host exposes `/api/v1/admin/voice-core/diagnostics/` with current admin authorization,
CSRF on writes and no-store. Active ingest is owner-session scoped; authorized admin
read/export/pin/delete does not grant ownership of someone else's active call.

The separate volume contains SQLite schema version 1 and AES-GCM object files. Its
separate 32-byte base64 content key is read from `/run/secrets/dagmar_diagnostic_key`.
The key is provisioned outside Git and never included in evidence or exports.
No diagnostic request is duplicated into the general hotel audit or stdout logger.

| Category | Maximum bytes | Warning bytes | Cleanup target bytes |
|---|---:|---:|---:|
| Technical | 2000000000 | 1600000000 | 1800000000 |
| Debug text | 3000000000 | 2400000000 | 2700000000 |
| Debug audio | 9000000000 | 7200000000 | 8100000000 |
| Protected incidents | 1000000000 | 800000000 | 900000000 |

Accounting uses actual file allocation including directory/index/journal overhead.
SQLite uses DELETE journal; no WAL exists. A serialized inter-process reservation
covers incoming ciphertext and pessimistic peak journal/index growth before writing.
Shared index/temporary/directory overhead belongs to technical capacity. Conservative
peak reservations can stop collection before the final stored-byte maximum.

No TTL applies. Eviction chooses oldest closed unpinned calls. Pin is an atomic
category reassignment of existing objects. Protected incidents are never automatically
evicted. Active calls are not victims. Capacity/logger failures stop affected collection,
not conversation. Explicit deletion fences generation before removing all objects;
long-term memory and operation/confirmation journals are separate.

## Export

Export streams a tar archive without a managed persistent duplicate. `manifest.json`
contains call/segment/connections and bounded UI timeline. Every exported object has
its own `.manifest.json` with original and exported hashes/byte lengths. `integrity.json`
contains count and hash of ordered object manifests. Large timelines are marked partial
in UI; the exported object manifest set covers the captured snapshot. Open calls and
missing recorder finals remain explicitly incomplete. A downloaded external copy
cannot be recalled by server deletion.

Transport fragments are ordered parts of a recorder stream, not necessarily standalone
playable files. To reconstruct audio, use the exported `audio_manifest` metadata, group
by debug segment/source/track and concatenate chunks in sequence, retaining init data.
Missing chunks make the stream incomplete; do not label it playable without decoding it.

## iPhone reproduction (waiting: device unavailable)

1. Record iPhone 15 Pro iOS/Safari version, built-in microphone/speaker route, volume,
   visible model/config and release. Disable Bluetooth routing for this test.
2. Start a new call, enable debug and speak a harmless request for a short explanation.
3. During its response interrupt with another harmless question; repeat one response
   while remaining silent. Do not request device changes or actual mail sending.
4. Toggle debug off during playback, wait for its flush state, then Stop.
5. An authorized admin reads the timeline and downloads the protected export. Record
   the real heard behavior separately; received remote audio is not physical proof.
6. Repeat against the Stage B SHA for comparison. Until both captures exist, acoustic
   echo/barge-in acceptance is unverified.

Journal emergency reserve: capacity charges the allocated database plus one full future rollback journal and 262144 bytes of journal overhead. Each mutation additionally reserves 524288 bytes for bounded database/index growth and its next journal copy. The funded journal permits emergency eviction without first exceeding the technical category. No WAL is enabled.

Native download is a protected GET content retrieval (also POST for clients), with current admin RBAC on each streamed part and rejection of cross-site browser requests. Uploads and pin/delete/start/stop/export POST remain under host CSRF. No JS whole-export Blob, server persistent tar copy or URL bearer token is used.
