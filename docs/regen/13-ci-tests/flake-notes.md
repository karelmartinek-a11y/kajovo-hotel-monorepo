# ORF-08 Prompt 13 – Flake notes

## Co bylo nestabilní
- CI nemělo dedikovaný smoke job s jasnou orchestrací API služby.
- Smoke scénáře nebyly vynucené jako auth flow end-to-end (admin login, hint email, create user + portal login).

## Stabilizační opatření
- Přidán izolovaný Playwright smoke config (`playwright.smoke.config.ts`) s fixním API portem, vlastním SQLite souborem a explicitním health-check waitem.
- Přidán bootstrap skript databáze (`init_smoke_db.py`) pro deterministický start bez závislosti na předchozím stavu.
- Smoke job v CI (`ci-gates.yml`, `ci-full.yml`) instaluje Chromium a spouští smoke 3x po sobě se smazáním DB mezi běhy.
- Zvýšen timeout budget: test timeout 90s, webServer startup timeout 120s, job timeout 20 minut.

## Residual risk
- Flake může nastat při infra incidentu CI runneru (např. transientní install fail u apt balíků v `playwright install --with-deps`).
- Funkční logika smoke je izolovaná od UI rendering vrstvy; pokrývá API auth business flow, ne layout/regrese vizuálních komponent.
