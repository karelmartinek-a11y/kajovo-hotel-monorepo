# Modul Pokoje

## Uživatelský tok

Pohled `Pokoje` je samostatná výchozí volba na stránce `/pokojska` a paralelně na `/admin/pokojska`, vedle rychlých zápisů `Nález` a `Závada`. Je dostupný pokojské, recepci i administrátorovi přes sdílenou komponentu. Výchozí den je aktuální hotelový den v `Europe/Prague`; obsluha může přejít na předchozí nebo následující den či zvolit datum.

Pokoje jsou seskupené po patrech a karta ukazuje:

- odjíždějící pobyty vlevo a přijíždějící vpravo, s prázdnou opačnou částí při jediné události;
- pokračující pobyt přes celou šířku;
- provozní označení rezervace, počet osob a název země bydliště hlavního hosta v jazyce portálu;
- samostatné ikony psa a postýlky u každé rezervace;
- aktuální Better Hotel stav úklidu.
- pod zemí údaj `Noc pobytu: X/Y`: rozdíl vybraného dne a příjezdu / rozdíl odjezdu a příjezdu v kalendářních dnech; příjezd je 0, odjezd Y. Výpočet v UTC nad daty nemění přechod letního času.

Pobyty odpovídají vybranému dni; obsazenost a úklid aktuálnímu okamžiku. API uvádí `occupancy_date`, `housekeeping_status_is_current=true`, `housekeeping_status_key` a `ready_for_arrival`. Země se čte z adresy hlavního hosta v expandovaném `guest_list.guest.address` podle `main_guest`; API předá kód země pro jazykově správné zobrazení. Pokud chybí, zobrazuje se lokalizované „Stát neuveden“.

Levá odjezdová polovina je před CHECK-OUT červená, po něm šedá. Pravá polovina je zelená při stavu `clean` bez ohledu na příjezd, světle zelená při `stay_no_linen` nebo `stay_with_linen`; jinak při plánovaném příjezdu červená a bez příjezdu prázdná. Bez události a bez uklizení zůstává karta neutrální. Text aktuální obsazenosti má samostatný kontrastní podklad přes celou kartu.

Priorita aktuální obsazenosti:

1. Dnešní příjezd s CHECK-IN bez CHECK-OUT: **OBSAZENO-PŘIJEL**.
2. Dnešní odjezd bez CHECK-OUT: **OBSAZENO-ODJÍŽDÍ**.
3. Pokračující pobyt s CHECK-IN bez CHECK-OUT: **OBSAZENO-POBYT**.
4. Jinak **VOLNO**. Samotný plánovaný příjezd pokoj neobsazuje.

Přehled se obnovuje po zápisu, každých 60 sekund ve viditelném okně a ihned při návratu do okna, probuzení telefonu či návratu z jiné aplikace (`focus`, `visibilitychange`, `pageshow`). Obnova zachovává vybraný den; na pozadí se periodické dotazy neposílají. Starší odpověď nesmí přepsat novější datum. Ikony mají kontrastní podklad a kromě barvy rozlišují čekání a dokončení také symbolem.

## Příznaky rezervací

Stav pokoje se volí v kompaktním dialogu. Během zápisu se zobrazuje blokující „Zapisuji změnu…“ bez tlačítek; ověřená odpověď automaticky vrací přehled a obnoví data. Neověřená změna ponechá dialog s chybou a vyžaduje obnovu stavu před dalším zápisem. Volba „Pobyty a ikony“ otevírá samostatnou pracovní obrazovku, aby dlouhé seznamy rezervací nezvětšovaly stavový dialog. Responzivní uspořádání a úplný inventář prvků popisuje [UI pracovních obrazovek](ui-workspaces.md).

Tabulka `reservation_amenities` (migrace `0031_reservation_amenities`) ukládá unikátní dvojici Better Hotel ID rezervace a typu `dog`/`cot`, stav `red`/`green`, aktivitu, monotónní verzi, autora a čas změny. Odstranění je logické: zachovaná verze brání přepsání nově vytvořené ikony starým požadavkem. Ikony následují tutéž rezervaci při přesunu pokoje, nepřenášejí se na další rezervaci a zachovávají barvu až do odjezdu.

Recepce a admin přidávají (vždy červeně), odebírají a mění barvy. Pokojská pouze mění barvy již existujících ikon. Pracovní obrazovka rozlišuje jednotlivé pobyty; bez rezervace nelze ikonu přidat. Plánovaný příjezd na volný pokoj je platná rezervace. Před zápisem API ověřuje aktuální vazbu rezervace na pokoj a vybraný den. Konflikt verze nebo přesun vrací `409` a UI obnoví přehled. Změna příznaku a audit před/po se ukládají v jedné databázové transakci.

## API portálu

- `GET /api/v1/housekeeping/rooms?date=YYYY-MM-DD` sestaví přehled z aktuálního inventáře, příjezdů, odjezdů, skutečných check-outů a pobytů Better Hotel.
- `PATCH /api/v1/housekeeping/rooms/{room_id}?date=YYYY-MM-DD` změní stav pokoje a vrátí znovu ověřený detail ve zvoleném denním kontextu.
- `POST /api/v1/housekeeping/reservations/{reservation_id}/amenities/{kind}?room_id=…&date=…&version=…` přidá ikonu, výchozí verze nové dvojice je 0.
- `PATCH` na stejné cestě s `room_id`, `date` a tělem `{state, version}` mění barvu.
- `DELETE` na stejné cestě s `room_id`, `date`, `version` ikonu odebere. Přehled vrací i neaktivní položky kvůli verzi, UI je nezobrazuje jako požadavky.

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

Role `admin`, `recepce` a `pokojská` mají `housekeeping:read` i `housekeeping:write`. Jemná oprávnění ikon vynucuje API podle aktivní role. Ostatní role nemají k endpointům přístup. Zápis zároveň podléhá session, CSRF a standardnímu audit middleware.

## Validace

- API kombinace a zápis: `apps/kajovo-hotel-api/tests/test_housekeeping.py`;
- trvalost, verze a oprávnění ikon: `apps/kajovo-hotel-api/tests/test_reservation_amenities.py`;
- RBAC GET/PATCH: `apps/kajovo-hotel-api/tests/test_rbac.py`;
- portálová interakce: `apps/kajovo-hotel-web/tests/live-smoke.spec.ts`;
- administrační interakce: `apps/kajovo-hotel-admin/tests/e2e-smoke.spec.ts`;
- responzivní vizuální kontroly: existující visual suites obou frontendů; smoke scénář zúžení otevřeného přehledu s 37 pokoji ověřuje, že odloženě vykreslovaná patra neudrží šířku předchozího viewportu;
- produkční čtecí gate: `scripts/verify_live_housekeeping_rooms.mjs`.
- CI job `api-runtime-image` sestaví skutečný produkční Docker image, ověří import celé aplikace a přítomnost českého překladu zemí. Závislost `pycountry` musí být i v Dockerfile, nejen v `pyproject.toml` a minimálních CI instalacích.

## Dopadová matice

| Kategorie | Rozhodnutí a rozsah |
|---|---|
| Produkční kód | Aktualizovat připravenost pro příjezd a sdílené karty; oprávnění ikon ověřit beze změny. |
| Testy | Aktualizovat půlení barev, počítání nocí a UI scénáře; ověřit obsazenost a ikony. |
| GitHub a gates | Ověřit beze změny: existující CI, produkční API image a automatický deploy. |
| Dokumentace | Aktualizovat tento kontrakt a RBAC. |
| Komentáře a poznámky | Aktualizovat rozlišení barev a obsazenosti; odstranit celoplošnou zelenou a pruhování. |
| Instrukce | Aktualizovat kořenový AGENTS o barvy podle vybraného dne. |
| Fixtures a texty | Aktualizovat pobyty, role, štítky, legendu a selektory testů. |
| Build a kontrakty | Aktualizovat OpenAPI, klienta a produkční validátor; ověřit oba buildy a migraci. |
