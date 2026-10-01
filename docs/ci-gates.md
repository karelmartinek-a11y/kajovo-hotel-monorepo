# CI gates

Aktivní blokující kontroly jsou zaměřené na web, admin, API a produkční deploy integritu.

## Hlavní gate

- `pnpm ci:voice-core`
- `pnpm ci:policy`
- `pnpm ci:policy-test`
- `pnpm ci:tokens`
- `pnpm ci:brand-assets`
- `pnpm ci:signage`
- `pnpm ci:text-integrity`
- `pnpm ci:portal-translations`
- `pnpm ci:frontend-manifest`
- `pnpm ci:runtime-integrity`
- `pnpm ci:web-smoke`
- `pnpm ci:visual`
- `pnpm contract:check`
- `pnpm typecheck`
- `python3.11 -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests`
- `python3.11 scripts/release_gate.py`

## GitHub Actions mapování

- `.github/workflows/ci-gates.yml`: `api-runtime-image`, `release-gate`, `e2e-smoke`, `guardrails`, `lint`, `typecheck`, `unit-tests`, `portable-voice-core`
- `.github/workflows/deploy-production.yml`: explicitní coordinated deploy po úspěšných exact-main CI Gates, CI Full a CI Release a content-bound Independent Codex multi-agent forensic review

Voice Core gate ověřuje importy a dependency hranice, izolovaný copy-out, Chromium/WebKit UI a produkční API/admin/web image s celým Nginx řetězcem. Placený smoke vyžaduje `VOICE_CORE_LIVE_SMOKE=1` a je v běžném CI zakázán; viz [Voice Core](voice-core.md).

The independent review checker binds the full candidate source tree to all six final reviewer records and rejects stale fingerprints, missing reviewers, unresolved blocking findings or count discrepancies. Evidence lives in `native-mcp-independent-review.json` and its readable report.
