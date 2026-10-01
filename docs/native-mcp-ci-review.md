# Coordinated MCP release workflow

CI Gates is the only automatic authoritative main validation. CI Core keeps PR
validation; CI Full and CI Release are manual diagnostics. Direct main pushes
and expected-head PR merges both require successful exact-current-main CI Gates
and content-bound independent A–F review before production handoff.

The authoritative gate runs text integrity, frontend manifest, legacy absence and
runtime integrity checks alongside the application, native MCP, image and browser
suites. Its final job propagates every required job failure. CI concurrency binds
to source SHA; one revision or manual diagnostic cannot cancel another revision.

Deployment accepts only the trusted main workflow context. It executes the release
checker from that trusted checkout before candidate checkout or supplying production
credentials. Credentials enter the runner environment only after the gate passes;
multiline values use private runner environment files and are never printed.

Hotel deployment waits for the independently prepared root-owned active transaction
with exact hotel SHA and armed rollback timer. It cannot create that transaction.
The authoritative runtime fence and managed root rollback worker remain required.
Private MCP preflight precedes activation; acceptance precedes physical cleanup.

## Impact matrix

| Category | Disposition |
| --- | --- |
| Production source | Update workflow handoff; application/provider/HA contracts unchanged. |
| Tests | Add actual workflow trust-order, event/ref, omitted-check and cancellation regressions. |
| CI/release gates | Restore omitted integrity checks; preserve one main authority and root fence. |
| Documentation | Update this contract, deployment runbook and content-bound review evidence. |
| Comments/notes | Verify active contract descriptions; remove unsafe stale-cancellation claim. |
| Instructions | Update root AGENTS with trusted checkout, late secret injection and source-bound concurrency. |
| Fixtures/text | Use synthetic canary credentials and workflow events only. |
| Build/API/deploy | Verify current artifacts, schemas, images and canonical signing source unchanged. |
