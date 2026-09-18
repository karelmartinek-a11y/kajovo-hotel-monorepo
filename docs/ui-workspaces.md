# Pracovní obrazovky uživatelů a pokojů

## Aktivní implementace

Administrace registruje `/admin/uzivatele` v `apps/kajovo-hotel-admin/src/main.tsx` a importuje `UsersAdmin.tsx` ze stejného adresáře. Starší komponenta pod `apps/kajovo-hotel-web/src/admin` není implementací této administrační routy. Pokojské přehledy `/pokojska` a `/admin/pokojska` používají `packages/ui/src/components/HousekeepingRooms.tsx`. Oba vstupní body importují `packages/ui/src/workspace.css` po základním design systému. Původní wordmark, autorizace i datové kontrakty zůstávají zachovány.

## Soupis uživatelů a vazby na backend

Všechny níže uvedené endpointy mají prefix `/api/v1/users`, registraci v `app/api/routes/users.py`, schémata v `app/api/schemas.py` a vyžadují administrátora. Zápisy používají session a CSRF cookie/header. UI používá generované typy `PortalUserRead` a `PortalUserCreate` z `packages/shared`.

| Prvek / akce | Data a backend | Validace a návaznost |
|---|---|---|
| Seznam, počet, jméno, e-mail, role | GET kolekce, `PortalUser`, `PortalUserRole` | Načítání, prázdný seznam, chyba a opakování; vyhledávání lokálně podle jména, e-mailu a českých rolí bez diakritiky. |
| Poslední přihlášení | `last_login_at` | České datum/čas nebo „Dosud nepřihlášen“. |
| Aktivita, blokace | `is_active`, `is_locked`, `portal_locked_until`, `admin_locked_until`, `AuthLockoutState` | Samostatné zobrazení povolení přístupu a blokací obou přihlášení. |
| Nový / Upravit | POST kolekce / PATCH `/{id}` | Samostatná obrazovka se třemi kroky; seznam není zobrazen pod editorem. Úspěch vrací seznam, chyba ponechá koncept. |
| Jméno, příjmení | `first_name`, `last_name` | Povinné, nejvýše 120 znaků, ořezání okolních mezer. |
| E-mail | `email` | Povinný, nejvýše 255 znaků, normalizace malými písmeny; server kontroluje formát a unikátnost, 409 se zobrazí bez ztráty formuláře. |
| Role | `roles` | Alespoň jedna ze skutečných rolí admin, pokojská, údržba, recepce, snídaně, sklad. Aliasové hodnoty se normalizují. Nový administrátor vyžaduje vědomé potvrzení v UI; posledního aktivního admina chrání server. |
| Telefon | `phone` | Volitelný E.164, `+` a 2–15 číslic; bez předvolby se při opuštění pole doplní +420, prefix 00 se změní na +. |
| Poznámka | `note` | Volitelná, nejvýše 4 000 znaků, čítač délky. |
| Dočasné heslo při založení | `password` | Volitelné, 8–255 znaků po ořezání; bez něj server generuje náhodné heslo. Onboarding e-mail není podmínkou úspěchu CRUD. |
| Povolit / Zakázat přístup | PATCH `/{id}/active` | Server chrání posledního aktivního admina a ruší příslušné sessions. Rozepsané údaje zůstávají zachovány. |
| Odblokovat účet | POST `/{id}/unlock` | Jen při blokaci; server odstraní blokace a vrátí aktuální účet. |
| Resetovací odkaz | POST `/{id}/password/reset-link` | Jen neadministrátorský účet; modal odlišuje probíhající odeslání, potvrzení a SMTP chybu. |
| Smazat | DELETE `/{id}` | Potvrzovací dialog s e-mailem; server chrání vlastní účet a posledního aktivního admina. Chyba zůstává v dialogu, úspěch vrací seznam. |
| Zpět / Zrušit | Bez zápisu | Neuložené změny vyžadují potvrzení; obnovení/zavření stránky a odkazy mají ochranu opuštění. |

Při probíhajícím požadavku se blokuje opakovaný zápis. Frontendová kontrola nenahrazuje autorizaci ani validační pravidla API. Editor i tabulka na úzkých obrazovkách používají běžný svislý tok; dlouhé texty se zalamují, neodřezávají.

## Soupis pokojů a vazby

Úplný datový a barevný kontrakt je v [Modulu Pokoje](module-pokoje.md). Backend tvoří `app/api/routes/housekeeping.py`, služba `app/services/housekeeping.py`, schémata a tabulka `reservation_amenities`; klientem je sdílený UI přehled v obou aplikacích.

| Prvek / akce | Vazba a pravidla |
|---|---|
| Datum, předchozí/následující den, Dnes | GET `/api/v1/housekeeping/rooms?date=…`; výchozí hotelový den Europe/Prague, ochrana před přepsáním novějšího dne starou odpovědí. |
| Vysvětlivky barev | Rozbalitelné, bez zápisu; popisují odjezd, připravenost příjezdu, pokračující pobyt a prázdnou polovinu. |
| Patro a počty | Seskupení skutečného inventáře a počet pokojů k úklidu z provozního stavu. |
| Karta pokoje | ID/číslo pokoje, aktuální obsazenost a úklid; odjezdy/příjezdy/pokračující rezervace, označení, osoby, země, noc pobytu, pes a postýlka. Žádné vymyšlené typy pokojů. |
| Šest stavových tlačítek | PATCH `/api/v1/housekeeping/rooms/{room_id}?date=…`; přesné hodnoty a mapování číselníku jsou v modulu Pokoje. |
| Probíhající zápis | Nativní modální dialog „Zapisuji změnu…“, bez zavření a bez potvrzovacích tlačítek. Po ověřené odpovědi automatický návrat k přehledu, lokální aktualizace karty a obnova dat na pozadí. |
| Chyba zápisu | Nesmí být vydávána za úspěch; dialog zůstává, další zápis je zablokován do obnovení aktuálního stavu. Bez slepého opakování PATCH. |
| Pobyty a ikony | Samostatná pracovní obrazovka; admin/recepce spravují ikony, pokojská pouze mění barvu. Endpointy rezervace kontrolují ID rezervace, pokoj, den a monotónní verzi. |
| Nález / Závada | Zachované existující formuláře nadřazené pokojské routy; mobilní přehled má spodní navigaci. |
| Obnova | 60 sekund ve viditelném okně, návrat do okna a po zápisu. Better Hotel tokeny zůstávají výhradně na serveru. |

## Responzivní kontrakt a ověření

Schválená varianta 3 používá bílé pracovní plochy, střídmou červenou primární akci, oddělený seznam/editor a samostatné úlohy. Mobil na výšku má jednu plně čitelnou kartu v řádku; mobil na šířku nejméně dvě, tablet dvě a desktop tři. Všech 37 pokojů s libovolně dlouhými údaji nelze čitelně zobrazit na jediné malé obrazovce; seznam proto používá svislé posouvání, nikoli vodorovné panely nebo zmenšené nečitelné texty. Na mobilu a tabletu do šířky 1023 px má přehled vlastní zbývající plochu displeje a spodní navigace samostatný řádek mimo ni: nesmí překrývat karty. Posouvá se jediná obsahová plocha. Stavový dialog používá na výšku 2 × 3 a na nízké obrazovce na šířku 3 × 2 tlačítka.

Admin smoke testy kontrolují skutečné CRUD API, zachování konceptu, chybu duplicity, validační kroky, probíhající zápis bez tlačítek, automatický návrat, chybu PATCH a obnovu. Responzivní scénář se 37 pokoji a dlouhou zemí/jménem kontroluje 1440 × 900, 834 × 1112, 390 × 844, 844 × 390 a 667 × 375; kontroluje šířku dokumentu a celý stavový dialog bez vnitřního posuvu. Portálový smoke ověřuje tentýž sdílený tok a role ikon.

## Matice dopadů

| Kategorie | Rozhodnutí |
|---|---|
| Produkční kód | Aktualizovat aktivní UsersAdmin, sdílený HousekeepingRooms, TaskDialog, exporty a scoped CSS obou frontendů. API beze změny. |
| Testy | Aktualizovat admin a portálový smoke, přidat responzivní a chybové scénáře; stávající API a vizuální sady ověřit beze změny. |
| CI a gates | Aktualizovat přesný povolený vyhledávací placeholder v guardu po extrakci komponenty. Workflow ověřit beze změny: spouští obě dotčené smoke sady, vizuální a release gate. |
| Dokumentace | Aktualizovat tento inventář, module-pokoje a index dokumentace. Datová schémata beze změny. |
| Komentáře a poznámky | Odstranit starou inline implementaci uživatelů a její výhradní pomocníky; dokumentovat dev obsluhu původního loga. |
| Instrukce | Aktualizovat AGENTS o rozložení a dokončení zápisu. Ostatní pravidla beze změny. |
| Fixtures a texty | Aktualizovat modalové selektory, české stavy a testovací data dlouhých pobytů; produkční mocky nejsou použity. |
| Build a kontrakty | Ověřit oba buildy, OpenAPI a generovaný klient beze změny. Admin Vite dev obsluhuje původní root brand assets stejně jako produkce; deploy konfigurace beze změny. |
