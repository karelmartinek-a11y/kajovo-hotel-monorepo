# Mail conversation reconstruction

Verified baseline: main 2bf2b144; installed production dagmar_server module hashes match the source. Admin native microphone → Voice Core WebRTC/provider → API-owned VoiceBridge sideband → provider function call → MailHost.mail_result → authenticated Mail MCP → function output → Realtime audio. Hotel voice_mail modules are compatibility imports. The browser executes no MCP tools. Confirmation is MailConfirmation and its durable VoiceMailOperation journal, independent of HA.

| Category | Decision |
| --- | --- |
| Production code | Update Dagmar host conversation state, intent executor, response policy and orchestration |
| Tests | Add scope, pagination, ordered selection, batch, native audio provenance, response and reconnect regressions; preserve consent tests |
| CI and gates | Verify existing full pytest, browser, copy-out and runtime image gates include new modules/tests |
| Documentation | Update mail contract, observability, README and this matrix |
| Comments | Replace model-owned context descriptions in changed modules |
| Instructions | Update AGENTS mail ownership and safe structured logging contract |
| Fixtures and texts | Synthetic mail only, no real mailbox bodies in artifacts |
| Build and consumers | Verify Dagmar copy-out, host imports, UI and generic core boundary; no new public HTTP API |

Protected scope: no edits to KajaVoiceHA, kajavoiceha.service or /opt/kajovo-mail-mcp. No real mail mutations during production verification. Mail bodies remain transient external data and never enter assistant memory. Standard audio readback/next audio yes and verified bypass remain authoritative.

The voice installation catalog matches the 22 production mail-mcp/2 tools, schemas and annotations. The independently deployed Mail MCP and HA services remain unchanged. See voice-mail-v2-impact-matrix.md. Native paid acceptance has separate budget/evidence; read-only runtime acceptance performs no mailbox mutations.
