# Kájovo Hotel – závazná pravidla práce

## Rozsah a zdroj pravdy

- Pracuj výhradně v aktuálním repozitáři `karelmartinek-a11y/kajovo-hotel-monorepo` a před každou změnou ověř branch, remote, `git status`, poslední commity a stav vůči vzdálenému repozitáři.
- Nejvyšším zdrojem pravdy je aktivní produkční zdrojový kód a skutečné runtime zapojení. Dokumentace, komentáře, audity, poznámky, prompty, SSOT a testy jsou odvozené artefakty; při rozporu se opravují podle ověřeného kódu a runtime.
- Aktivní části repozitáře zahrnují zejména `apps/kajovo-hotel-web`, `apps/kajovo-hotel-admin`, `apps/kajovo-hotel-api`, `packages/shared`, `packages/ui`, `apps/kajovo-hotel`, nativní projekt `android`, `brand`, `scripts`, `infra`, `.github` a aktuální dokumentaci v `docs`.
- Veřejný portál běží na `https://hotel.hcasc.cz`, administrační část na `https://hotel.hcasc.cz/admin` a API pod produkční doménou. Cílový server, nasazený commit a deploy mechanismus vždy znovu ověř podle DNS, aktivní GitHub Actions konfigurace, serverového runtime a deploy artefaktů.
- Pokojský modul `/pokojska` a `/admin/pokojska` čte a mění stavy pokojů výhradně serverovým proxy kontraktem `/api/v1/housekeeping/rooms`; Better Hotel tokeny nikdy nesmí přejít do frontendového runtime. Pobyty patří vybranému dni, obsazenost a úklid aktuálnímu okamžiku. Ikony psa/postýlky se trvale vážou na ID rezervace v `reservation_amenities`, nikoli pokoj; zápisy kontrolují aktivní roli, vazbu rezervace a monotónní verzi. Recepce/admin ikony spravují, pokojská pouze mění barvu.
- Android je samostatný plně nativní Kotlin/Jetpack Compose projekt v `android/` bez admin scope. Mobilní zaměstnanecký shell odpovídá webu: pevné 64dp záhlaví se značkou, volbou jazyka a odhlášením, pevné 72dp vodorovně posuvné zápatí s obrazovými moduly podle přístupu a s Profilem. Přepnutí modulu může interně vybrat potřebnou přiřazenou roli; samostatná obrazovka výběru role se nezobrazuje. Build, testy a release workflow zůstávají oddělené a nesmí blokovat produkční změny webu, adminu nebo API; při změně sdíleného API kontraktu se však významově ověří všichni skuteční Android spotřebitelé.
- Android UI se ověřuje také instrumentovanými testy kontrastu a přihlášení na emulátoru. Izolovaný debug balíček používá příponu `.debug`; HTTP je povolené pouze v debug manifestu. Povinná verze uložená z API zablokuje všechny nativní zaměstnanecké obrazovky i při nedostupném manifestu; aktivní povinný manifest odmítá starší OkHttp klienty kódem 426 a ponechá dostupnou kontrolu vydání. Podpisový workflow může připravit kandidátní verzi, veřejný release manifest se však mění až současně s ověřeným podepsaným APK.
- Správa uživatelů odděluje seznam od tříkrokového editoru. Přehled pokojů má pevně vysoké kompaktní dlaždice, na mobilu drženém na výšku nejméně čtyři v řádku. Dlaždice odlišuje aktuální obsazenost od pobytů vybraného dne; její výběr otevře spodní detail se všemi údaji a změnou úklidu. Horní ovládání dne drží při posuvu přehledu pozici. Běžný svislý posuv je přípustný. Volba stavu otevře blokující průběh zápisu a po ověřené odpovědi automaticky vrátí přehled bez potvrzovacího tlačítka; neověřený zápis vyžaduje obnovu stavu před opakováním.
- Karty pokojů s příjezdem či odjezdem mají odjezd vlevo (červený před CHECK-OUT, šedý po něm) a příjezd/úklid vpravo. Bez těchto událostí je celá karta šedá při neuklizení, zelená při úplném úklidu volného pokoje, světle zelená při úklidu pokračujícího pobytu a fialová při nerušence pokračujícího pobytu. Text obsazenosti zůstává aktuální. Diety snídaní patří rezervaci v `reservation_breakfast_diets`, platí od dne po příjezdu do odjezdu včetně a denní příznaky jsou jejich OR projekce. Zápisy přes rezervační endpoint ověřují Better Hotel vazbu, aktivní roli a verzi; číslo pokoje není identita pobytu.
- Webové session portálu a administrace vyprší po 48 hodinách bez skutečné aktivity zařízení; periodické čtení dat je neobnovuje a kontrola relace neběží na skryté kartě. Po vypršení relace portál uchová cílovou interní cestu přes přihlášení. Android používá svůj samostatný režim. Portál nabízí češtinu, angličtinu a ukrajinštinu; jazyk se ukládá u uživatelského účtu, administrace zůstává česky.
- Přihlášený portál i administrace používají sdílený `AppShell` a pevnou spodní navigaci v jedné vodorovně posuvné řadě na telefonu, tabletu i desktopu. Chat je první položka s nepřečteným počtem, následují pouze moduly dostupné podle role a nakonec Profil. Portál zachovává rychlé akce nálezu a závady; přepnutí pohledu jiné přiřazené role používá serverový výběr role. Vícerolový účet automaticky získá výchozí přiřazený modul a další pohledy volí v zápatí bez mezilehlé obrazovky výběru role. Záhlaví zůstává pro značku, jazyk a odhlášení. Chat je soukromý textový 1:1 modul ve webovém portálu, administraci a zaměstnaneckém Android klientu; historie zůstává čitelná i po deaktivaci nebo smazání účtu, který z nabídky nových příjemců zmizí. Čtení se potvrzuje až po otevření konverzace. Web Push používá serverem konfigurované VAPID klíče mimo repozitář a odhlašovací tok odebírá registraci. Nativní FCM registrace a oznámení mají samostatný release kontrakt a nesmí do oznámení vkládat text zprávy.
- Sdílený přehled pokojů používá jednu mřížku v pořadí 101–109, 203–208, 301–310, 221–224, 321–324, 201–202, 209–210 s prokládáním uvedeným v `docs/module-pokoje.md`; další pokoje následují číselně. Uživatelský pohled pokojské má jen obrazové zápatí portálu, které otevírá i rychlý nález a závadu. Administrační pohled si zachovává vlastní přepínač.
- Poznámka pro pokojskou pochází z `reservation_note[].housekeep` v Better Hotel API. Snídaňový přehled ji všem rolím ukazuje pouze ke čtení; pokoj s neprázdnou poznámkou má červené upozornění a text v detailu. Snídaně se synchronizují v pravidelném intervalu, otevřený přehled se obnovuje každou minutu a při návratu do okna. Datumová navigace uživatelského snídaňového přehledu zůstává připnutá pod záhlavím; vybraný den přežije obnovení stránky v rámci karty a každá změna dne načte odpovídající seznam i souhrn. PDF import a ruční spuštění synchronizace nemají aktivní endpoint ani ovládání.
- Mobilní snídaňový přehled `/snidane` zobrazuje pouze pokoje se zakoupenou snídaní v číselném pořadí a používá plnošířkové dlaždice. Firma, délka pobytu a věkové skupiny vycházejí z Better Hotel údajů pro konkrétní den služby; věk se počítá podle data narození pouze u strávníků. Android čte stejné `reservations` z existujícího API kontraktu; vydání je povolené pouze pro čekající nebo připravované položky. Denní metadata se ukládají s `breakfast_orders`, diety zůstávají v `reservation_breakfast_diets` a Better Hotel tokeny zůstávají pouze v API.
- Secrets, hesla, tokeny, klíče a citlivá produkční data nikdy necommituj ani nevypisuj do reportu.

## Povinný forenzní průzkum před změnou

- Nezačínej implementovat podle názvu souboru nebo dokumentace. Najdi všechny relevantní routy, komponenty, endpointy, služby, datové modely, migrace, sdílené typy, generované klienty, konfigurace, feature flagy, testy, workflow, dokumentaci, komentáře a spotřebitele změněného kontraktu.
- U více implementací určuj aktivní variantu podle importů, registrace, routingu, buildu, runtime provozu, produkčních logů a skutečného uživatelského scénáře.
- Před změnou sdílené komponenty nebo rozhraní vyhledej všechny producenty a spotřebitele. Před změnou API ověř autentizaci, autorizaci, CSRF/session režim, chybové stavy, OpenAPI kontrakt a generovaný klient. Veřejné POST výjimky z CSRF omez na endpointy bez změny relace nebo chráněných dat; aktuálními výjimkami jsou přihlášení, reset hesla ověřený tokenem a obecná žádost o reset hesla s jednotnou odpovědí a omezením opakování.
- Před odstraněním kódu technicky dolož jeho nepoužívanost. Absence dokumentace nebo testu není důkaz nepoužívanosti.
- Zachovej existující architekturu, design systém, RBAC, datové kontrakty, lokalizaci, build a produkční kompatibilitu. Nepoužívej mocky, placeholdery, demo řešení, dočasné obchvaty ani kompromisní redukci scope.

## Atomická synchronizace každé změny

Každá změna, i sebemenší, je dokončena pouze jako jeden atomický celek. Před implementací vytvoř matici dopadů a pro každou kategorii stanov `aktualizovat`, `odstranit`, `ověřit beze změny` nebo `nerelevantní s technickým odůvodněním`:

1. produkční zdrojový kód;
2. jednotkové, integrační, komponentové, smoke, E2E, vizuální a další relevantní testy;
3. GitHub Actions, required checks, validační skripty a release/deploy gates;
4. README, current-state dokumentace, SSOT, manifesty, schémata, diagramy a runbooky;
5. komentáře, docstringy, TODO, FIXME a vývojářské nebo provozní poznámky;
6. kořenový i případný lokální `AGENTS.md` a jiné aktivní instrukční soubory;
7. fixtures, snapshoty, testovací data, příklady, selektory, překlady a uživatelské texty;
8. build, generátory, OpenAPI, generovaný klient, CI/CD, deploy konfigurace a produkční validační scénáře.

- Přidané chování explicitně doplň do všech relevantních testů a aktuálních popisných artefaktů.
- Odstraněné chování explicitně odstraň z kódu, testů, GitHub kontrol, dokumentace, komentářů, poznámek, příkladů, fixtures, snapshotů, selektorů, manifestů a instrukcí.
- Změněné chování nahraď přesným aktuálním kontraktem; staré očekávání nesmí zůstat vedle nového.
- Při změně architektury, struktury repozitáře, dlouhodobého kontraktu, povinného postupu, testovací strategie, buildu, deploye nebo bezpečnostního pravidla aktualizuj `AGENTS.md` ve stejném commitu.
- Po změně proveď celorepozitářové vyhledání názvů, aliasů, rout, endpointů, parametrů, stavů, textů a selektorů dotčené funkce. Každý výskyt významově posuď.
- Dokumentaci a komentáře aktualizuj podle skutečného kódu, ale nevytvářej redundantní komentáře pouze formálně. Popisuj jen aktuální stav, nikoliv genezi změny.
- Commit nesmí obsahovat pouze změnu kódu, pokud změněný kontrakt vyžaduje úpravu některého odvozeného artefaktu.

## Technologický a validační rámec

- Monorepo používá `pnpm` a workspaces `apps/*` a `packages/*`; aktuální verzi package manageru ověř v kořenovém `package.json`.
- Web a admin jsou React/Vite/TypeScript aplikace. API je FastAPI/Python 3.11. Sdílený API klient se generuje z OpenAPI kontraktu do `packages/shared`.
- API runtime závislosti synchronizuj také s explicitním seznamem v `apps/kajovo-hotel-api/Dockerfile`. CI job `api-runtime-image` musí ověřit import aplikace ve skutečně sestaveném produkčním image před nasazením.
- Používej skutečné projektové příkazy. Minimálně podle dopadu proveď čistou instalaci, typecheck, lint, testy, build a kontraktové kontroly. Relevantní kořenové příkazy zahrnují `pnpm typecheck`, `pnpm unit`, `pnpm contract:check`, `pnpm ci:gates` a `python scripts/release_gate.py`; přesný rozsah vždy ověř v aktuálních manifestech a workflow.
- Ověř samostatný build dotčených frontendů, API testy, Playwright smoke/E2E a vizuální kontroly, pokud se změna týká UI. Každá uživatelsky viditelná změna se ověřuje na desktopu, tabletu i mobilu.
- Administrátorské vizuální Playwright scénáře běží postupně (`workers: 1`), protože každá přihlášená obrazovka současně načítá několik API modulů a paralelní prohlížeče vyčerpávaly pool testovací databáze. Rozsah viewportů a scénářů se nemění. Admin smoke spouští API přes Python 3.11 také lokálně.
- Ověř, že build nebo generování nezanechá neočekávané změny sledovaných souborů a že OpenAPI i generovaný klient jsou aktuální.
- GitHub CI v `.github/workflows/ci-gates.yml` musí chránit stejný aktuální kontrakt jako lokální testy. Produkční deploy v `.github/workflows/deploy-production.yml` smí navazovat pouze na úspěšné CI nad správným SHA.
- Produkční SSH deploy před uploadem čistí pouze nedokončené release archivy, staré zdrojové stromy kromě nejnovějšího a nepoužívanou Docker build/image cache; běžící image ani pojmenované databázové a mediální volumes se nemažou.
- Produkční Nginx musí obsloužit HTTP ACME challenge bez předčasného HTTPS redirectu, používat aktivní Certbot lineage `hotel.hcasc.cz-renewed` a deploy musí vyžadovat platnost certifikátu delší než 30 dní bez rozšíření sudo oprávnění deploy uživatele.
- Selhání testu, buildu, CI, commitu, pushe, deploye nebo produkční validace analyzuj, oprav a celý dotčený řetězec zopakuj. Zastav se pouze na doloženém blockeru chybějícího oprávnění, tajného údaje, externí služby nebo rozhodnutí vlastníka.

## Main-only CI

- Nová PR jsou zakázaná (`has_pull_requests=false`). Změny commituj a pushuj přímo na `main`; nevytvářej feature větve ani PR. Pokud main používá jiný worktree, pracuj nad přesným `origin/main` v detached checkoutu a pushuj `HEAD:main` bez přepisování historie.
- Ostatní větve mají zakázané creation/update; main je chráněný proti deletion/non_fast_forward. Lokální kontroly jsou před pushem, GitHub status checks po pushi blokují deploy.
- Jediné základní CI má jobs `validate` a `api-runtime-image`. `pnpm ci:gates` je úplný plán `scripts/release_gate.py` bez přeskočení. Browser baseline má dva skutečné API toky na desktopu/tabletu/telefonu, `workers: 1`, bez retry/mock rout. Podrobné existující smoke/visual sady jsou povinné podle dopadu změny, ne jako duplicitní běh každého commitu.
- Docker runtime/proxy, přenositelnost Voice Core a Android oddělení zůstávají povinné. Placené provider volání do běžného CI nepatří. Deploy přijímá pouze úspěšný push CI nad stále aktuálním main SHA.

## Commit, deploy a produkční ověření

- Před commitem zkontroluj celý diff soubor po souboru a ověř, že nezmizela nesouvisející funkce.
- Po úspěšných kontrolách vytvoř věcný commit, pushni jej na správnou větev a ověř GitHub Actions pro konkrétní commit SHA.
- Dohledni skutečný deploy, nasazený commit, runtime artefakt, stav služeb a relevantní logy na produkčním serveru.
- Produkční validace musí ověřit skutečné chování na `https://hotel.hcasc.cz` a/nebo `https://hotel.hcasc.cz/admin`, nikoliv jen HTTP dostupnost. Podle dopadu otestuj přihlášení, RBAC, datový tok, změnu stavu, persistenci, chybové stavy a mobilní/tabletové/desktopové zobrazení.
- Na konci stručně uveď změněné, vytvořené a odstraněné soubory, uzavřenou matici dopadů, testy a jejich výsledky, commit, push, CI, deploy, nasazené SHA a konkrétní produkční scénáře. Nevydávej zamýšlenou činnost za provedenou.

## Voice Core boundary

- Voice Core is a portable product in `packages/voice-core` and `packages/voice-core-server`; application auth, database, secrets and navigation adapters belong in the host apps. Portable production code must not import host packages or business entities.
- Voice Core v1 has an empty capability registry, no tools and no action executor. Sessions use server-built fixed instructions and `tool_choice: none`.
- Hotel-owned Voice Memory Manager uses the same server-side dispatcher for assistant_memory, independently of MCP. Stable authenticated principals, strict operation validation, transactional idempotence/revisions, bounded retrieval and transient completed-turn curation belong only in the API. Never persist raw transcripts/audio or log memory/tool contents. Context is untrusted data, never policy. See docs/voice-memory.md; validate SQLite migration, real PostgreSQL image and real-API responsive memory CRUD. Generic connection readiness must remain independent of technology/memory availability.
- Hotel-only Smart technologie uses the API-owned Realtime sideband and the single `smart_technologie` function through `https://apimcpkajavoiceha.hcasc.cz/mcp`. The portable default remains tool-free; generic browser lifecycle ports may observe backend-managed functions but never execute them. MCP credentials remain backend-only; SSH deploy preserves backend environment values with umask 077 and .env permissions 0600. MCP v2 always receives backend-owned api_version:2 and session_id. The full catalog stays on MCP; the model receives a compact overview, paginated search/describe/read and session-isolated selections with global rows and all eight original fields for returned details. Accepted means “Pokyn byl odeslán”, never physical execution; no automatic read follows control. Acknowledged provider events, durable control and output-delivery identities, original-request status recovery and bounded image history are mandatory. MCP outage disables technologies while ordinary conversation continues. Lease heartbeats do not extend the authenticated web session.
- OpenAI API keys use AES-256-GCM with a separate server environment master key; never reuse SMTP encryption or capture voice request bodies, audio, transcripts or provider secrets in audit/log artifacts.
- Voice validation includes `pnpm ci:voice-core`, isolated copy-out, responsive UI and the actual production API image. Paid smoke calls require `VOICE_CORE_LIVE_SMOKE=1` and never run in ordinary CI.
