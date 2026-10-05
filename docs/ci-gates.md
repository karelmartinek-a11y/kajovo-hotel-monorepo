# Základní CI podle SSOT

Změny se commitují a pushují přímo na `main`. GitHub má `has_pull_requests=false`; nové PR jsou zakázané. Ostatní větve nepřijímají nové commity ani vytvoření. `main` nesmí být smazán ani přepsán force pushem. Povinné status checks před pushem nejsou nastavené: nový commit se testuje po pushi, neúspěch zastaví deploy.

Jediné automatické web/API workflow je `.github/workflows/ci-gates.yml` (`CI Gates - Kajovo Hotel`), pouze pro push na main nebo ruční běh na main. Běží dvě kontroly:

| Job | Co dokládá |
|---|---|
| `validate` | TypeScript/Python lint, API a portable unit/integrační testy, izolovaný Voice Core copy-out, OpenAPI/klient, build obou frontendů, brand/token/text/překladové kontroly a základní browser scénáře. |
| `api-runtime-image` | Skutečný produkční Docker build API/admin/web, import runtime závislostí a Nginx proxy řetězec. |

Lokální ekvivalent `validate` je `pnpm ci:gates` nebo `python3.11 scripts/release_gate.py`. Runner nemá přepínače vynechávající povinné kontroly. Python lint používá explicitní konfiguraci `apps/kajovo-hotel-api/pyproject.toml` a pravidla `E,F` pro chyby syntaxe a problematický kód. Abecední pořadí importů není release podmínka; lokální a GitHub pravidla jsou stejná. Každá chyba nebo chybějící příkaz znamená FAIL; JSON obsahuje SHA, příkazy, návratové kódy a časy. Izolovaný copy-out záměrně testuje balíčky podruhé v jiném hostiteli, protože dokládá přenositelnost.

## Browser základ

`pnpm ci:baseline` spustí šest testů: dva skutečné uživatelské toky na desktopu 1440×900, tabletu 834×1112 a telefonu 390×844, postupně s `workers: 1`, bez retry a bez zachytávání API přes mock routy.

- Admin se přihlásí formulářem, zobrazí nového uživatele, uloží změnu jména a po reloadu ověří změnu v UI i API; účet uklidí.
- Zaměstnanec se přihlásí do portálu, vidí navigaci své role bez mezikroku, nemá přístup ke správě uživatelů, CSRF odmítne nechráněný zápis; pošle zprávu a ověří její přežití reloadu, poté se odhlásí.
- Oba toky ověřují viditelnou značku, nulový vodorovný overflow a pevné spodní zápatí; screenshoty jsou artefakty; trace přihlašovacího toku je vypnutý, aby neukládal přihlašovací údaje.
- Portable Voice UI se navíc ověřuje v Chromium/WebKit přes `test:ui`.

Přihlašovací údaje CI pocházejí z GitHub Secrets/Variables; lokálně platí testovací konfigurace. Testy pracují s izolovanou testovací databází. Běžné CI nepoužívá živé Better Hotel ani placené OpenAI volání.

## Cílené regresní ověření

`pnpm ci:web-smoke`, `pnpm ci:e2e-smoke` a `pnpm ci:visual` zůstávají pro změny příslušných modulů. Rozsáhlé současné scénáře včetně testovacích API odpovědí jsou regresní/UI důkaz, nikoliv důkaz živého Better Hotel. Kontroly `ci:policy`, `ci:policy-test` a `ci:legacy-guards` zůstávají dostupné jako diagnostika; nejsou součástí základního release gate. Android má vlastní path-filtered workflow, build, lint, unit i emulátorové testy; neblokuje web/API deploy. Při změně sdíleného API se ověří také dotčení Android spotřebitelé.

## Deploy a meze důkazu

Deploy navazuje pouze na úspěšný push CI na main se stejným SHA. Před nasazením kontroluje, že ověřené SHA stále odpovídá aktuálnímu main; ruční CI ani starší úspěšný commit nový deploy nespustí. Produkční environment approval zůstává samostatnou podmínkou. Deploy ověřuje serverový runtime artefakt, přihlášení, správu uživatelů, snídaně a pokojský přehled.

Zelené CI dokládá uvedené scénáře, nikoliv úplnou funkčnost produkce. Skutečné MCP/OpenAI, fyzický mikrofon, Bluetooth, živý Better Hotel a nativní vydání vyžadují vlastní autorizované ověření. Placené hlasové volání vyžaduje `VOICE_CORE_LIVE_SMOKE=1` a v běžném CI je zakázané.

## Úplná mapa workflow

| Workflow | Spuštění a účel |
|---|---|
| `ci-gates.yml` | Push main / ruční main; jediný základní gate pro web/API. |
| `deploy-production.yml` | Úspěšné push CI main; produkční deploy a live ověření. |
| `android-ci.yml` | Push main při změně Android/release souborů nebo ručně; samostatný nativní build a emulátor. |
| `android-signed-artifact.yml` | Ruční podepsaný kandidátní APK; veřejný manifest se nemění. |
| `android-production-acceptance.yml` | Ruční skutečné nativní ověření s vlastním souhlasem pro produkční změny. |
| `live-production-e2e.yml` | Ruční prohlížečové ověření živých snídaní. |
| `live-admin-settings-check.yml` | Ruční ověření nastavení a volitelný SMTP test. |
| `preview.yml` | Ruční build a export frontendů pro náhled. |

Historické `CI Core`, `CI Full` a `CI Release` nemají samostatný aktuální kontrakt; jejich povinné validační vrstvy zajišťuje jediný plán, proto jsou jejich workflow odstraněná. Staré běhy v GitHub historii zůstávají důkazem minulého stavu.

The validate plan includes voice-memory-ui (real API, desktop/tablet/phone, no transcript traces). api-runtime-image additionally verifies voice memory migrations and transactions against PostgreSQL 16.4 with scripts/verify_voice_memory_postgres.py. Existing jobs and deploy dependencies are unchanged.

Voice-registry-ui ověřuje read-only návrh přes skutečné HTTP/auth/DB na desktopu/tabletu/telefonu s izolovaným provider portem. API testy zahrnují hlasové potvrzení a obnovu; PostgreSQL runtime kontrola ověřuje také migraci 0043 a transakční rezervaci registry zápisu. Placená registry přejímka běží samostatně mimo CI.

Voice lifecycle replaces diagnostics UI validation. Historical archive E/M/B/J
reader runs offline in the release plan; AAC recorder/load gates are removed with
the runtime recorder. Whole Dagmar copy-out cleans inherited Python module paths
before installation and uses the same FastAPI 0.115.14 as the production image for
canonical OpenAPI. API and Dagmar manifests pin this existing runtime version;
this is not a runtime dependency upgrade.
