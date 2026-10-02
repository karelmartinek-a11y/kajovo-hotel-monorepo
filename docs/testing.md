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
- `.github/workflows/deploy-production.yml`: deploy pouze po úspěšném `CI Gates - Kajovo Hotel` na `main`

Voice Core gate ověřuje importy a dependency hranice, izolovaný copy-out, Chromium/WebKit UI a produkční API/admin/web image s celým Nginx řetězcem. Placený smoke vyžaduje `VOICE_CORE_LIVE_SMOKE=1` a je v běžném CI zakázán; viz [Voice Core](voice-core.md).

## Voice Core

`pnpm ci:voice-core` pokrývá přechody hovoru, opakovaný start/stop, přerušení, souběh s pozdní odpovědí, nejvýše dvě obnovy a portable hranice. API testy ověřují admin session, CSRF, monotónní revize, AES-GCM, mazání a redakci. Izolovaný harness používá fakes pouze v testech. Responsive UI se ověřuje v Chromium a WebKit; admin visual gate navíc kontroluje WCAG AA včetně kontrastu. Postup skutečného opt-in hovoru je v [Voice Core](voice-core.md). Fyzický iPhone, Bluetooth a změny OS audio routingu vyžadují vlastní zařízení; emulace jejich ověření nenahrazuje.
