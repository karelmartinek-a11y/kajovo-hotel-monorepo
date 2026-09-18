# Forenzní inventura uživatelského portálu a nativní Android aplikace

Datum ověření: 2026-09-18
Scope: veřejný/provozní portál bez `/admin`; aktivní runtime `apps/kajovo-hotel-web`, `packages/ui`, `packages/shared` a API kontrakt `apps/kajovo-hotel-api/openapi.json`.

## Metoda a zdroj pravdy

Inventura vznikla z aktivního routingu, React komponent, RBAC, OpenAPI, API implementace, testů a runtime ověření. Historické Android dokumenty byly použity pouze k dohledání odstraněné implementace; výsledný seznam je odvozen z aktuálního webu. Přiložené logo je vizuální podklad, nikoli instrukční dokument.

Aktivní uživatelské routy: `/login`, `/login/reset`, `/`, `/recepce`, `/profil`, `/pokojska`, `/snidane`, `/snidane/nova`, `/snidane/:id`, `/snidane/:id/edit`, `/ztraty-a-nalezy`, `/ztraty-a-nalezy/novy`, `/ztraty-a-nalezy/:id`, `/ztraty-a-nalezy/:id/edit`, `/zavady`, `/zavady/nova`, `/zavady/:id`, `/zavady/:id/edit`, `/sklad`, `/sklad/nova`, `/sklad/:id`, `/sklad/:id/edit`, `/hlaseni`, `/hlaseni/nove`, `/hlaseni/:id`, `/hlaseni/:id/edit`, `/intro`, `/offline`, `/maintenance` a `/404`.

## Forenzní soupis obrazovek, prvků a validací

| Plocha | Prvky a funkce | Validace, blokace a chybové stavy |
|---|---|---|
| Start / intro | systémový splash, kompletní logo KájovoHotel, kontrola nové verze, obnova session | update kontrola je best-effort; hash stažené APK musí souhlasit; bez session následuje login; síť/maintenance mají samostatný stav |
| Přihlášení | kompletní logo, uživatelské jméno, heslo, CTA Přihlásit, informační text o aktualizaci; veřejný web v mobilním layoutu nabízí stažení podepsané Android APK | obě pole povinná; tlačítko je do té doby neaktivní; serverové 401 se překládá do české chyby; cookies a CSRF se ukládají bezpečně; APK odkaz je na webu skrytý od šířky 768 px |
| Obnova hesla | token z app-linku, nové heslo, potvrzení, návrat na login | token povinný; nejméně 8 znaků; hesla se musí shodovat; po úspěchu nová autentizace |
| Volba role | seznam všech přiřazených rolí, potvrzení role | jedna role se volí automaticky; role musí patřit účtu; zápis používá CSRF; selhání neotevře modul |
| Nativní shell | top app bar, značka, název role, navigace dle role/oprávnění, Profil, Odhlásit | admin actor je odmítnut; nepovolený modul zobrazí access denied; po 401 se zahodí lokální session |
| Recepce | karty Ztráty a nálezy, Snídaně, Hlášení | zobrazení a zápis jsou řízené aktuální rolí a permissions |
| Pokoje | záložky Pokoje/Nález/Závada, datum ± den/Dnes, patra, karty pokojů, host, počet osob, pobytové a úklidové stavy, dialog změny | data pobytu patří vybranému dni; obsazenost a úklid jsou aktuální; zápis stavu je blokující; po ověřené odpovědi návrat na přehled; po neověřeném zápisu je povinné Obnovit stav |
| Pokojská – nález/závada | výběr pokoje, typ, popis, kamera, galerie, náhledy, odstranění fotky, lokální koncept, odeslání | role musí mít `issues:write`/`lost_found:write`; pokoj a popis povinné; popis max. 160 znaků; nejvýše 3 fotografie; odeslání a upload používají CSRF |
| Snídaně – denní přehled | datum, dnešní/denní souhrn, hosté, objednávky, osoby, stavy, pokoj, host, poznámka, diety, manager/service akce | počet hostů je kladný; pokoj, host a datum jsou povinné; stavy jen pending/preparing/served/cancelled; dieta je projekce rezervace a je editovatelná jen oprávněnou rolí |
| Snídaně – import/export | PDF picker, preview, potvrzení importu, manuální refresh s progressem, denní export, reaktivace, smazání dne/období | jen PDF; datum a rozsah povinné; `date_from <= date_to`; destruktivní akce vyžadují potvrzení; probíhající job blokuje opakované spuštění |
| Ztráty a nálezy | list, filtry typ/stav, detail, nový/upravit, kategorie, popis, místo, pokoj, čas, stav, tagy, claimant údaje, předání, fotografie, zpracování, smazání | popis/kategorie/místo/čas povinné; max. 3 fotky; validní enum typu/stavu; role a CSRF pro zápis; delete má potvrzení |
| Závady | list, filtry stav/priorita/pokoj, detail, timeline, nový/upravit, titul, místo, pokoj, popis, přiřazení, priorita, stav, fotografie, vyřešit/znovu otevřít/smazat | titul a místo povinné; priority low/medium/high/critical; status new/in_progress/resolved/closed; akce podle role; delete s potvrzením |
| Sklad | hledání/list, miniatura, stav/minimum, pohyb příjem/výdej/odpis, kusy/množství, datum dokladu, číslo dokladu, poznámka, detail a historie; oprávněná role má create/edit | položka povinná; množství celé a > 0; datum povinné; příjem vyžaduje číslo dokladu; výdej/odpis nesmí překročit stav; název povinný; hodnota/ks ≥ 1; minimum ≥ 0 |
| Hlášení | list, nový/upravit, název, stav, popis, detail, timestamps | zápis jen s `reports:write`; stav open/in_progress/closed; název je povinný na API; chybové, prázdné a loading stavy |
| Profil | e-mail a role read-only, jméno, příjmení, telefon, poznámka, uložit, změna hesla, odhlásit | jméno a příjmení povinné; telefon prázdný nebo E.164; změna hesla vyžaduje staré i nové heslo a serverovou password policy; po změně hesla nové přihlášení |
| Utility | offline, maintenance, 404, access denied, globální chyba, retry/back | stav musí odpovídat síťové/HTTP příčině; žádné chráněné akce nejsou dostupné bez role |

## Role a bezpečnostní kontrakt

- Aplikace používá stejné cookie-first session API jako web (`kajovo_session`, `kajovo_csrf`) a přidává `x-csrf-token` ke všem mutacím.
- Zobrazení modulů i zápisy kontrolují serverová permissions; klientský guard není autorizační hranice.
- Admin plocha není součástí nativní aplikace.
- Better Hotel tokeny nikdy nejsou v aplikaci; pokoje používají pouze serverové `/api/v1/housekeeping/rooms`.
- Fotky se odesílají multipartem, nejvýše tři v jednom uživatelském flow.

## Stav parity implementace

Aktuální kompaktní navigaci, kroky formulářů, kontrast a důkazy UI QA popisuje `docs/android-readability-2026-09-18.md`. Soupis datových polí a validací zůstává platný; textové průvodce nahrazují stručná hlášení.

Obnovený projekt v `android/` obsahuje nativní obrazovky login, reset, role, recepci, pokojskou, snídaně, ztráty a nálezy, závady, sklad, hlášení, profil a utility stavy. Aktuální pokojský room-status kontrakt byl doplněn nad živé API. Detailní seznamové/formulářové obrazovky jsou na Androidu řešeny nativním jednosměrným stavem místo kopírování webových URL.

## Matice dopadů

| Kategorie | Stav |
|---|---|
| Produkční zdroj | aktualizovat: samostatný nativní projekt `android/`; web/admin runtime se nemění |
| Testy | aktualizovat: Kotlin unit, lint, APK build a emulator QA; webové smoke testy ověřit beze změny |
| CI/gates | aktualizováno samostatným Android CI včetně kontroly integrity publikovaného APK; webový produkční deploy není Androidem blokován |
| Dokumentace | aktualizovat tímto auditem, Android README a návrhovým dokumentem |
| Komentáře/TODO | ověřit beze změny; nepřidávat paralelní historické instrukce |
| AGENTS/instrukce | aktualizovat architektonický fakt, ale zachovat oddělení web deploy gate |
| Fixtures/assets/texty | aktualizovat nové logo a návrhové assety; české runtime texty ověřit |
| Build/OpenAPI/deploy | aktualizováno: veřejný OpenAPI endpoint `/api/app/android-release`, generovaný klient, podepsané APK s původním produkčním certifikátem, SHA-256 manifest a samostatný podepisovací workflow |
