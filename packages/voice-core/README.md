# Portable Voice Core browser

React Voice Console, ORB, typed host ports, WebRTC lifecycle and explicit state transitions. No application business imports.

Install React 18, supply config/secret/session/telemetry adapters, render `VoiceConsole` and import `@voice-core/browser/styles.css`. `pnpm build` produces JavaScript and declarations; `pnpm test` verifies lifecycle behavior. `pnpm test:ui` runs the isolated test host.

The default capability registry is empty. Hosts may supply an opaque session identity, managed function names, readiness labels and optional heartbeat/close ports. The browser observes those function events and manages media lifecycle; the authenticated host executes functions. Provider context renewal reconnects through the host, and a temporary generation rate limit pauses microphone input without replaying a function.

Hosts can opt into `speakerEchoProtection`. The console offers “Používám reproduktory”; while enabled, microphone tracks pause during provider playback and its 400 ms acoustic tail. Heartbeats and unmute cannot bypass that gate. “Přerušit odpověď” cancels ongoing generation if necessary and clears provider playback; input resumes only after acknowledgment and the tail. Turning protection off retains voice barge-in for headphones. The portable default stays off. No audio or transcript is stored by this policy.

Provider-confirmed `output_audio_buffer.stopped` drains the entire WebRTC playback buffer. Its response ID can differ from the start event in a real call. The acoustic gate clears globally on drain/clear and waits for the tail; a new start cancels that pending release. Mail/registry action consent continues to require its exact backend response proof. The paid regression verifies that microphone input is live again before the next turn.
