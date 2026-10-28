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

Další pokoje z inventáře následují číselně za tímto pořadím. Ostatní šířky mění počet sloupců, ne pořadí. Mřížka má pevnou výšku dlaždic 122 px na všech šířkách; datum zůstává při posuvu nahoře.

## Dlaždice a rezervace

Horní proužek má pevnou výšku 18 px. Obsahuje jediné vycentrované bílé tučné číslo se stejným souvislým tmavým obrysem na všech pozadích. Jeho barva patří aktuálnímu stavu pokoje bez ohledu na vybraný den: clean zelená, dirty oranžová, technical_issue červená, do_not_disturb tmavě fialová, stay_no_linen tyrkysová, stay_with_linen světle zelená, windows_cleaned tmavě modrá, painted žlutá. Neznámý stav má neutrální proužek a nelze jej slepě přepsat. Stejné barvy používá všech osm tlačítek změny stavu i při najetí ukazatele.

Spodní část patří vybranému dni. Odjezd je v horním bloku, příjezd v dolním; každý má pevnou výšku 51 px. Pokračující pobyt bez příjezdu a odjezdu vyplní tělo svou barvou s obsahem na stejných horních souřadnicích a samostatným označením POBYT uprostřed spodní poloviny; pole času tohoto pobytu zůstává prázdné. Neobsazená část je bílá a bez textu. Každá rezervace má vlastní barvu: confirmed zelená, checked_in modrá, checked_out tmavě šedá, option oranžová. Časy skutečných akcí ani úklid barvu rezervace nenahrazují. Více rezervací v jedné části je nejednoznačné přiřazení: dlaždice upozorní a detail ukáže všechny.

Rezervační blok má čtyři pevné řádky o výškách 13, 12, 10 a 13 px, s odsazením 1 px nahoře a dole. První řádek obsahuje první známé jméno skutečně ubytovaného hosta a lokální SVG vlajku; bez jména ubytovaného se použije rezervující osoba, pak firma, pak agentura a teprve bez všech hodnot ?. Druhý má všechny tři věkové počty v jedné řadě: běžné číslo 11 px a siluetu 7 × 11 px, dospělé vlevo, děti uprostřed a mimina vpravo v pevných třetinách. Třetí obsahuje událost s očekávaným časem vlevo a X/Y v pevném 28px poli vpravo. X je počet uplynulých nocí k vybranému dni, Y celkové noci: v den příjezdu 0/Y a v den odjezdu Y/Y. Rozdíl kalendářních dat se počítá v UTC, nezávisle na změně letního času. Čtvrtý řádek má pevná pole psa × množství (26 px), postýlky (16 px) a poznámky (12 px), oddělená mezerou 2 px. Prázdné položky nepřesouvají ostatní, dlouhé jméno má výpustku a čísla se přizpůsobí délce uvnitř vlastního pole. Piktogramy jsou bez podkladu a rámečku; postýlka je vystředěná. Vlajky jsou součástí buildu, bez externích požadavků a bez lemu. U neznámé země zůstává ?. Více rezervací nebo neurčený stav mají slovní upozornění, všechny původní údaje jsou v detailu. Samostatný červený vykřičník bez podkladu, rámečku nebo stínu má 13 px a je pouze ve vyhrazeném poli neprázdné poznámky reservation_note[].housekeep; reduced-motion jej ponechá statický.

Věk se počítá k vybranému dni z data narození všech osob pokoje, nezávisle na food. Mimino je před druhými narozeninami, dítě od 2 do 17 let, dospělý od 18. Bez data narození se použije guest_list.guest_type.age_limit; všechny dospělé kategorie se sloučí, dětské do 2–17 a příznak mimina do první skupiny. Neurčené nebo rozporné počty jsou ?, ne nula. API neposílá data narození ani surové objekty hostů.

Země se vybírá jako první vyplněná hodnota mezi ubytovanými podle position → rezervující (hlavní) osoba → firma. Prázdný údaj u prvního hosta nebrání použití druhého, třetího či dalšího hosta. API vrací původní dvoupísmenný country_code a aditivní country_code_alpha3 podle ISO 3166-1. Dlaždice ukazuje lokální SVG vlajku podle country_code; detail a tooltip plný lokalizovaný název. Přehled i jeho přístupný název používají první známé jméno ubytovaného; bez něj rezervující osobu, firmu, agenturu a nakonec ?. Detail uvádí příjmení a jména všech ubytovaných a název firmy; rezervující osobu samostatně ani jako náhradní nadpis nezobrazuje. Bez hodnoty je ?. Čas pochází z arrival_time/departure_time v místním čase hotelu, nikoli ze skutečných action timestampů; chybějící čas je ?.

Web čte položky z bill.bill_item konkrétní rezervace přiřazené pokoji. Aktivní položky s názvem obsahujícím Domácí mazlíček se sčítají podle quantity včetně různých nocí. Položky Dětská postýlka znamenají jedinou ikonu. Archivované položky se ignorují, záporné opravy snižují součet, duplicitní ID se nezapočítávají dvakrát. Platba, billed a is_open nejsou filtrem. Neplatný nebo zlomkový počet psů je neurčený. SVG ikony jsou barevné a nezávislé na systémových emoji. Automatický požadavek je červený, dokud jej pokojská nepotvrdí; po potvrzení je zelený v detailu i dlaždici. Potvrzení psa platí pro celý uvedený počet, postýlka má jediné potvrzení. Detail umožňuje potvrdit oba druhy postupně bez zavření. POST /api/v1/housekeeping/reservations/{reservation_id}/requirements/{kind}/confirm ověřuje den, Better Hotel vazbu pokoje, aktivní natížení a očekávané množství, poté verzi markeru a oprávnění/CSRF. Ukládá active=true a state=green do reservation_amenities a audit; nenahrazuje původní nativní endpointy. Neověřený nebo konfliktní zápis zablokuje další potvrzení do obnovy. Web nevytváří ani neodebírá požadavek ručně; marker bez aktivního natížení se na webu nezobrazuje. Dlaždice uvádí psa jednou s počtem ×N, detail zachovává jednotlivé ikony i celý počet a položky. Věkové počty osob jsou vždy v jednom řádku; čas s X/Y a požadavky mají své samostatné pevné řádky. Upozornění na poznámku je výhradně ve třetím poli požadavků. Červená blokace se kreslí jen v prázdném časovém bloku.

Pobyty patří vybranému dni; obsazenost a úklid současnému okamžiku. API zachovává occupancy_date, housekeeping_status_is_current, operational_state a původní nativní pole. Aditivní current_persons udává nynější počet osob, zatímco persons zůstává údajem vybraného dne.

Priorita aktuální obsazenosti:

1. Dnešní příjezd s CHECK-IN bez CHECK-OUT: **OBSAZENO-PŘIJEL**.
2. Dnešní odjezd bez CHECK-OUT: **OBSAZENO-ODJÍŽDÍ**.
3. Pokračující pobyt s CHECK-IN bez CHECK-OUT: **OBSAZENO-POBYT**.
4. Jinak **VOLNO**. Samotný plánovaný příjezd pokoj neobsazuje.

Přehled se obnovuje po zápisu, každých 60 sekund ve viditelném okně a ihned při návratu do okna, probuzení telefonu či návratu z jiné aplikace (`focus`, `visibilitychange`, `pageshow`). Obnova zachovává vybraný den; na pozadí se periodické dotazy neposílají. Starší odpověď nesmí přepsat novější datum.

## Detail a nativní příznaky

Výběr dlaždice otevře spodní detail. První obsah tvoří všech osm stavových tlačítek. Následuje aktuální stav/obsazenost a provozní detail každé rezervace: kód, stav, termíny, očekávané a skutečné časy, noc pobytu X/Y, věkové počty, ubytované osoby, země, firma, požadavky, jejich položky a úplná poznámka pro pokojskou. Kalendářní rozdíly pro noci se počítají v UTC, bez vlivu DST.

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

## Blokace a rozdělení podle dne

Web volá GET i PATCH přehledu s include_blocks=true. API čte stránkované /reservation s filter[mode]=block, filter[state]=all, filter[range_type]=intersect a expand[]=room; skutečný mode=3 a UUID pokoje odděluje od hostovských pobytů. Blokace neovlivňuje počty hostů ani stav úklidu. Začátek má červený kříž v dolním prázdném bloku, konec v horním; průběh a jednodenní blokace jeden kříž přes celé tělo pouze bez rezervací. Pokud je část obsazená rezervací, kříž se do ní nekreslí. Všechny původní blokace a jejich data zůstávají v detailu. Souběhy se zobrazí jako sjednocení pokrytí; průběžná blokace má přednost. Kříže neblokují otevření detailu. Selhání nebo neplatná data nejsou úspěšně prázdný seznam. Odpověď přidává blocks s block_id, arrival, departure a coverage (left/right/full); výchozí include_blocks=false zachovává původní nativní tok bez dodatečného provider čtení.

Bez příjezdu a odjezdu se probíhající pobyt zobrazí přes celou šířku v barvě své rezervace. Teprve pokoj bez příjezdu, odjezdu i pobytu má bílou prázdnou rezervační část. Odjezd vždy patří hornímu bloku, příjezd dolnímu, chybějící blok je bílý. Oba bloky mají celou šířku a pevnou polovinu výšky těla; každý přebírá výhradně stav své rezervace. Pozadí nemá gradient. Obsah, ikony a jejich potvrzování zůstávají; plné údaje včetně pokračujícího pobytu jsou v detailu.

Při změně přístupů Better Hotelu se před produkčním nasazením na serveru provede autentizované čtení jednoho pokoje. Chybějící, odmítnuté nebo nepoužitelné nové přístupy zastaví nasazení před přepsáním konfigurace a výměnou služeb. Kontrola nevypisuje tokeny ani hotelová data.
