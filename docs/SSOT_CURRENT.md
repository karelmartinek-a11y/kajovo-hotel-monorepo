# SSOT current state

## Aktivní architektura

- `apps/kajovo-hotel-web` je veřejný a provozní portál na `https://hotel.hcasc.cz`.
- `apps/kajovo-hotel-admin` je administrace na `https://hotel.hcasc.cz/admin`.
- `apps/kajovo-hotel-api` je FastAPI backend s OpenAPI exportem v `apps/kajovo-hotel-api/openapi.json`.
- `packages/shared` drží RBAC, i18n a generovaný API klient v `packages/shared/src/generated/client.ts`.
- `packages/ui` drží sdílený shell a UI komponenty.
- `packages/voice-core` a instalovatelný Python balíček `packages/voice-core-server` tvoří přenositelný hlasový produkt na `/admin/hlasovy-chat`. Hotelové adaptery používají existující session a databázi; portable balíčky neimportují hotelové aplikace ani shared/UI. Podrobnosti jsou v `docs/voice-core.md`. Hotelový backend obsluhuje nezávislé assistant_memory a smart_technologie přes společný serverový sideband; paměť není MCP ani agent a portable balíčky neobsahují hotelová data. Viz `docs/voice-memory.md`. Volitelná nativní Mail capability a její oddělená aktivace jsou popsány v `docs/MAIL_MCP_INTEGRATION.md`.
- Přihlášené aplikace používají `AppShell` s pevným záhlavím a spodní navigací v jedné vodorovně posuvné řadě na desktopu, tabletu i telefonu. Chat je první, následují moduly podle role a nakonec Profil. Podrobnosti jsou v `docs/ui-navigation.md`.

## Runtime a bezpečnost

- API registruje routy `auth`, `app_meta`, `health`, `reports`, `breakfast`, `housekeeping`, `device`, `lost_found`, `issues`, `inventory`, `users`, `settings`, `profile`, `chat`, `voice_core` a `voice_memory`.
- Autentizace běží přes session cookie `kajovo_session` a CSRF cookie `kajovo_csrf` s hlavičkou `x-csrf-token`.
- Nová webová přihlášení portálu i administrace obnovují session pouze po uživatelské aktivitě přes CSRF chráněný `POST /api/auth/activity`. Po 48 hodinách bez aktivity session vyprší; běžné načítání dat dobu neprodlužuje. Skrytá karta nekontroluje vypršení relace. Portál po opětovném přihlášení vrátí uživatele na původní interní cestu. Starší session zůstanou platné do svého původního vypršení bez obnovování a nativní Android používá původní samostatný režim.
- Portál používá `cs`, `en` a `uk`, s preferencí uloženou u účtu přes `PATCH /api/auth/locale`. Přihlašovací stránka začíná vždy česky. Administrace zůstává česky. PDF exporty portálu používají jazyk účtu.
- RBAC kontrakt je sdílený mezi backendem a frontendy přes `packages/shared/src/rbac.ts`.
- Produkční compose stack používá `infra/compose.prod.yml` a host override `infra/compose.prod.hotel-hcasc.yml`.

## CI a deploy

- Změny se pushují přímo na `main`; nová PR jsou zakázaná. Hlavní CI workflow `.github/workflows/ci-gates.yml` má pouze `validate` a `api-runtime-image`; plán je v [CI gates](ci-gates.md).
- Produkční deploy workflow je `.github/workflows/deploy-production.yml` a spouští se jen po úspěšném CI na `main`.
- Deploy vytváří archiv `kajovo-deploy-<sha>.tar.gz`, nahrává jej na produkční server a ověřuje runtime artifact i živé smoke scénáře.
- Produkční server pro `hotel.hcasc.cz` se ověřuje proti IPv4 `89.221.222.92`.

## Povinné validace

- `pnpm ci:gates` / `python3.11 scripts/release_gate.py`: úplný plán bez přeskakování; jednotlivé příkazy definuje `check_plan()`.
- Produkční image a proxy ověřuje samostatný `api-runtime-image` job.
- Rozsáhlé smoke a vizuální sady se spouštějí podle změny modulu, Android zůstává samostatný.
- Live ověření deploye používá `scripts/verify_live_breakfast_overview.mjs`, `scripts/verify_live_housekeeping_rooms.mjs`, `scripts/verify_live_admin_login.mjs` a `scripts/verify_live_admin_users_smoke.mjs`.

- Správa místností a názvů KajaVoiceHA 2.1: [aktuální kontrakt](voice-registry.md), potvrzení pouze hlasem a read-only přehled v administraci.

- Dagmar používá nativní Realtime/WebRTC a přerušení řečí; při přehrávání nepozastavuje mikrofon. Volba reproduktorů a ruční přerušení byly v etapě B odstraněny, mute/Stop zůstávají. Celá Dagmar vlastní UI/server/paměť/journals/MCP klienty nad obecným Voice Core; hotel dodává auth a technickou infrastrukturu. Debug je výslovný, šifrovaný a oddělený od společné dlouhodobé paměti. Přesný stav nasazení a omezení akustické přejímky uvádí [protokol](dagmar/IMPLEMENTATION.md).
