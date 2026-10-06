# Voice Mail MCP v2 impact matrix

| Area | Decision | Evidence / validation |
| --- | --- | --- |
| Production client, host, conversation | Update | v2 header/catalog, direct count/batch, scope guards and frozen snapshots |
| Unit/integration/fixtures | Update | native human intent through host; real schema validation and isolated mutations |
| CI/release gates | Verify unchanged | existing full release plan and runtime image gate |
| Current docs, SSOT, manifests | Update | exclusive mail-mcp/2, no fallback |
| Comments and instructions | Update | remove dead count emulation and v1 descriptions |
| UI and translations | Verify unchanged | existing backend response and responsive admin mail tests |
| API/OpenAPI/generated client | Verify unchanged | no HTTP DTO change; contract check |
| Build/deploy | Verify unchanged | API/admin builds, exact-SHA standard main deployment |
| Mail MCP / HA / portable Voice Core | Verify unchanged | independent services; only read-only production acceptance |
