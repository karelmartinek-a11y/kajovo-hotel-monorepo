# A) Cíl
- Dokončit webový modul snídaně (import PDF, diety, reaktivace) včetně API/DB parity a CI kompatibility.

# B) Exit criteria
- CI guardrails projdou včetně `ci:verification-doc`.
- API testy pro import PDF a uploady fotografií nevrací 500.
- PR obsahuje aktualizovaný OpenAPI kontrakt a generovaný klient.

# C) Změny
- Přidány dietní příznaky a admin reaktivace snídaní v API + klientovi.
- Doplněna lokální smoke auth konfigurace pro CI (`test:smoke-auth`).
- Stabilizace testů přes explicitní `KAJOVO_API_MEDIA_ROOT` v pytest setupu.
- Přidán vzorový PDF soubor pro parsing testy.

# D) Ověření
- Lokálně spuštěno: `pnpm unit`, `pnpm ci:gates` (po dílčích krocích), `pnpm ci:e2e-smoke`, `pnpm --filter @kajovo/kajovo-hotel-admin test:smoke-auth`, `pnpm --filter @kajovo/kajovo-hotel-web test`.
- OpenAPI a klient vygenerovány ekvivalentem `contract:check` (Windows bez `python3`).

# E) Rizika/known limits
- CI e2e/auth smoke závisí na dostupnosti Playwright + uvicorn v runneru; je nutné hlídat stabilní porty a databázové cesty.

# F) Handoff pro další prompt
- Pokud CI ještě selže, postupovat podle logu `CI Gates`/`CI Full` a přidat minimální fix do stejného PR.

