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
