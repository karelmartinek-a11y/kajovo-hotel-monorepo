# Voice correction impact matrix

| Area | Action |
|---|---|
| Production source | Update SmartPlan authorization/transport journals and capability-local retry/refresh lifecycle. Preserve sent original IDs and unrelated capabilities. |
| Tests | Add real host/store/SDK wire regressions for unsent cancellation, legacy unknown, original sent recovery, same-call retry and fresh ACK. Run all existing release gates and copyouts. |
| Actions/gates | Verify unchanged full 29-check plan; no reductions. |
| Current docs/runbooks | Update public-contract lifecycle and correction evidence. Historical reports remain historical. |
| Comments | Replace pre-send dispatch/replay assumptions with phase-specific evidence. |
| AGENTS | Update durable lifecycle and retry requirements in same commit. |
| Fixtures | Add authenticated public candidate exports after server freeze; preserve current fixtures; compact successful model output fixture. |
| Build/generated/runtime | Verify schema marker compatibility, old-reader data safety, standalone package copyout and existing public API/OpenAPI unchanged. |

No server databases, scheduler/device implementation, credentials, provider/audio effects, foreign cleanup or production business mutation are part of these corrections.
