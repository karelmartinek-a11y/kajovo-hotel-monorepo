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

Measured real-provider acceptance is never inferred from a unit fixture or workflow
success. Real provider acceptance is preferred by default. For this particular
owner-approved completion, paid acceptance was explicitly cancelled; unpaid gates
and exact-SHA activation suffice. Unperformed paid tests remain
`NOT_RUN_BY_OWNER_POLICY`, not PASS.

## Historical live acceptance preparation

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

Final acceptance authorization (2026-10-07): update test-only accounting, runner,
guard tests, current documentation and active instructions together. Historical
ledger and production contracts remain unchanged. No paid call enters CI.

Native import completion repair: update Mail lifecycle, import-order/failure
regressions and isolated sanitized provider evidence. Update current import
documentation and active instructions. Verify shared functions, browser contract,
generated schemas and protected services unchanged. Full unpaid gates remain
mandatory. The subsequent owner policy cancels further real Realtime/WebRTC replay;
its missing measurements remain `NOT_RUN_BY_OWNER_POLICY`.

## Real-provider import and progress-speech repair

| Category | Decision | Scope |
| --- | --- | --- |
| Production source | Update | Session-level import; native silent tool selection and generation-bound audio; token-limit speech recovery; provider-generated approval identities and rejected send journals |
| Tests | Update | Import/cache, mixed response suppression, drained current speech, refusal journals, response-correlated played audio and genuine sequential/interrupting audio prompts |
| Actions and gates | Verify unchanged | Full unpaid gates and API/admin-only deploy; no paid requests in CI |
| Current documentation | Update | Session cache and two-stage native output; development versus immutable acceptance; actual audio checks |
| Comments and notes | Update | Remove obsolete out-of-band import exceptions |
| Active instructions | Update | Native session import, credential proof and exact final candidate |
| Fixtures and text | Update | Bounded caller-owned PCM prompts, closed synthetic technology connector and business-result checks |
| Build and generated contracts | Update runner; verify production unchanged | Build candidate test console; no HTTP/generated schema change; validate actual runtime image |

Partial answer buffers stay in RAM and follow existing forgetting, interruption
and disconnect invalidation. Verify memory, technology and native response
lifecycle regressions alongside the new text/audio continuation tests.

Owner decision for this completion run (2026-10-07): further paid tests are
cancelled and the remaining acceptance is USER_ACCEPTED. Update current
documentation and active instructions; preserve measured PASS/FAIL and NOT_RUN_BY_OWNER_POLICY
separately outside Git. Unpaid gates and deployment must target the final main
SHA. Activation still requires the matching release and acceptance SHA; no new
bootstrap, debug API, provider simulation or CI waiver is introduced.

## Final unpaid closure (2026-10-07)

| Category | Decision | Scope |
| --- | --- | --- |
| Production source | Verify unchanged | Audit native MCP, silent output, continuation, scope, credential and consent boundaries; repair only reproduced defects |
| Tests | Update | Strengthen existing closed TLS Mail protocol fixture: temporary-path isolation on macOS, 100-row pagination, truthfulness, MIME, version/expiry rejection and original-key send recovery; rerun all unpaid regressions |
| Actions and gates | Verify unchanged | Full CI gates, actual API image and exact-SHA API/admin-only deploy; no provider calls |
| Current documentation | Update | One authoritative USER_ACCEPTED completion policy; paid tests NOT_RUN_BY_OWNER_POLICY |
| Comments and notes | Update | Distinguish protocol observations from real provider/audio measurements |
| Active instructions | Update | Cancel further paid acceptance and infrastructure for this integration; preserve runtime safety |
| Fixtures and text | Verify unchanged | Immutable standalone code with existing isolated TLS fixture, random credentials, own database and closed SMTP receiver |
| Build and generated contracts | Verify unchanged | No API/browser schema change; regenerate/check contracts, builds and runtime artifact |

Historical evidence is immutable. Current evidence lives outside Git and binds
USER_ACCEPTED to the final main SHA. No paid call, budget reservation, ledger,
tunnel or production voice smoke is permitted in this closure. The exception
applies only to this integration, including its final documentation/test commit;
it creates no public bypass and weakens no runtime safety check.
