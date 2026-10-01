# Native MCP impact matrix

| Category | Disposition | Contract |
|---|---|---|
| Production source | update/remove | Generic MCP provider, native Realtime lifecycle, host HA configuration; remove replaced proxy/executor. |
| Tests | update/remove | Session isolation, credential non-disclosure, MCP lifecycle, cancellation, reconnect and boundaries. |
| CI/required checks | update | Runtime image verifies current session route and absence of replaced routes; gates enforce architecture; production opens an authenticated Voice WebRTC session and checks MCP import when configured. |
| Documentation/schemas | update/remove | Current remote MCP contract; remove bridge descriptions; regenerate OpenAPI/client. |
| Comments/notes | update/remove | Current lifecycle and auth semantics only. |
| Instructions | update | Portable MCP boundary and host configuration. |
| Fixtures/text/selectors | update/remove | MCP readiness and errors in existing voice UI; retain ORB/audio state. |
| Build/generators/deploy | update | Server signing key mapping, canonical HTTPS proxy, generated contract and live acceptance. |

Android and employee portal do not consume admin Voice endpoints; verify this with full-tree search. Existing admin authentication, CSRF, encrypted OpenAI key storage and audio/session lifecycle remain authoritative.

## Review hotfix scope

All eight categories above require updates for approval wire identity, rendered-request locking, secret-safe validation, host-managed key handoff, Compose defaults, aggregate smoke evidence and transactional release gates. OpenAPI/client and Android are verified unchanged: no public route/body contract changes. Review completion and zero unresolved findings are independent gates from CI. Known-good release trees/images remain protected until coordinated acceptance.

Realtime calls contract correction: update internal MCP config/host producer, exact multipart regression and early status-only smoke failure detection; update core README and instructions. Existing CI/release gates verify all fixes. OpenAPI/client, browser approval wire, Android consumers, fixtures, translations and data schema are verified unchanged because public API bodies and UI behavior do not change. The new calls endpoint returned unknown_parameter for session.tools[0].server_description; no credential/input detail is logged.
Native MCP authorization follows the documented access-token field: raw scoped token, with its HTTP scheme supplied by OpenAI. Host API regression verifies the unprefixed token and private response boundary; no MCP server authentication relaxation is added.
