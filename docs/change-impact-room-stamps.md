# Dopadová matice přehledu pokojů

| Kategorie | Rozhodnutí a rozsah |
|---|---|
| Produkční zdroj | Aktualizovat API projekci rezervací, sdílené dlaždice a detail. Odstranit webovou ruční správu ikon. |
| Testy | Aktualizovat API, webové smoke a vizuální scénáře; ověřit osm stavů a obě nezávislé rezervace. |
| GitHub a gates | Ověřit základní CI a deploy beze změny; aktualizovat produkční čtecí validátor a překladovou kontrolu. |
| Dokumentace a schémata | Aktualizovat module-pokoje, ui-workspaces a OpenAPI. |
| Komentáře a poznámky | Odstranit neplatné popisy půlení barev a webové ruční správy. |
| Aktivní instrukce | Aktualizovat AGENTS pro webový kontrakt; zachovat nativní režim Androidu. |
| Fixtures, snapshoty, texty | Aktualizovat barevná očekávání, data rezervací, selektory a české, anglické a ukrajinské texty. |
| Build a spotřebitelé | Regenerovat klienta, ověřit oba frontendové buildy a produkční API image. Android čte původní pole; nové projekce jsou aditivní a opce jsou opt-in. |

Databázová migrace není relevantní: nové údaje jsou projekcí Better Hotelu. Tabulka reservation_amenities a její endpointy mají nadále nativního spotřebitele a neodstraňují se.
