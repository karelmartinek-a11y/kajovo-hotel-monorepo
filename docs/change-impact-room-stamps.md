# Dopadová matice přehledu pokojů

| Kategorie | Rozhodnutí a rozsah |
|---|---|
| Produkční zdroj | Aktualizovat prioritu země na ubytované podle position → rezervující → firma. Doplnit serverem ověřené verzované potvrzení automatického požadavku psa/postýlky do existujícího reservation_amenities, zelenou ikonu po potvrzení, ISO alpha-3, výrazné siluety osob a větší adaptivní písmo sdílených dlaždic. Odstranit jména a firmu z přehledu včetně přístupného názvu, vysvětlivky a nepoužívané styly. Detail ukazuje všechny ubytované a firmu, bez rezervující osoby. Zachovat vnější geometrii a plné názvy zemí v detailu. |
| Testy | Aktualizovat API fallbacky a ISO kódy, webové a admin smoke scénáře; ověřit čitelnost a hranice obsahu na desktopu, tabletu a telefonu včetně 320 px a všech jazyků portálu. Ověřit potvrzení obou druhů, skutečné natížení, správný pokoj/pobyt, množství, konkurenci verzí, CSRF/RBAC, persistenci a obnovení při nejistém zápisu. Stávající stavové a rezervační scénáře zachovat. |
| GitHub a gates | Ověřit základní CI, deploy a překladovou kontrolu beze změny; aktualizovat produkční čtecí validátor pro ISO alpha-3. |
| Dokumentace a schémata | Aktualizovat module-pokoje, ui-workspaces a OpenAPI. |
| Komentáře a poznámky | Nahradit neplatnou prioritu země a popisy krátkých názvů, jmen a vysvětlivek; odstranit nepoužívanou mapu zkratek. |
| Aktivní instrukce | Aktualizovat AGENTS pro webový kontrakt; zachovat nativní režim Androidu. |
| Fixtures, snapshoty, texty | Aktualizovat země rezervací a vizuální důkazy. Odstranit nepoužívané webové překlady legendy a rezervující osoby; překlad vysvětlivek zachovat pro Android. Doplnit všechny tři jazyky pro potvrzování požadavků. Ověřit lokalizované přístupné názvy a detail; ISO kódy jsou společné všem jazykům. |
| Build a spotřebitelé | Regenerovat klienta, ověřit oba frontendové buildy a produkční API image. Android čte původní pole; nové projekce jsou aditivní a opce jsou opt-in. |

Databázová migrace není relevantní: nové údaje jsou projekcí Better Hotelu. Tabulka reservation_amenities ukládá rovněž potvrzení automatických webových požadavků; původní endpointy mají nadále nativního spotřebitele a neodstraňují se. Nový potvrzovací endpoint neumožňuje vytvořit požadavek bez odpovídajícího aktivního natížení.

API zachovává dvoupísmenné country_code pro nativní Locale; webová dlaždice používá aditivní country_code_alpha3. Android UI, release a závislosti se nemění. Písmo a velikost ikon se řídí dostupnou šířkou rezervační části; čtyři řádky, čtyři mobilní sloupce, výška dlaždic i navigace zůstávají pevné.
