# Portál: jazyk, přihlášení a barvy pokojů

## Matice dopadů před změnou

| Kategorie | Rozhodnutí | Technický důvod |
| --- | --- | --- |
| Produkční kód | aktualizovat | Pokojské karty, obě webová přihlášení, API session, účetní preference, překlady a PDF. |
| Testy | aktualizovat | Časové hranice session, barvy pokojů, jazykové scénáře, PDF a všechny tři šířky. |
| CI, required checks a release gates | aktualizovat | Kontrola úplnosti překladů a runtime závislost PDF musí být v CI. |
| Dokumentace, SSOT, schémata a runbooky | aktualizovat | Session a jazyk jsou trvalé kontrakty. |
| Komentáře a poznámky | aktualizovat podle výskytů | Odstranit staré popisy délky session a významu barev, bez redundantních komentářů. |
| AGENTS.md a aktivní instrukce | aktualizovat | Mění se dlouhodobý kontrakt webového přihlášení a lokalizace. |
| Fixtures, snapshoty, selektory, překlady | aktualizovat | Nové jazykové varianty a odstíny pokojů mění viditelné stavy. |
| Build, OpenAPI, klient, CI/CD a produkční scénáře | aktualizovat a ověřit | Nové auth rozhraní, migrace a PDF runtime musí projít produkčním image a deployem. |

## Obrazový a textový audit

Sada `apps/kajovo-hotel-web/tests/visual.spec.ts` vytváří 560 snímků a stejný počet souborů s viditelným textem. Pokrývá vstup, obnovu hesla, pomocné a chybové obrazovky, všech pět rolí, dostupné seznamy a zakládací formuláře, profil, osm šířek včetně desktopu, tabletu a mobilu a varianty `cs`, `en`, `uk`. Pracuje pouze se syntetickými testovacími účty. Interakce, detaily záznamů, dialogy a barevné stavy pokojů ověřuje navazující Playwright smoke sada, která navíc pořizuje 40 snímků. Lokalizaci stavu PDF testují API testy a kontrola vykreslené stránky.

Překladový katalog `packages/shared/src/i18n/portal-translations.json` má 505 českých zdrojových výrazů s anglickým a ukrajinským významovým překladem. CI kontroluje používané klíče a shodu proměnných v interpolacích. Z textových záznamů anglického a ukrajinského UI nebyly nalezeny zbytky českých provozních textů; české názvy jazyků a značka Kájovo zůstávají jako vlastní jména.

## Terminologie

| Česky | English | Українська |
| --- | --- | --- |
| Recepce | Front desk | Рецепція |
| Pokojská | Housekeeping | Покоївка |
| Pokoj | Room | Номер |
| Snídaně | Breakfast | Сніданок |
| Ztráty a nálezy | Lost property | Бюро знахідок |
| Závada | Maintenance issue | Несправність |
| Sklad | Inventory | Склад |
| Hlášení | Reports | Звіти |
| Uklizeno | Clean | Прибрано |
| Průběžný úklid | Stayover cleaning | Поточне прибирання |
| Příjezd | Arrival | Заїзд |
| Odjezd | Departure | Виїзд |

Volba jazyka na přihlašovací stránce platí pouze pro aktuální zobrazení. Po přihlášení se použije jazyk uložený u účtu; nový účet má češtinu. Admin zůstává česky.
