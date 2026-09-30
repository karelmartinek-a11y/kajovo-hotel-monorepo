# Smart technologies impact matrix

| Category | Decision | Coverage |
| --- | --- | --- |
| Production code | Update | HA query/execution backend, hotel authenticated proxy, server tool definition, portable optional executor and host adapter. |
| Tests | Update | Ignore policy, live search/state, per-device capability validation, stale keys, duplicate writes, auth/CSRF, tool dispatch and cancellation. Existing voice lifecycle tests retained. |
| CI and gates | Verify unchanged | API pytest and portable boundary checks discover the added tests; generic packages retain empty default capabilities. |
| Current documentation and schemas | Update | API/OpenAPI/client, voice contract and backend configuration/runbook. |
| Comments and docstrings | Update | Default tool-free behavior and optional host capabilities described together. |
| Instructions | Update | Voice Core boundary permits host-owned tools through portable contracts. |
| Fixtures and examples | Update | Deterministic HA fixtures and smart function examples; spreadsheet contributes classification only. |
| Build and deploy | Update | Server-only upstream URL/token configuration; no new runtime dependency. Android is not a voice-tool consumer. UI geometry unchanged. |

Source: supplied `aktualni-seznam-home-assistant-mcp_klíč.xlsx`, sheet `Zařízení`, 225 device keys, manual classification in F (`Sloupec1`), 26 ignored and 199 enabled. Names, areas, current values and accepted states are fetched from HA on every request. Missing classifications do not expose newly discovered devices. Blank classifications in subsequent imports preserve the existing decision.

Production enablement requires a deployed HA smart endpoint and matching server-only credentials. Local validation must not be represented as production validation.

Local validation: 16 HA backend tests, 48 hotel API/server voice tests, 13 browser lifecycle/tool tests and 8 responsive console tests passed. Frontend typecheck, admin production build, Python lint, generated API/client and portable copy-out checks passed. Production inspection found no smart route, voice classification file or HA smart token; hotel runtime is at `a6e6a35335d683cefefb524f13ed23011ce80329`. No live device operation was submitted. Full GitHub checks and production API image remain release checks.
