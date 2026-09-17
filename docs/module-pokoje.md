# Modul Pokoje

## Uživatelský tok

Pohled `Pokoje` je samostatná výchozí volba na stránce `/pokojska` a paralelně na `/admin/pokojska`, vedle rychlých zápisů `Nález` a `Závada`. Výchozí den je aktuální hotelový den v `Europe/Prague`; obsluha může přejít na předchozí nebo následující den či zvolit datum.

Pokoje jsou seskupené po patrech a karta ukazuje:

- plánovaný check-out, skutečný check-out a stav úklidu;
- dnešní nájezd;
- obsazenost nebo volný pokoj;
- provozní označení rezervace a počet osob, jsou-li k dispozici;
- aktuální Better Hotel stav úklidu.

Rezervační stav odpovídá vybranému dni. Endpoint Better Hotel poskytuje pouze aktuální stav úklidu, proto je tato vlastnost v API explicitně označena `housekeeping_status_is_current=true` a frontend ji uživateli vysvětluje.

## API portálu

- `GET /api/v1/housekeeping/rooms?date=YYYY-MM-DD` sestaví přehled z aktuálního inventáře, příjezdů, odjezdů, skutečných check-outů a pobytů Better Hotel.
- `PATCH /api/v1/housekeeping/rooms/{room_id}?date=YYYY-MM-DD` změní stav pokoje a vrátí znovu ověřený detail ve zvoleném denním kontextu.

Povolené hodnoty zápisu jsou:

- `clean` → `Uklizeno pro nájezd`;
- `dirty` → `Neuklizeno`;
- `stay_no_linen` → `Pobyt-bez ložního prádla`;
- `stay_with_linen` → `Uklizeno - s ložním prádlem`;
- `do_not_disturb` → `Nerušenka`;
- `technical_issue` → `Technický problém`.

Backend před každým zápisem vyhledá cílový stav přesnou shodou v živém číselníku `/room-status`; UUID stavů nejsou pevně zakódovaná. Před změnou ověří aktuální pokoj a stejný stav vrátí bez zápisu, aby nevytvářel vedlejší záznam v historii. Skutečná změna používá `PATCH /room-current-status/{room_id}`, `return_detail=true`, po úspěchu znovu načte kompletní stav a ověří tentýž pokoj i stav. Timeout nebo nejednoznačný číselník se nezkouší slepě opakovat.

## Přístup a bezpečnost

Better Hotel volání probíhají pouze z API serveru. Používají stejné `BETTER_HOTEL_ACCESS_TOKEN` a `BETTER_HOTEL_CLIENT_TOKEN` jako synchronizace snídaní; tokeny se neposílají do prohlížeče ani do odpovědí.

Role `admin` a `pokojská` mají `housekeeping:read` i `housekeeping:write`. Ostatní role nemají k endpointům přístup. Zápis zároveň podléhá session, CSRF a standardnímu audit middleware.

## Validace

- API kombinace a zápis: `apps/kajovo-hotel-api/tests/test_housekeeping.py`;
- RBAC GET/PATCH: `apps/kajovo-hotel-api/tests/test_rbac.py`;
- portálová interakce: `apps/kajovo-hotel-web/tests/live-smoke.spec.ts`;
- administrační interakce: `apps/kajovo-hotel-admin/tests/e2e-smoke.spec.ts`;
- responzivní vizuální kontroly: existující visual suites obou frontendů;
- produkční čtecí gate: `scripts/verify_live_housekeeping_rooms.mjs`.
