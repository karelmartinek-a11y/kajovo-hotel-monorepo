# Portable Voice Core server

Install with `pip install ./packages/voice-core-server`. Supply host auth, persistence, secret and telemetry adapters. Validate `VoiceCoreConfig` and call `RealtimeSessionClient.create` with an SDP offer and a server-only key.

Catalogs and immutable default policy live here. There are no application entities, routes or tools. Run `python -m pytest packages/voice-core-server/tests`.
