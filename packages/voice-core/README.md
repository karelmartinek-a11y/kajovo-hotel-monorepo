# Portable Voice Core browser

React Voice Console, ORB, typed host ports, WebRTC lifecycle and explicit state transitions. No application business imports.

Install React 18, supply config/secret/session/telemetry adapters, render `VoiceConsole` and import `@voice-core/browser/styles.css`. `pnpm build` produces JavaScript and declarations; `pnpm test` verifies lifecycle behavior. `pnpm test:ui` runs the isolated test host.

The generic native MCP lifecycle tracks import readiness and correlates response calls. It waits for response.done and every corresponding tool completion before one follow-up response.create. Barge-in and Stop discard pending continuations; reconnect clears correlation state. The existing console presents MCP status and native approval requests. The browser never executes external capabilities.

Native approval decisions carry a unique client item ID and the exact rendered approval request ID. Queue promotion cannot consume stale clicks; double click events are suppressed by the UI. Stop and reconnect discard pending approvals.
