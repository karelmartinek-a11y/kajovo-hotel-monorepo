# Native Mail MCP impact matrix

Baseline: origin/main d31e6ef437ae04417438dea38521823c64abf38f. Mail MCP 1.1.1,
build 6dde2763d0dc4ff16ca712f26b258e6875514e7ff50a5fb5ea93fc22257495be.

| Category | Decision | Required evidence |
| --- | --- | --- |
| Production source | Update | Native remote MCP, continuation, consent, encrypted secrets, generic browser observation |
| Tests | Update | Races, scope, reconnect, consent, failure isolation; real Realtime/audio separately |
| Actions and gates | Update | Full unpaid gates; selective API/admin deployment |
| Current documentation | Update | MAIL_MCP_INTEGRATION.md, current manifest, voice contracts |
| Comments and notes | Update | Replace superseded two-capability expectations; repository-wide search |
| Active instructions | Update | Native Mail boundary, protected services, activation acceptance |
| Fixtures and text | Update | Synthetic Mail inputs, public readiness, responsive UI |
| Build and generated contracts | Update | Dagmar OpenAPI/types, hotel OpenAPI/client, runtime image |

Android: verify unchanged; voice is admin-only and Android has no voice API consumer.
Protected Mail MCP, KajaVoiceHA, read-only MCP, standalone dagmar-backend, PostgreSQL,
web and their production configuration: verify unchanged. No real mail send.

Acceptance is not inferred from a unit fixture or workflow success. Paid Realtime,
WebRTC credential isolation and audio evidence are required before activation.

## Live acceptance preparation

| Category | Decision | Scope |
| --- | --- | --- |
| Production source | Update | Fail closed when an opt-in test cannot open the original budget; voice business behavior unchanged |
| Tests | Update | Missing/foreign ledger rejection and isolated runner preflight |
| Actions and gates | Update | Allow only the existing native test-host script/README in selective scope; unpaid full gates, no paid call in CI |
| Current documentation | Update | Reproducible real browser probe, accounting and remaining live gates |
| Comments and notes | Update | Test-only bounds and evidence limits |
| Active instructions | Update | Existing ledger required before any live test bootstrap |
| Fixtures and text | Update | Portable unit ledger data, original-envelope observer tests and caller-owned synthetic native-audio/canary inputs |
| Build and generated contracts | Verify unchanged | No public API/schema/browser contract change; actual existing Dagmar test-host bundle |

Production activation remains a separate exact-SHA acceptance gate. The runner
is a loopback test process, not a production debug endpoint or acceptance bypass.
