# ZIP_OUT_REPORT.md

## Shrnutí provedených oprav

Repozitář byl převzat ze ZIP archivu. V dodaném balíku nebyl adresář `.git`, proto nebylo možné ověřit branch, remote, status pracovního stromu ani poslední commity.

Provedené změny stabilizují prioritní auditní body: ukládání skladových pohybů, detail skladové položky, bezpečné vytvoření uživatele, neblokující branding, responzivní tabulky, role navigation accessibility a potvrzování destruktivních akcí.

## Hlavní dotčené soubory

- `apps/kajovo-hotel-api/app/api/routes/inventory.py`
- `apps/kajovo-hotel-api/app/api/routes/users.py`
- `apps/kajovo-hotel-api/app/api/schemas.py`
- `apps/kajovo-hotel-api/openapi.json`
- `apps/kajovo-hotel-api/tests/test_inventory.py`
- `apps/kajovo-hotel-api/tests/test_users.py`
- `apps/kajovo-hotel-api/tests/test_smtp_email_service.py`
- `apps/kajovo-hotel-admin/src/main.tsx`
- `apps/kajovo-hotel-web/src/main.tsx`
- `packages/shared/src/generated/client.ts`
- `packages/ui/src/components/DataTable.tsx`
- `packages/ui/src/components/RoleSwitcher.tsx`
- `packages/ui/src/tokens.css`

## Mapování auditních bodů na implementované změny

### K01 / skladové pohyby

- Backend nyní ukládá pohyb, změnu skladového množství a auditní záznam v jedné transakční jednotce s rollbackem při chybě.
- Příjem vyžaduje číslo dokladu, výdej a odpis odmítnou množství vyšší než aktuální stav.
- Chybové hlášky backendu pro skladové pohyby jsou uživatelsky česky.
- Admin i provozní UI mají klientskou validaci položky, typu pohybu, data, kladného celého množství a skladového limitu.
- Po uložení se aktualizuje lokální stav položky a zobrazí se česká úspěšná hláška s interním číslem pohybu.
- Testy pokrývají příjem, výdej, odpis, historii pohybů a změnu skladového množství.

### K02 / detail skladové položky

- Detail používá bezpečné načtení položky včetně vazeb na pohyby, položku a kartu.
- Validace modelu detailu už neprochází přes neúplně načtené vztahy.
- Technické chyby se logují interně; UI zobrazuje českou zprávu a návrat na seznam.
- U detailu je doplněn konkrétní nadpis s názvem skladové položky a bezpečné mazání pohybu s potvrzením následků.

### K04 / vytvoření uživatele

- `first_name`, `last_name`, `email` a `roles` jsou povinné v API schématu i OpenAPI kontraktu.
- Jméno a příjmení se ořezávají a prázdné hodnoty se odmítají.
- UI vytváření uživatele nezačíná s rolí Administrátor.
- Pokud je při vytváření zvolena role Administrátor, formulář vyžaduje samostatné vědomé potvrzení.
- Vytvoření uživatele zapisuje audit detail s ID, e-mailem, rolemi a příznakem administrátorské role.
- Testy byly upraveny a doplněny pro povinná jména a nové API schéma.

### K05, V01, V06, V07, N02 / překrývající logo, responzivita a přístupnost

- Dekorativní signace Kájovo už není fixně přilepená přes obsah a tlačítka; je umístěna jako neblokující prvek v toku layoutu.
- Mascot/dekorace se na menších šířkách skrývá.
- Mobilní formuláře přecházejí na jeden sloupec.
- Tabulky z komponenty `DataTable` nesou `data-label` pro buňky a na mobilu se mění na karty bez horizontálního scrollu.
- Role switcher má `role="group"` a tlačítka mají explicitní `aria-label`.
- Dotykové cíle a primární akce mají na menších breakpointech minimální výšku 44 px.

### V03 / V04 / destruktivní akce

- Mazání dne a období snídaní, mazání nálezu, mazání závady a mazání skladového pohybu mají potvrzení s českým popisem následků.
- Destruktivní tlačítka používají `danger` variantu a jsou vizuálně odlišena od běžných akcí.

### S08 / lokalizace a systémové hlášky

- Uživatelsky viditelné technické chyby detailu skladové položky jsou nahrazeny českým provozním textem.
- Role Administrátor je v administračním vytváření uživatelů česky.
- Kontrola na řetězce `Internal Server Error` a `Choose file` v upravených zdrojích nevrátila výskyt.

## Spuštěné příkazy a výsledek

- `python apps/kajovo-hotel-api/scripts/export_openapi.py` - OK, OpenAPI kontrakt regenerován.
- `HOTEL_ADMIN_EMAIL=<test> HOTEL_ADMIN_PASSWORD=<test> python -m pytest apps/kajovo-hotel-api/tests -q` - OK, 120 passed, 2 warnings.
- `python scripts/check_mojibake.py` - OK, PASS.
- `python scripts/check_frontend_manifest_guards.py` - OK, PASS.
- `node scripts/check_runtime_integrity.mjs` - OK, PASS.
- `node` + TypeScript `transpileModule` syntax kontrola pro upravené TS/TSX soubory - OK.
- `python -m compileall -q apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests` - OK.
- `corepack pnpm install --frozen-lockfile` - BLOCKER: v prostředí není dostupný `pnpm` a Corepack se pokusil stáhnout metadata z `registry.npmjs.org`, což selhalo na DNS `EAI_AGAIN`. Z tohoto důvodu nešlo spustit projektové `pnpm -r lint`, `pnpm typecheck` ani frontend build.

## Testy a build výsledek

Backendové testy API prošly celé. Frontend syntax kontrola upravených TS/TSX souborů prošla přes lokálně dostupný TypeScript. Plný lint, typecheck a build vyžadují pnpm závislosti; ty nebylo možné nainstalovat bez dostupného registru.

## Neodstraněné položky a blockery

- Chybějící `.git` metadata v dodaném ZIPu: nelze ověřit branch, remote, status ani poslední commity.
- Nedostupný `pnpm` / npm registry v sandboxu: nelze provést plnou instalaci závislostí, frontend lint/typecheck/build ani Playwright vizuální ověření breakpointů.
- Bez produkčního serveru, reálných secrets a externích služeb nelze ověřit SMTP/API integrace v reálném prostředí ani reálné nasazení na `hotel.hcasc.cz`.
