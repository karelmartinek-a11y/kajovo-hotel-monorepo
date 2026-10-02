# API Contract and Typed Client

This repository keeps the API contract deterministic by generating artifacts directly from the FastAPI app source.

The contract includes `/api/v1/chat`. Chat identities come from the authenticated server session, and every conversation operation checks participant membership. See `docs/internal-chat.md` for Web Push deployment settings and delivery behavior.

Voice Core uses `/api/v1/admin/voice-core` with admin session/CSRF enforcement. Configuration uses a monotonic revision; key writes never return the key, and session creation returns only SDP and the selected model. See [Voice Core](voice-core.md).

Install `./packages/voice-core-server` before the API when generating the contract locally.

## Artifacts

- `apps/kajovo-hotel-api/openapi.json` – canonical OpenAPI contract exported from `create_app()`.
- `packages/shared/src/generated/client.ts` – generated TypeScript types + API client from the OpenAPI contract.

## Commands

Run from repository root:

```bash
pnpm api:generate-contract
pnpm shared:generate-client
pnpm contract:generate
pnpm contract:check
```

### What each command does

- `pnpm api:generate-contract` exports OpenAPI JSON using:
  - `apps/kajovo-hotel-api/scripts/export_openapi.py`
- `pnpm shared:generate-client` generates typed client code using:
  - `packages/shared/scripts/generate_client.py`
- `pnpm contract:generate` runs both generation steps.
- `pnpm contract:check` regenerates and fails when generated files differ from git-tracked output.

## CI enforcement

CI runs `pnpm contract:check`. If an endpoint/schema changed without committing regenerated files, the pipeline fails.

Admin voice memory uses typed closed models under /api/v1/admin/voice-memory, authenticated admin sessions and CSRF (including POST search). Content search is never a query-string parameter. Optimistic edits return 409. See [voice-memory](voice-memory.md) and its exact [tool schema](assistant-memory.schema.json).
