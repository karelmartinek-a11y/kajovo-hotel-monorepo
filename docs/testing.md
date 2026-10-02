# Testování

Základní úplný plán, příkazy, GitHub jobs a meze důkazu jsou v [CI gates](ci-gates.md). Dopady změny CI jsou v [matici](ci-impact-matrix.md).

Před lokálním během použij Python 3.11, pnpm 10.34.4, `pnpm install --frozen-lockfile`, instalaci `packages/voice-core-server` a `apps/kajovo-hotel-api[dev]` a Playwright Chromium/WebKit. Poté `pnpm ci:gates`. Docker job vyžaduje běžící Docker a produkční Dockerfile všech tří aplikací; proxy se ověřuje `scripts/verify_voice_core_proxy.py`.

API testy pokrývají session/CSRF/RBAC, správu uživatelů, rezervace a jejich diety/amenity verze, snídaně, housekeeping, chat a hlasovou bezpečnost. Browser baseline používá skutečné API a ukládání do testovací databáze. Podrobná regrese modulu se spouští podle změny; existující visual suite zachovává viewporty a admin `workers: 1`.
