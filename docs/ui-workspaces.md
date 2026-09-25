# Pracovní obrazovky uživatelů a pokojů

## Aktivní implementace

Administrace registruje `/admin/uzivatele` v `apps/kajovo-hotel-admin/src/main.tsx` a importuje `UsersAdmin.tsx` ze stejného adresáře. Starší komponenta pod `apps/kajovo-hotel-web/src/admin` není implementací této administrační routy. Pokojské přehledy `/pokojska` a `/admin/pokojska` používají `packages/ui/src/components/HousekeepingRooms.tsx`. Oba vstupní body importují `packages/ui/src/workspace.css` po základním design systému. Vizuální systém Eclipse Adaptive používá nový orbitální znak a wordmark; autorizace i datové kontrakty zůstávají zachovány.

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
| Vysvětlivky barev | Rozbalitelné, bez zápisu; popisují odjezd, úklid nezávislý na příjezdu, pokračující pobyt a prázdnou polovinu. |
| Pořadí pokojů | Jedna mřížka ve stanoveném provozním pořadí; další pokoje z živého inventáře následují číselně. |
| Dlaždice a spodní detail pokoje | Pevná velikost dlaždic, číslo pokoje, výslovná aktuální obsazenost s počtem osob, stručný náhled odjezdů/příjezdů/pokračování vybraného dne a úklid. Spodní detail ukazuje úplné údaje rezervací včetně osob, země, noci pobytu, poznámky pro pokojskou, psa a postýlky. Neprázdná poznámka rozbliká červenou ikonu na dlaždici. Žádné vymyšlené typy pokojů. |
| Šest stavových tlačítek | PATCH `/api/v1/housekeeping/rooms/{room_id}?date=…`; přesné hodnoty a mapování číselníku jsou v modulu Pokoje. |
| Probíhající zápis | Nativní modální dialog „Zapisuji změnu…“, bez zavření a bez potvrzovacích tlačítek. Po ověřené odpovědi automatický návrat k přehledu, lokální aktualizace karty a obnova dat na pozadí. |
| Chyba zápisu | Nesmí být vydávána za úspěch; dialog zůstává, další zápis je zablokován do obnovení aktuálního stavu. Bez slepého opakování PATCH. |
| Pobyty a ikony | Samostatná pracovní obrazovka; admin/recepce spravují ikony, pokojská pouze mění barvu. Endpointy rezervace kontrolují ID rezervace, pokoj, den a monotónní verzi. |
| Nález / Závada | Pokojská otevírá stávající rychlé formuláře přes obrazové zápatí portálu na `/pokojska?view=lost_found` a `/pokojska?view=issue`. Administrační pohled si ponechává vlastní přepínač. |
| Obnova | 60 sekund ve viditelném okně, návrat do okna a po zápisu. Better Hotel tokeny zůstávají výhradně na serveru. |

## Responzivní kontrakt a ověření

Varianta „Eclipse Adaptive“ používá paletu Space Black `#000000`, Orange `#FF6A2E`, Ivory `#F7F4ED` a Silver `#C0C0C0`. Uživatelský portál má na mobilu, tabletu i desktopu pevnou spodní lištu s čtvercovými tužkovými piktogramy a viditelnými názvy všech dostupných pohledů. Mobilní záhlaví má výšku 64 px, spodní lišta 72 px plus systémový bezpečný okraj; každý odkaz má nejméně 68 px na šířku a při nedostatku místa se lišta posouvá vodorovně. Sklad i hlášení mají vlastní odkazy v zápatí. Přepnutí do sekce jiné role provádí serverový výběr role. Mobilní záhlaví obsahuje logo, tři vlajky volby jazyka a ikonu odhlášení. Administrace používá vlastní navigaci. Oddělený seznam/editor a samostatné úlohy zůstávají zachovány. Přehled pokojů má pevně vysoké kompaktní dlaždice; na mobilu drženém na výšku jsou čtyři v řádku. Dlaždice současně ukazuje číslo, aktuální obsazenost, zkrácený náhled pobytů vybraného dne a úklid. Úplné údaje o pobytech a volba stavu jsou ve spodním detailu otevřeném výběrem dlaždice. Ovládání dne zůstává při svislém posuvu přehledu nahoře. Na mobilu a tabletu do šířky 1023 px má přehled vlastní zbývající plochu displeje a spodní navigace samostatný řádek mimo ni. Detail má vnitřní svislý posuv pro dlouhé údaje a po ověřeném zápisu se automaticky zavře.

Admin smoke testy kontrolují skutečné CRUD API, zachování konceptu, chybu duplicity, validační kroky, probíhající zápis bez tlačítek, automatický návrat, chybu PATCH a obnovu. Responzivní scénář se 37 určenými pokoji a jedním dalším kontroluje 1440 × 900, 834 × 1112, 390 × 844, 320 × 700, 844 × 390 a 667 × 375; kontroluje pořadí, čtyři stejně velké dlaždice v portrétu, šířku dokumentu a spodní detail ve výšce displeje. Portálový smoke ověřuje totéž pořadí, rychlé formuláře v jediném zápatí a role ikon.

## Matice dopadů

| Kategorie | Rozhodnutí |
|---|---|
| Produkční kód | Sdílený přehled řadí jednu mřížku; portál otevírá rychlé formuláře z obrazového zápatí. API a databáze zůstávají beze změny. |
| Testy | Portálový i administrační smoke kontrolují pořadí a responzivní mřížku; portálový smoke navíc kontroluje obrazové zápatí a rychlé zápisy. |
| CI a gates | Ověřit beze změny: workflow již spouští obě dotčené smoke sady, vizuální testy a release gate. |
| Dokumentace | Aktuální inventář a přesné pořadí jsou zde a v modulu Pokoje; datová schémata jsou beze změny. |
| Komentáře a poznámky | Popis starého seskupení podle pater byl odstraněn; ostatní poznámky zůstávají platné. |
| Instrukce | Kořenový AGENTS stanoví pořadí a jediné portálové zápatí. |
| Fixtures a texty | Testovací inventář obsahuje všech 37 určených pokojů i další pokoj; existující obrázky a lokalizované názvy se používají v zápatí. |
| Build a kontrakty | Ověřit oba buildy, OpenAPI a generovaný klient beze změny; CI a deploy konfiguraci ověřit beze změny. |
