# Voice mail final audit impact matrix

Scope: fresh MCP v2 counts for every count turn, including anaphoric queries; explicit backend-owned metadata scope; current intent-only live harness. No external MCP implementation or production mailbox writes.

| Area | Disposition | Verification |
| --- | --- | --- |
| Production code | Update | Remove cached count path; retain prior filters as data; metadata account/folder from selected identity. |
| Tests | Update | Changing count and incomplete follow-ups; attachment cursors and cross-account guards; existing send regressions. |
| CI / release gates | Verify unchanged | Complete ci:gates and API image job; paid live remains opt-in. |
| Current documentation | Update | Fresh-count policy and metadata scope; audit evidence reports actual limits. |
| Comments / notes | Update | Remove cached count state and obsolete live raw-tool assumptions. |
| AGENTS | Verify unchanged | Existing explicit account, direct count, privacy and paid ledger rules apply. |
| Fixtures / selectors | Update | Paginated attachment fixture; live evidence observes mail_conversation. |
| Build / deployment | Verify unchanged | Exact-SHA standard deployment and read-only runtime acceptance, protected service preservation. |
