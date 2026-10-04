# Voice MAIL MCP impact matrix

Baseline: origin/main 0f031db033fac4d3ace28cb402489f581b3d0284. Work is isolated from unrelated dirty checkouts.

| Category | Decision | Scope |
|---|---|---|
| Runtime source | Update | Hotel API mail adapter, durable metadata, independent sideband lifecycle, admin read-only status |
| Tests | Update | Contract, privacy, owner/auth, audio confirmation, idempotency, responsive real-API panel |
| CI and gates | Update | Add responsive mail UI to existing complete gate; retain runtime image checks |
| Documentation/SSOT | Update | Mail contract/runbook, source catalog and generated API |
| Comments | Update | Document current privacy and recovery guarantees beside implementation |
| AGENTS | Update | Hotel-only mail security and confirmation boundary |
| Fixtures/user text | Update | Isolated provider fixture and Czech status text; four readback languages |
| Build/generation/deploy | Update/verify | OpenAPI/client, Compose env; existing secret preservation, Docker dependencies and Android consumers verified unchanged |

HA MCP: verify unchanged. MAIL MCP has a separate voice-client content enforcement release; see voice-mail-remediation-impact-matrix.md. Portable Voice Core: verify unchanged. No mailbox credentials or real SMTP send authorized here. Live readiness and read-only acceptance are checked against current account results. Real sending/Sent/delivery require explicit consent and remain unverified.
