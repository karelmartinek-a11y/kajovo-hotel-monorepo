# Dopad změny snídaňových dlaždic

| Kategorie | Stav | Ověření a dopad |
| --- | --- | --- |
| 1. Produkční zdrojový kód | Aktualizovat | Portálová karta zobrazuje firmu, hosty, lokalizovaný stát, aktivní diety, noci, výdej a věkové počty; synchronizace doplňuje denní metadata přes ověřená Better Hotel pole `company` a `guest.birth_date`. |
| 2. Testy | Aktualizovat | Testy pokrývají hranice věku, chybějící datum narození, uložení a obohacení API řádku, obnovu data a rozměry karty na 360, 390 a 430 px. |
| 3. CI a deploy gates | Aktualizovat | Stávající CI workflow zůstává beze změny; živý snídaňový ověřovací skript kontroluje také nová pole rezervace. |
| 4. Dokumentace a SSOT | Aktualizovat | Aktuální chování a migrace jsou popsané v `docs/module-snidane.md`. |
| 5. Komentáře a poznámky | Ověřit beze změny | Nebyl nalezen komentář nebo TODO s konfliktním očekáváním mobilní snídaňové karty. |
| 6. Instrukční soubory | Aktualizovat | `AGENTS.md` doplňuje denní metadata a podobu mobilního pohledu. |
| 7. Fixture, překlady a selektory | Aktualizovat | Webový smoke fixture poskytuje metadata rezervace; nové popisky jsou přeloženy do angličtiny a ukrajinštiny. Recepční Android spotřebitel denního přehledu ani jeho kontraktu nebyl nalezen. |
| 8. Build, kontrakt a produkční validace | Aktualizovat | Přidána migrace `0035`, OpenAPI schéma a generovaný klient; build a produkční kontrola ověřují nové pole. |

Metadata firmy, věkových skupin a pobytu se uchovávají po dnech služby spolu s `breakfast_orders`. Do databáze se neukládá datum narození hosta. Chybějící datum narození je zobrazeno v samostatném součtu „Věk neuveden“, aby součet skupin odpovídal počtu strávníků.
