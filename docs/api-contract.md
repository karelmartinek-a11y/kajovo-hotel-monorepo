# API Contract and Typed Client

This repository keeps the API contract deterministic by generating artifacts directly from the FastAPI app source.

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
