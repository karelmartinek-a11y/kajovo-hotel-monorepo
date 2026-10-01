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
