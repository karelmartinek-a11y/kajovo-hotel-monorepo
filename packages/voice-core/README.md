# Portable Voice Core browser

React Voice Console, ORB, typed host ports, WebRTC lifecycle and explicit state transitions. No application business imports.

Install React 18, supply config/secret/session/telemetry adapters, render `VoiceConsole` and import `@voice-core/browser/styles.css`. `pnpm build` produces JavaScript and declarations; `pnpm test` verifies lifecycle behavior. `pnpm test:ui` runs the isolated test host.

The default capability registry is empty. Hosts may supply an opaque session identity, managed function names, readiness labels and optional heartbeat/close ports. The browser observes those function events and manages media lifecycle; the authenticated host executes functions. Provider context renewal reconnects through the host, and a temporary generation rate limit pauses microphone input without replaying a function.
