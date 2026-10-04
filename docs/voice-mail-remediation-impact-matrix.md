# Mail MCP and voice remediation impact matrix

Baseline: main c9b4409260558e5541446639eb1e1ab818a4fab0; clean detached worktree. Mail package is copied from the active /opt/kajovo-mail-mcp installation, separately from hotel source.

| Category | Decision | Required closure |
|---|---|---|
| Production source | Update | Authoritative text/HTML, candidate-bound audio playback, bounded mail reconnect; independent Mail MCP voice-client enforcement |
| Tests | Update | MIME roundtrip, consent/bypass negatives, connection lifecycle, real-provider isolated SMTP-stub acceptance and production read-only acceptance |
| CI/checks/gates | Update/verify | PostgreSQL image acceptance includes matching playback start; full ci:gates and real API runtime image; paid tests remain opt-in outside CI |
| README/current-state/SSOT | Update | Voice mail, installation package, limits, readiness, rollback, evidence |
| Comments/docstrings/notes | Update | Current content, playback and retry guarantees; remove missing-password assumptions |
| AGENTS/instructions | Update | Single mail content, candidate-bound playback, finite connection recovery |
| Fixtures/user text/translations | Update | HTML fixtures, safe errors and actual readiness expectations; no real mailbox writes |
| Build/generation/deploy | Verify unchanged | OpenAPI/generated client, frontend builds, image and exact-SHA standard deployment; separate Mail package release |

All 20 mail-mcp/1 tools and schemas stay unchanged. UNSUPPORTED_CAPABILITY covers incompatible independent HTML. Portable Voice Core and HA service/code/config/data must remain unchanged. No new API DTO or migration is required; existing operation journals retain identities and encrypted tokens. Android is unaffected because it does not consume hotel admin voice mail; shared HTTP contract is checked for drift.

Evidence must distinguish local tests, CI, deployed releases and real provider acceptance. SMTP acceptance by a real recipient, Sent copy and delivery are not authorized and remain unverified. Rollback restores code while retaining the current mutation ledger, never replaying a new send.
