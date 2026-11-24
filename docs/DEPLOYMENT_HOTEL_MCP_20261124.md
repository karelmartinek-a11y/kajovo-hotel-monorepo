# Přejímka Hotel MCP, 24. 11. 2026

## Čtení snídaní a ztrát a nálezů

- Zdroj nasazeného API `f6ff69fcf7ddea8ba7c34e90b83d85856ef4194c`, otisk obrazu `sha256:d9cb7f5c6353864ef2fe52349a96f63040fca991cd5c5907bf89f1b055dd9b74`, databázová revize `0055_hotel_mcp_oauth`. Před migrací byla ověřena záloha. Porovnání snímků před a po nasazení ověřilo identitu webového a správcovského kontejneru a kontejneru PostgreSQL. [GitHub CI](https://github.com/karelmartinek-a11y/kajovo-hotel-monorepo/actions/runs/45432484318)
- Oficiální klient přes `https://hotel.hcasc.cz/mcp` a protokol `2025-11-25` ověřil OAuth, katalogy, odmítnutí nástroje z neschváleného modulu, přehled snídaní, seznam a detail nálezů. Přihlášené soubory PDF a fotografie prošly také izolovanou kontrolou původních bajtů.
- ChatGPT připojil soukromý plugin přes dynamickou registraci klienta a potvrzení v CML. V čtecím profilu skutečně použil `breakfast_day_get` pro 24. 11. 2026 a `lost_found_list`. Obě operace vrátily jednu položku při limitu 1. Následný `breakfast_daily_export` předal odkaz, přes který Chrome v přihlášeném CML úspěšně stáhl denní PDF. [Plugin](https://chatgpt.com/plugins/plugin_asdk_app_6b060db411048191a8194b7994a39c91) · [Zkušební chat](https://chatgpt.com/local/6b060def-e038-83ed-9e45-95dc62420055)

| Čtecí profil | Nástrojů | Definice v B | Odhad tokenů |
| --- | ---: | ---: | ---: |
| Snídaně | 3 | 4 261 | 1 110 |
| Ztráty a nálezy | 3 | 4 955 | 1 329 |
| Oba moduly | 6 | 9 215 | 2 437 |
| Instrukce | | 129 | 36 |

Odhady používají `o200k_base`. ChatGPT v ověřovacím chatu počet vstupních
tokenů nezobrazil. Při přejímce nebyla měněna žádná provozní data.

## Zápisy snídaní a ztrát a nálezů

- Produkční zdroj zápisů `38757e9511fe4ca247c71fa29681fc7a9755dc0f`
  prošel 403 API testy, úplnou lokální sadou a GitHub kontrolou obrazu
  a kontraktu. [GitHub CI](https://github.com/karelmartinek-a11y/kajovo-hotel-monorepo/actions/runs/45501993931)
- Oprava registrace pro ChatGPT `6c0ccc97c71bff8cbb6bea448b5daede0ea234e2`
  běží v obrazu `sha256:8d79513529d5e349d372305ab8439c394aeffee5e78b0097ec6d8308bf799156`.
  Lokální a GitHub sada prošly. Veřejný SDK ověřil registraci bez uvedeného
  rozsahu, výslovnou autorizační žádost pro každý zápisový profil a následné
  použití nástrojů podle schválených rozsahů. [GitHub CI](https://github.com/karelmartinek-a11y/kajovo-hotel-monorepo/actions/runs/45504506475)
- Zkoušky zápisů, verzí, hromadného výběru, přílohy a účtenky proběhly
  na izolovaných datech. Přejímka v produkci používala čtení a dotaz na
  neexistující účtenku. Výměna API zachovala stav chráněných kontejnerů a Nginxu.

| Profil s povolenými zápisy | Nástrojů | Definice v B | Odhad tokenů |
| --- | ---: | ---: | ---: |
| Snídaně | 10 | 13 179 | 3 432 |
| Ztráty a nálezy | 8 | 13 575 | 3 614 |
| Oba moduly | 17 | 25 742 | 6 784 |

## Pokoje, závady a sklady, 25. 11. 2026

- Produkční API používá zdroj `36496b57fce42843936ad3075b006b251ad668a0`
  v obrazu `sha256:c383587040e74cc220e589d116dcf2126bb6851ca7857577415f42b051bf8b6e`.
  Prošlo 407 API testů, úplná lokální sada a GitHub CI. Změna nevyžadovala
  databázovou migraci. Ověřené snímky potvrzují shodu Nginxu a kontejnerů
  webu, administrace a PostgreSQL před a po výměně API.
  [GitHub CI](https://github.com/karelmartinek-a11y/kajovo-hotel-monorepo/actions/runs/45506857047)
- Přes veřejný OAuth a SDK prošlo čtení pokojů, závad i obou skladů,
  čtecí a zápisové katalogy a odmítnutí přístupu k druhému skladu. Oba
  sklady v okamžiku zkoušky vrátily prázdnou stránku, shodnou s počtem
  položek v jejich databázích. Dočasné registrace a granty byly odstraněny.
- V izolaci prošly nativní zápisy, přílohy, storno skladových dokladů
  a opakování objednávky vajec pomocí náhradního Mailu. Živá zkouška
  neposílala objednávku. Čtecí připojení Snídaní a Ztrát a nálezů prošlo
  v ChatGPT výše. Ověření nového zápisového připojení a dalších modulů
  v ChatGPT přerušilo zamknutí Macu.

| Modul | Čtecí nástroje | Odhad tokenů | Nástroje se zápisem | Odhad tokenů |
| --- | ---: | ---: | ---: | ---: |
| Pokoje a úklid | 2 | 2 263 | 6 | 3 755 |
| Závady | 3 | 1 106 | 8 | 3 057 |
| Sklad Snídaně | 9 | 3 016 | 21 | 7 267 |
| Sklad Drogerie | 9 | 3 016 | 18 | 6 560 |

Instrukce aktuálního katalogu mají 150 B a odhad 41 tokenů. U původních
Snídaní a Ztrát a nálezů velikosti nástrojů zůstaly shodné s tabulkami výše.
