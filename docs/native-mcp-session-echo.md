# Native MCP session echo validation

The outgoing Calls session uses only the canonical remote MCP URL, label,
authorization, exact three-tool allowlist and read-only approval exception.
It never selects a connector or tunnel. OpenAI session.created and
session.updated may echo these unused fields as null. Null or omission denotes
an unused transport; any actual connector/tunnel value fails the production gate.
The echo guard also requires the exact URL, label, allowlist and approval policy.
The independent credential-redaction and completed tool-import guards still apply.

The current official Realtime server-events contract and a direct native Calls
diagnostic on 2026-10-01 established the nullable echo. The diagnostic used a
reserved invalid MCP hostname, made no HA request, retained secrets only in process
memory and reported only field-presence/equality booleans. The failed production
attempt was rolled back before cleanup; it is not acceptance evidence.

## Impact matrix

| Category | Disposition and evidence |
| --- | --- |
| Production source | Update live acceptance echo guard; host/provider and portable runtime unchanged. |
| Tests | Add exact nullable echo, transport rejection, configuration/policy mismatch and injected-function regression tests. |
| CI/release gates | Update ci:voice-core test list; existing workflows execute the same gate. |
| Documentation | Update this current contract and independent review evidence. |
| Comments/notes | Replace property-absence assumption with nullable response semantics. |
| Instructions | Update AGENTS.md with strict request vs nullable echo distinction. |
| Fixtures/user text | Add sanitized wire fixture; no production names, credentials or user-facing changes. |
| Build/API/deploy | Verify unchanged OpenAPI/client/provider serialization, source-bound review, CI and transaction rollback; no architecture or deployment-order change. |

Sources: [Realtime MCP guide](https://developers.openai.com/api/docs/guides/realtime-mcp),
[Realtime server events](https://developers.openai.com/api/reference/resources/realtime/server-events).
