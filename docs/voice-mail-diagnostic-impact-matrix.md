# Mail result diagnostic impact matrix

Baseline: origin/main 566022e4. Requested scope: diagnose a spoken unread-count answer without retaining mail content or transcripts.

| Area | Change / validation |
|---|---|
| Runtime | Hotel sideband logs allowlisted MCP index, connection and pagination metadata only after provider output acknowledgment |
| Tests | Distinct incomplete-index/unavailable-account/page cases, private-content canaries, acknowledgment ordering, existing mail and full gate |
| Docs / SSOT / AGENTS | Define diagnostic fields and limits |
| API / MCP / DB / clients | No contract, tool schema, migration or UI change |
| Portable Voice Core / HA / Mail server | Unchanged |
| Production | Exact-SHA CI/deploy, real spoken account inquiry and sanitized diagnostic observation; user's unread question follows readiness |

No mail mutation or SMTP send. Result counts are page sizes, not mailbox totals. No body, subject, addresses, refs, cursors, tokens, inputs or transcripts are logged.
