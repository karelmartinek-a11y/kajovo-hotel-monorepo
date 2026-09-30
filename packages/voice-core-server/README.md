# Portable Voice Core server

Install with `pip install ./packages/voice-core-server`. Supply host auth, persistence, secret and telemetry adapters. Validate `VoiceCoreConfig` and call `RealtimeSessionClient.create` with an SDP offer and a server-only key.

Catalogs and default policy live here. There are no application entities or routes. The session client accepts optional server-owned generic function tools and their instructions; default sessions have no tools. Run `python -m pytest packages/voice-core-server/tests`.
