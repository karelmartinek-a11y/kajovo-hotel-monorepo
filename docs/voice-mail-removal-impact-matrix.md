# Odstranění pošty z Dagmar

| Kategorie | Rozhodnutí | Rozsah |
|---|---|---|
| Produkční kód | odstranit / aktualizovat | Mail host, MCP klient, katalog, intent, potvrzení, reconnect, konfigurace a UI. Paměť a Smart technologie zůstávají. |
| Testy | odstranit / aktualizovat | Mailové scénáře odstranit; ověřit absenci nástrojů, instrukcí, rout a panelu a zachování paměti/registru. |
| CI a gates | aktualizovat | Mailový gate odstranit, absenci zapojení ověřují API/UI testy. |
| Dokumentace a manifesty | odstranit / aktualizovat | Aktivní mailové návody, matice a znalosti odstranit; historické neměnné evidence nejsou runtime instrukce. |
| Komentáře a poznámky | odstranit / aktualizovat | Mailové přípravy a kontext odstranit, obecná ochrana původu nástrojových dat zůstává. |
| AGENTS | aktualizovat | Dagmar poskytuje pouze paměť a Smart technologie. |
| Fixtures, snapshoty, texty | odstranit / aktualizovat | Mailové hosty, Playwright scénáře a texty panelu odstranit. |
| Build, schémata, klient, deploy | aktualizovat | Regenerovat OpenAPI a klienty; odebrat env připojení i uložené přihlašovací proměnné při deployi. Migrace odstraní pouze mailové operační tabulky. |

Samostatná služba pošty, hotelové SMTP pro účty a offline diagnostický archiv nejsou součástí hlasového chatu. Starší Alembic revize zůstávají pouze jako nutný migrační řetězec, nikoliv aktivní implementace.

Kontrola výskytů: v aktivní implementaci Dagmar nejsou mailové názvy, endpoint, instrukce, katalog ani stav. Zbývající názvy identifikují odstranění v migracích, záporných testech, deploy filtru a této matici; historické evidence jsou výslovně neaktivní. Android nepoužívá administrační hlasové endpointy, proto odstranění tohoto kontraktu jeho klienty nemění.
