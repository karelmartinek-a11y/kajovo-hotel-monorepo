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

- `.github/workflows/ci-gates.yml`: `scope`, `fast-checks`, `guardrails`, `contract`, `api-runtime-image`, `web-tests`, `e2e-smoke`, `visual-web`, `visual-admin`, `unit-tests`, `portable-voice-core`, `android-contract`, `release-gate`
- `.github/workflows/deploy-production.yml`: prepare observer a deploy pouze po úspěšném exact-main CI, content-bound release review a přesné připravené root transakci; observer success není deployment acceptance

Voice Core gate ověřuje importy a dependency hranice, izolovaný copy-out, Chromium/WebKit UI a produkční API/admin/web image s celým Nginx řetězcem. Placený smoke vyžaduje `VOICE_CORE_LIVE_SMOKE=1` a je v běžném CI zakázán; viz [Voice Core](voice-core.md).

## Voice Core

`pnpm ci:voice-core` pokrývá přechody hovoru, opakovaný start/stop, přerušení, souběh s pozdní odpovědí, nejvýše dvě obnovy a portable hranice. API testy ověřují admin session, CSRF, monotónní revize, AES-GCM, mazání a redakci. Izolovaný harness používá fakes pouze v testech. Responsive UI se ověřuje v Chromium a WebKit; admin visual gate navíc kontroluje WCAG AA včetně kontrastu. Postup skutečného opt-in hovoru je v [Voice Core](voice-core.md). Fyzický iPhone, Bluetooth a změny OS audio routingu vyžadují vlastní zařízení; emulace jejich ověření nenahrazuje.

## CI environment and failure evidence

Routine CI runs each complete web/admin smoke suite once. Three-run admin stability verification is separate. Visual web/admin suites preserve every scenario and viewport and use isolated jobs; admin stays workers: 1. Prepared Playwright containers match the frozen lockfile. Local browser installation is explicit via test:install-browsers, not a repeated pretest hook. Retained traces, JUnit/HTML reports and screenshots are uploaded on failure. Shared Python constraints apply to CI and runtime; see [CI gates](ci-gates.md).
