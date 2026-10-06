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
