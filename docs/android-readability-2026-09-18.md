# Android: čitelnost a kompaktní obrazovky

## Matice dopadů

| Oblast | Rozhodnutí |
| --- | --- |
| Produkční kód | Aktualizovat společnou typografii, kontrast, shell a obrazovky Androidu. |
| Testy | Aktualizovat: instrumentované kontroly čitelnosti, přihlášení, klávesnice a snímky obrazovek; ověřit jednotkové testy a lint. |
| CI a release gates | Aktualizovat: instrumentované testy API 35 a kandidátní verze v podpisovém workflow; oddělení webových gates zachováno. |
| Dokumentace a manifesty | Aktualizovat návrhová pravidla, README a release manifest. |
| Komentáře a poznámky | Ověřit dle změněného kódu, odstranit neaktuální popisy obrazovek. |
| AGENTS.md | Aktualizovat pravidla izolovaného QA a atomické publikace; zachovat nesouvisející uživatelskou rozpracovanou změnu. |
| Texty a data | Aktualizovat stručné uživatelské texty; zachovat validace a datové kontrakty. |
| Build, API, deploy | Aktualizovat podepsané APK a jeho metadata; API/OpenAPI beze změny, ověřit existující aktualizační tok. |

## Výchozí zjištění

- Přihlášení zobrazovalo velké logo a několik vysvětlujících karet před formulářem. Chybová zpráva byla až za tlačítkem a dalšími odstavci.
- Proměnný font neměl explicitní nastavení osy hmotnosti a v emulátoru se vykresloval velmi tenkým řezem.
- Kořen tématu neposkytoval společný Surface a bezpečné systémové okraje veřejným obrazovkám.
- Shell rezervoval další prostor pro spodní tlačítko Zpět a copyright; profil duplikoval tlačítka změny hesla a odhlášení.
- Řada modulů obsahovala opakované nadpisy a vysvětlování implementace místo pracovních údajů.

## Cílový kontrakt

- Přihlášení, výběr role, hlavní menu a krátké formuláře se vejdou do běžného mobilního okna. Chyba přihlášení je přímo nad tlačítkem, oznámená čtečce a po odeslání se zavře klávesnice.
- Dlouhé seznamy, skutečně dlouhé záznamy, velké systémové písmo a velmi nízké okno mohou používat svislý posuv, aby nebyly údaje ani ovládání oříznuté.
- Kontrast běžného textu nejméně 4,5:1, čitelné řezy písma, stručná provozní hlášení.
- Zachovat kompletní logo na intru a přihlášení, oprávnění, validace a podpisovou kontinuitu aktualizací.

## Provedené kontroly zdroje

- `:app:assembleDebug`, `:app:assembleDebugAndroidTest`, `testDebugUnitTest`, `lintDebug`: PASS. Jednotkové testy: 63 testů v 18 sadách, bez chyb.
- Instrumentované `ReadabilityTest`: 7 testů PASS na API 35. Kontrast obou témat, chyba přihlášení v okně 320 × 480 dp, odeslání klávesnicí, menu sekcí/profilu, rozbalovací filtry, vykreslení utility/reset obrazovek a pravdivé zobrazení diet na úzké obrazovce.
- Skutečné nativní UI nad lokálním FastAPI a izolovanou SQLite databází: všech pět rolí, seznam/detail/editor hlášení, nálezy po třech krocích, snídaně, závady po dvou krocích, sklad včetně úspěšného založení nové položky, profil a pokojský formulář. Běžné okno a malý telefon 360 × 640 dp.
- Opravena závodní podmínka skladu: pozdní načtení detailu nesmí změnit vytvoření na editaci. Dva regresní jednotkové testy.
- Následná kontrola detailu snídaně na 360 × 640 dp odhalila zalamování diet po písmenech. Detail používá kompaktní řádky a zalamovací skupinu pouze skutečně aktivních diet; bez diet se zobrazí „Bez diet“.
- Karta skladu otevírá detail přímo klepnutím na název. Položky bez fotografie nevkládají do každého řádku velké náhradní logo; značka zůstává v pevném záhlaví.
- Druh skladového pohybu má explicitní vizuální i přístupnostní stav výběru (Příjem/Výdej/Odpis), nikoli tři nerozlišitelná tlačítka.
- Skutečný API zápis ověřil, že příjem vyžaduje číslo dokladu. Android tuto validaci provádí již před odesláním a ukazuje chybějící údaj; výdej a odpis zachovávají volitelný doklad. Pokrývají dva nové jednotkové testy.
- API/OpenAPI, CSRF, RBAC a produkční webové zdroje se touto UI změnou nemění. Rozsáhlé úvodní karty, duplicity ovládání a komentáře k implementaci byly odstraněny, nikoli datová pole.
- Testovací databáze nemá Better Hotel přihlašovací údaje: živý seznam pokojů a externí synchronizace v tomto prostředí nejsou ověřené. Zachycena skutečná chybová obrazovka a formulář nového zápisu. Produkční zápisy do pokojů se při QA neprovádějí.

## Publikace

Podepsaný kandidát se připravuje odděleně. Veřejné APK a manifest zůstávají do dokončení jeho kontroly na vydané verzi; nová verze bude publikována atomicky až po ověření hashe, verze a původního podpisu.
