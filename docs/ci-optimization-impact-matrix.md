# CI optimization impact matrix

| Category | Disposition and proof |
|---|---|
| Production source | Deployment worker, image manifest validation and semantic active-contract guard updated; hotel business behavior unchanged. |
| Tests | Router, aggregator, review ancestry, immutable artifact and hotel deadline/rollback negative cases updated; smoke scenarios/viewports preserved. |
| GitHub / gates | PR-only Core, shared Gates graph, fast prerequisites, conditional jobs, stable aggregator, deterministic setup, failure artifacts and separate stability verification. |
| Documentation | CI/test/deploy/review runbooks updated to executable policy. |
| Comments | Active orchestration and runtime comments describe the new verified artifact flow. |
| Instructions | AGENTS updated in the same change for scope, concurrency, deterministic dependencies, review and retention. |
| Fixtures / snapshots / UI | Local CI credentials replace production secrets; no UI strings or geometry expectations removed. |
| Build / contracts / deploy | One verified immutable build, exact SHA/image IDs/checksum, dependency scope includes Android API consumers; OpenAPI generation remains required for relevant changes. |

Rollout validation must run the real GitHub graph for the published SHA. Targets are measured after rollout; no numerical speedup is asserted before those results. Production acceptance and runtime SHA must be reported separately from worker and CI success.
