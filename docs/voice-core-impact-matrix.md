# Voice Core v1 impact matrix

| Category | Action | Verification |
|---|---|---|
| Production source | Update | Portable packages, admin host, FastAPI adapter, existing admin session |
| Tests | Update | Policy, encryption, authorization, lifecycle, UI, architecture, isolated host |
| CI and gates | Update | Portable checks, opt-in guard, API image import, release gate |
| Current documentation and schemas | Update | Architecture, security, OpenAPI, generated client, local runbook |
| Comments and operational notes | Update | New current contracts; repository-wide occurrence audit |
| Active instructions | Update | Portable boundary and no paid CI in AGENTS.md |
| Fixtures, selectors and text | Update | Test-only providers, responsive Voice Console, Czech labels, exact internal-chat selectors |
| Build and runtime | Update | Workspace, Python installation, Docker, master-key injection, microphone policy |
| Production deployment and merge | Verify unchanged | This delivery is a working branch; no merge or production deploy |
| Native Android voice | Not relevant | Admin-only feature; Android has no admin scope; auth permission parsing checked |

No existing business behavior is removed. Test fakes exist only in isolated test hosts.
