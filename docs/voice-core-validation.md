# Voice Core v1 – lokální ověření

Ověřeno 30. 9. 2026 v pracovní větvi `codex/voice-core-v1` nad `main` `1c4adf05179a87f40fd7d005e28489b06543415b`. Tento dokument popisuje lokální výsledky; konkrétní commit a dokončené GitHub Actions jsou součástí předávacího reportu.

| Kontrola | Výsledek |
|---|---|
| pnpm 10.34.4 instalace podle lockfilu | PASS |
| lint a typecheck všech frontendů a portable balíčku | PASS |
| Python API + portable server | 232 PASS (210 API, 22 server) |
| Browser lifecycle | 10 PASS |
| Portable UI Chromium desktop/tablet/mobile + WebKit mobile | 8 PASS |
| Copy-out mimo hotelový strom, Python wheel, testovací hosty a TS build | PASS |
| Auth, CSRF, AES-GCM, mazání, revize, audit a safe errors | PASS |
| Boundary negativní testy a opt-in/CI guard | 5 PASS v API sadě |
| OpenAPI + generovaný klient | PASS; stejný kontrakt i v pinovaném Docker runtime |
| Samostatné admin/web buildy a Docker buildy API/admin/web | PASS |
| Nginx host → admin/web/API, mikrofon, security headers a 401/no-store | PASS |
| Unified release gate se všemi frontend gates a E2E | PASS |
| Širší web smoke / web visual / admin visual / admin E2E | 176 / 88 / 40 / 8 PASS |
| Admin desktop/tablet/phone WCAG AA a vizuální ověření | PASS; 3 cílené scénáře, také součást 40 admin visual testů |
| Jeden skutečný opt-in OpenAI WebRTC smoke | 1 PASS: řeč → odpověď → barge-in → ukončení a ended tracks |

Skutečný smoke použil hlasový WAV jako mikrofonní vstup a reálné OpenAI/WebRTC spojení. Klíč zadal vlastník do lokálního formuláře. Diagnostika nezachytila klíč, přepis ani obsah odpovědi. Zaznamenávala pouze typy událostí. Dodatečné zpřesnění sentence policy je ověřeno unit testy; další placený hovor nebyl spuštěn.

Testy vykazují existující deprecation warnings FastAPI/Starlette. Během širších webových testů byly v logu také chyby testovacího breakfast scheduleru bez živých Better Hotel údajů a přechodná SQLite chyba; všechny uvedené testy a výsledný release gate skončily PASS.

Fyzický iPhone, Bluetooth a změny audio routingu operačního systému nejsou ověřené. Produkce se nemerguje ani nenasazuje; produkční mikrofonní hlavička a master key vyžadují budoucí autorizované nasazení.

Android spotřebitelé `core/network`, `core/session`, preference úložiště, root navigace a feature guards přijímají permission jako seznam/množinu řetězců. Rozšíření admin permission vocabulary nemění jejich DTO ani přidává admin/voice scope. Nativní release ani instrumentovaný běh není tímto admin-only kontraktem dotčený.

Matice dopadů je uzavřena v [voice-core-impact-matrix.md](voice-core-impact-matrix.md). Všech osm kategorií je aktualizováno a ověřeno. Žádný sledovaný soubor nebyl odstraněn. Původních pět rozpracovaných sledovaných souborů a historické lokální soubory jsou bezpečně uchované pro návrat do původní větve a nejsou součástí tohoto commitu.

## Soubory této změny

- `.dockerignore`
- `.github/workflows/ci-core.yml`
- `.github/workflows/ci-full.yml`
- `.github/workflows/ci-gates.yml`
- `.github/workflows/deploy-production.yml`
- `.github/workflows/release.yml`
- `.gitignore`
- `AGENTS.md`
- `README.md`
- `apps/kajovo-hotel-admin/Dockerfile`
- `apps/kajovo-hotel-admin/nginx.conf`
- `apps/kajovo-hotel-admin/package.json`
- `apps/kajovo-hotel-admin/playwright.voice-live.config.ts`
- `apps/kajovo-hotel-admin/src/main.tsx`
- `apps/kajovo-hotel-admin/src/voice-integration/VoiceCorePage.tsx`
- `apps/kajovo-hotel-admin/tests/e2e-smoke.spec.ts`
- `apps/kajovo-hotel-admin/tests/visual.spec.ts`
- `apps/kajovo-hotel-admin/tests/voice-live.spec.ts`
- `apps/kajovo-hotel-api/Dockerfile`
- `apps/kajovo-hotel-api/alembic/versions/0039_voice_core_settings.py`
- `apps/kajovo-hotel-api/app/api/routes/voice_core.py`
- `apps/kajovo-hotel-api/app/audit_utils.py`
- `apps/kajovo-hotel-api/app/config.py`
- `apps/kajovo-hotel-api/app/db/models.py`
- `apps/kajovo-hotel-api/app/main.py`
- `apps/kajovo-hotel-api/app/observability.py`
- `apps/kajovo-hotel-api/app/security/rbac.py`
- `apps/kajovo-hotel-api/app/services/voice_core.py`
- `apps/kajovo-hotel-api/openapi.json`
- `apps/kajovo-hotel-api/pyproject.toml`
- `apps/kajovo-hotel-api/tests/test_alembic_history.py`
- `apps/kajovo-hotel-api/tests/test_voice_core.py`
- `apps/kajovo-hotel-api/tests/test_voice_core_tooling.py`
- `docs/SSOT_CURRENT.md`
- `docs/SSOT_SCOPE_STATUS.md`
- `docs/api-contract.md`
- `docs/ci-gates.md`
- `docs/current-state-manifest.yaml`
- `docs/how-to-deploy.md`
- `docs/how-to-run-api.md`
- `docs/how-to-run.md`
- `docs/rbac.md`
- `docs/testing.md`
- `docs/voice-core-impact-matrix.md`
- `docs/voice-core.md`
- `infra/compose.prod.yml`
- `infra/compose.staging.yml`
- `infra/dev-compose.yml`
- `infra/reverse-proxy/production-host.conf`
- `package.json`
- `packages/shared/src/generated/client.ts`
- `packages/shared/src/rbac.ts`
- `packages/voice-core-server/README.md`
- `packages/voice-core-server/harness/verify_host.py`
- `packages/voice-core-server/pyproject.toml`
- `packages/voice-core-server/src/voice_core_server/__init__.py`
- `packages/voice-core-server/src/voice_core_server/contracts.py`
- `packages/voice-core-server/src/voice_core_server/policy.py`
- `packages/voice-core-server/src/voice_core_server/realtime.py`
- `packages/voice-core-server/tests/test_policy.py`
- `packages/voice-core/README.md`
- `packages/voice-core/harness/index.html`
- `packages/voice-core/harness/main.tsx`
- `packages/voice-core/package.json`
- `packages/voice-core/playwright.config.ts`
- `packages/voice-core/src/contracts.ts`
- `packages/voice-core/src/index.ts`
- `packages/voice-core/src/messages.ts`
- `packages/voice-core/src/runtime.ts`
- `packages/voice-core/src/state.ts`
- `packages/voice-core/src/styles.css`
- `packages/voice-core/src/ui.tsx`
- `packages/voice-core/tests/console.spec.ts`
- `packages/voice-core/tests/runtime.test.mjs`
- `packages/voice-core/tsconfig.build.json`
- `packages/voice-core/tsconfig.json`
- `pnpm-lock.yaml`
- `scripts/check_voice_core_boundaries.py`
- `scripts/github_deploy_via_ssh.py`
- `scripts/release_gate.py`
- `scripts/verify_voice_core_copy_out.py`
- `scripts/verify_voice_core_proxy.py`
- `scripts/voice_core_live_smoke.py`
- `docs/voice-core-validation.md`
