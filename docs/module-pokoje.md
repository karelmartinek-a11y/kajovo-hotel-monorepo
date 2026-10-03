# Modul Pokoje

## Uživatelský tok

Pohled `Pokoje` je samostatná výchozí volba na stránce `/pokojska` a paralelně na `/admin/pokojska`, vedle rychlých zápisů `Nález` a `Závada`. Je dostupný pokojské, recepci i administrátorovi přes sdílenou komponentu. Výchozí den je aktuální hotelový den v `Europe/Prague`; obsluha může přejít na předchozí nebo následující den či zvolit datum.

Pokoje tvoří jednu mřížku v pevném pořadí. Na mobilu po čtyřech dlaždicích v řádku:

```text
101 102 103 104
105 106 107 108
109 203 204 205
206 207 208 301
302 303 304 305
306 307 308 309
310 221 222 223
224 321 322 323
324 201 202 209
210
```

Další pokoje z inventáře následují číselně za tímto pořadím. Ostatní šířky mění počet sloupců, ne pořadí. Mřížka drží výšku dlaždic 112 px, na telefonu 106 px; datum zůstává při posuvu nahoře.

## Dlaždice a rezervace

Horní proužek zabírá 15 % vnitřní výšky. Obsahuje vycentrované černé tučné číslo. Jeho barva patří aktuálnímu stavu pokoje bez ohledu na vybraný den: clean zelená, dirty oranžová, technical_issue červená, do_not_disturb fialová, stay_no_linen světle zelená, stay_with_linen žlutá, windows_cleaned modrá, painted světle fialová. Neznámý stav má neutrální proužek a nelze jej slepě přepsat.

Spodní část patří vybranému dni. Odjezd je vlevo, příjezd vpravo; pokračující pobyt zabírá celou šířku. Neobsazená část je bílá a bez textu. Každá rezervace má vlastní barvu: confirmed zelená, checked_in modrá, checked_out tmavě šedá, option oranžová. Časy skutečných akcí ani úklid barvu rezervace nenahrazují. Více rezervací v jedné části je nejednoznačné přiřazení: dlaždice upozorní a detail ukáže všechny.

Rezervační blok má čtyři pevné řádky: dospělý/dítě/mimino s počty, událost s očekávaným časem nebo POBYT, země, požadavky a upozornění. Mobil události označuje odlišnými piktogramy. Osoby mají výrazné plné SVG siluety: dospělého, menšího dítěte a mimina v zavinovačce. Tři ikony s počty zůstávají v jednom řádku. Písmo Arial a velikost ikon využívají šířku konkrétní rezervační části; pokračující pobyt má větší obsah než úzká polovina při výměně hostů. Dlouhé texty zůstávají v prostoru řádku a při potřebě mají výpustku; detail je nezkracuje. Vykřičník bliká pouze u rezervace s neprázdným reservation_note[].housekeep; reduced-motion jej ponechá statický.

Věk se počítá k vybranému dni z data narození všech osob pokoje, nezávisle na food. Mimino je před druhými narozeninami, dítě od 2 do 17 let, dospělý od 18. Bez data narození se použije guest_list.guest_type.age_limit; všechny dospělé kategorie se sloučí, dětské do 2–17 a příznak mimina do první skupiny. Neurčené nebo rozporné počty jsou ?, ne nula. API neposílá data narození ani surové objekty hostů.

Země se vybírá jako první vyplněná hodnota mezi ubytovanými podle position → rezervující (hlavní) osoba → firma. Prázdný údaj u prvního hosta nebrání použití druhého, třetího či dalšího hosta. API vrací původní dvoupísmenný country_code a aditivní country_code_alpha3 podle ISO 3166-1. Dlaždice ukazuje výhradně třípísmenný kód (např. CZE, DEU, GBR); detail a tooltip plný lokalizovaný název. Přehled neobsahuje jména ani firmu, ani v přístupném názvu dlaždice, a nemá vysvětlivky. Detail uvádí příjmení a jména všech ubytovaných a název firmy; rezervující osobu samostatně ani jako náhradní nadpis nezobrazuje. Bez hodnoty je ?. Čas pochází z arrival_time/departure_time v místním čase hotelu, nikoli ze skutečných action timestampů; chybějící čas je ?.

Web čte položky z bill.bill_item konkrétní rezervace přiřazené pokoji. Aktivní položky s názvem obsahujícím Domácí mazlíček se sčítají podle quantity včetně různých nocí. Položky Dětská postýlka znamenají jedinou ikonu. Archivované položky se ignorují, záporné opravy snižují součet, duplicitní ID se nezapočítávají dvakrát. Platba, billed a is_open nejsou filtrem. Neplatný nebo zlomkový počet psů je neurčený. SVG ikony jsou barevné a nezávislé na systémových emoji. Automatický požadavek je červený, dokud jej pokojská nepotvrdí; po potvrzení je zelený v detailu i dlaždici. Potvrzení psa platí pro celý uvedený počet, postýlka má jediné potvrzení. Detail umožňuje potvrdit oba druhy postupně bez zavření. POST /api/v1/housekeeping/reservations/{reservation_id}/requirements/{kind}/confirm ověřuje den, Better Hotel vazbu pokoje, aktivní natížení a očekávané množství, poté verzi markeru a oprávnění/CSRF. Ukládá active=true a state=green do reservation_amenities a audit; nenahrazuje původní nativní endpointy. Neověřený nebo konfliktní zápis zablokuje další potvrzení do obnovy. Web nevytváří ani neodebírá požadavek ručně; marker bez aktivního natížení se na webu nezobrazuje. Dlouhá série se ořízne v pevném řádku; detail uvádí celý počet a položky.

Pobyty patří vybranému dni; obsazenost a úklid současnému okamžiku. API zachovává occupancy_date, housekeeping_status_is_current, operational_state a původní nativní pole. Aditivní current_persons udává nynější počet osob, zatímco persons zůstává údajem vybraného dne.

Priorita aktuální obsazenosti:

1. Dnešní příjezd s CHECK-IN bez CHECK-OUT: **OBSAZENO-PŘIJEL**.
2. Dnešní odjezd bez CHECK-OUT: **OBSAZENO-ODJÍŽDÍ**.
3. Pokračující pobyt s CHECK-IN bez CHECK-OUT: **OBSAZENO-POBYT**.
4. Jinak **VOLNO**. Samotný plánovaný příjezd pokoj neobsazuje.

Přehled se obnovuje po zápisu, každých 60 sekund ve viditelném okně a ihned při návratu do okna, probuzení telefonu či návratu z jiné aplikace (`focus`, `visibilitychange`, `pageshow`). Obnova zachovává vybraný den; na pozadí se periodické dotazy neposílají. Starší odpověď nesmí přepsat novější datum.

## Detail a nativní příznaky

Výběr dlaždice otevře spodní detail. První obsah tvoří všech osm stavových tlačítek. Následuje aktuální stav/obsazenost a provozní detail každé rezervace: kód, stav, termíny, očekávané a skutečné časy, noc pobytu X/Y, věkové počty, ubytované osoby, země, hlavní osoba, firma, požadavky, jejich položky a úplná poznámka pro pokojskou. Kalendářní rozdíly pro noci se počítají v UTC, bez vlivu DST.

Zápis používá blokující průběh bez tlačítek. Ověřená odpověď automaticky zavře detail a obnoví přehled. Neověřený zápis ponechá chybu a vyžaduje úspěšné obnovení před opakováním. Změny date a starší odpovědi nesmějí přepsat novější data; čtení se obnovuje každou minutu jen ve viditelném okně a při návratu.

Web nemá ruční přidávání/odebírání ikon; pouze potvrzuje skutečný natížený požadavek. Tabulka reservation_amenities, monotónní verze a audit slouží i těmto potvrzením. Původní rezervační endpointy zůstávají pro nativní Android: admin/recepce přidávají či odebírají, pokojská přepíná barvu. Nativní API kompatibilita zahrnuje původní pole amenities a výchozí přehled bez opcí.

## API portálu

- `GET /api/v1/housekeeping/rooms?date=YYYY-MM-DD&include_options=true` sestaví přehled z aktuálního inventáře, příjezdů, odjezdů, skutečných check-outů a pobytů Better Hotel.
- `PATCH /api/v1/housekeeping/rooms/{room_id}?date=YYYY-MM-DD&include_options=true` přijímá `{status, expected_status}`; očekávaný stav musí odpovídat aktuálnímu stavu poskytovatele, jinak API vrací `409`. PostgreSQL advisory lock serializuje souběžné zápisy téhož pokoje přes API workery.
- `POST /api/v1/housekeeping/reservations/{reservation_id}/requirements/{kind}/confirm?room_id=…&date=…` potvrzuje automatický webový požadavek; tělo obsahuje version (nový marker 0) a quantity (celý počet psů nebo 1 pro postýlku).
- `POST /api/v1/housekeeping/reservations/{reservation_id}/amenities/{kind}?room_id=…&date=…&version=…` přidá ikonu, výchozí verze nové dvojice je 0.
- `PATCH` na stejné cestě s `room_id`, `date` a tělem `{state, version}` mění barvu.
- `DELETE` na stejné cestě s `room_id`, `date`, `version` ikonu odebere. Přehled vrací i neaktivní položky kvůli verzi, UI je nezobrazuje jako požadavky.

Povolené hodnoty zápisu jsou:

- `windows_cleaned` → `Okna umytá`;
- `painted` → `Vymalováno`;
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
- responzivní vizuální kontroly: visual suites obou frontendů; smoke scénáře kontrolují pořadí pokojů, čtyři dlaždice na mobilu a přizpůsobení šířky po zúžení viewportu;
- produkční čtecí gate: `scripts/verify_live_housekeeping_rooms.mjs`.
- CI job `api-runtime-image` sestaví skutečný produkční Docker image, ověří import celé aplikace a přítomnost českého překladu zemí. Závislost `pycountry` musí být i v Dockerfile, nejen v `pyproject.toml` a minimálních CI instalacích.

## Dopadová matice

Úplný rozsah atomické synchronizace obsahuje [dopadová matice](change-impact-room-stamps.md). Parametr include_options je volitelný, výchozí false; web jej posílá také při PATCH, aby odpověď zachovala opce. Nové údaje HousekeepingStayRead jsou aditivní. Databázová migrace není potřeba.
