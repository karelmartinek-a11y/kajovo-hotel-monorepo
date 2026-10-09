# Lístečky MCP integration impact matrix

| Area | Disposition and validation |
|---|---|
| Production source | Update Dagmar explicit memory dispatcher, host MCP transport and shared-context invalidation. Keep shared SQL storage and automatic curation. |
| Tests | Update protocol/invalidation regression tests; add real isolated MCP/SQLite transport and PostgreSQL acceptance. Existing memory UI and full release gates remain mandatory. |
| CI and release | Verify existing validate/api-runtime-image jobs; add isolated transport acceptance to existing Python suite. Standard main-only CI followed by deploy-production. |
| Documentation | Update current memory contract and deployment runbook; record ChatGPT connection parameters without credentials. |
| Comments | Update affected transport and context descriptions; preserve unrelated comments. |
| Instructions | Update AGENTS.md for host transport, shared version checks and secret handling. |
| Fixtures and UI | Add isolated synthetic memory fixtures. Verify existing UI, RBAC, CSRF, revisions and typed errors without changing user flows. |
| Build and contracts | Add backend-only environment settings and secure deployment transfer. Verify generated OpenAPI/client unchanged. No new dependency, schema migration, frontend credential or Android contract. |

Production baseline: origin/main and active API release `5ace08889b3f79d28246850cefee46876c12d685`; MCP source `9141cd7f2430c3702b0ad0cab5fd3b77eb05f3d5`. Runtime must be reverified after deployment. Physical audio and user ChatGPT connection are separate acceptance boundaries.
