# Kájovo Hotel – závazná pravidla práce

## Rozsah a zdroj pravdy

- Pracuj výhradně v aktuálním repozitáři `karelmartinek-a11y/kajovo-hotel-monorepo` a před každou změnou ověř branch, remote, `git status`, poslední commity a stav vůči vzdálenému repozitáři.
- Nejvyšším zdrojem pravdy je aktivní produkční zdrojový kód a skutečné runtime zapojení. Dokumentace, komentáře, audity, poznámky, prompty, SSOT a testy jsou odvozené artefakty; při rozporu se opravují podle ověřeného kódu a runtime.
- Aktivní části repozitáře zahrnují zejména `apps/kajovo-hotel-web`, `apps/kajovo-hotel-admin`, `apps/kajovo-hotel-api`, `packages/shared`, `packages/ui`, `apps/kajovo-hotel`, `brand`, `scripts`, `infra`, `.github` a aktuální dokumentaci v `docs`.
- Veřejný portál běží na `https://hotel.hcasc.cz`, administrační část na `https://hotel.hcasc.cz/admin` a API pod produkční doménou. Cílový server, nasazený commit a deploy mechanismus vždy znovu ověř podle DNS, aktivní GitHub Actions konfigurace, serverového runtime a deploy artefaktů.
- Android není součástí tohoto repozitáře, jeho release gate ani produkčního webového deploye. Androidí zdroje, testy nebo parity kontroly nesmí blokovat změny webu, adminu nebo API.
- Secrets, hesla, tokeny, klíče a citlivá produkční data nikdy necommituj ani nevypisuj do reportu.

## Povinný forenzní průzkum před změnou

- Nezačínej implementovat podle názvu souboru nebo dokumentace. Najdi všechny relevantní routy, komponenty, endpointy, služby, datové modely, migrace, sdílené typy, generované klienty, konfigurace, feature flagy, testy, workflow, dokumentaci, komentáře a spotřebitele změněného kontraktu.
- U více implementací určuj aktivní variantu podle importů, registrace, routingu, buildu, runtime provozu, produkčních logů a skutečného uživatelského scénáře.
- Před změnou sdílené komponenty nebo rozhraní vyhledej všechny producenty a spotřebitele. Před změnou API ověř autentizaci, autorizaci, CSRF/session režim, chybové stavy, OpenAPI kontrakt a generovaný klient.
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
- Používej skutečné projektové příkazy. Minimálně podle dopadu proveď čistou instalaci, typecheck, lint, testy, build a kontraktové kontroly. Relevantní kořenové příkazy zahrnují `pnpm typecheck`, `pnpm unit`, `pnpm contract:check`, `pnpm ci:gates` a `python scripts/release_gate.py`; přesný rozsah vždy ověř v aktuálních manifestech a workflow.
- Ověř samostatný build dotčených frontendů, API testy, Playwright smoke/E2E a vizuální kontroly, pokud se změna týká UI. Každá uživatelsky viditelná změna se ověřuje na desktopu, tabletu i mobilu.
- Ověř, že build nebo generování nezanechá neočekávané změny sledovaných souborů a že OpenAPI i generovaný klient jsou aktuální.
- GitHub CI v `.github/workflows/ci-gates.yml` musí chránit stejný aktuální kontrakt jako lokální testy. Produkční deploy v `.github/workflows/deploy-production.yml` smí navazovat pouze na úspěšné CI nad správným SHA.
- Selhání testu, buildu, CI, commitu, pushe, deploye nebo produkční validace analyzuj, oprav a celý dotčený řetězec zopakuj. Zastav se pouze na doloženém blockeru chybějícího oprávnění, tajného údaje, externí služby nebo rozhodnutí vlastníka.

## Commit, deploy a produkční ověření

- Před commitem zkontroluj celý diff soubor po souboru a ověř, že nezmizela nesouvisející funkce.
- Po úspěšných kontrolách vytvoř věcný commit, pushni jej na správnou větev a ověř GitHub Actions pro konkrétní commit SHA.
- Dohledni skutečný deploy, nasazený commit, runtime artefakt, stav služeb a relevantní logy na produkčním serveru.
- Produkční validace musí ověřit skutečné chování na `https://hotel.hcasc.cz` a/nebo `https://hotel.hcasc.cz/admin`, nikoliv jen HTTP dostupnost. Podle dopadu otestuj přihlášení, RBAC, datový tok, změnu stavu, persistenci, chybové stavy a mobilní/tabletové/desktopové zobrazení.
- Na konci stručně uveď změněné, vytvořené a odstraněné soubory, uzavřenou matici dopadů, testy a jejich výsledky, commit, push, CI, deploy, nasazené SHA a konkrétní produkční scénáře. Nevydávej zamýšlenou činnost za provedenou.
