# Portable Voice Core browser

React Voice Console, ORB, typed host ports, WebRTC lifecycle and explicit state transitions. No application business imports.

Install React 18, supply config/secret/session/telemetry adapters, render `VoiceConsole` and import `@voice-core/browser/styles.css`. `pnpm build` produces JavaScript and declarations; `pnpm test` verifies lifecycle behavior. `pnpm test:ui` runs the isolated test host.

Hosts with server-owned function tools can supply an optional `VoiceToolExecutor` to `VoiceConsole`. It lists permitted function names and forwards validated calls to the host backend. The portable runtime deduplicates completed calls, correlates results and aborts/discards pending work on Stop. Default hosts have no executor or tools.
