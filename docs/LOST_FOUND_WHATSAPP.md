# Oznámení nového nálezu na WhatsApp

Nový záznam typu `found` vytváří ve stejné databázové transakci trvalou frontu.
Celý text (popis, kategorie, místo, pokoj, pražské datum, stav, štítky,
majitel, kontakt a poznámka) se beze zkrácení rozdělí na části do 900 znaků
včetně identifikace nálezu. Pozdější změna existujícího textu jej nerozesílá
znovu. Každá připojená fotografie dostane vlastní operaci, i když ji uživatel
připojí až na detailu po uložení. Historické nálezy a záznamy typu `lost`
nejsou zpětně rozesílány. UUID události odlišuje i znovu použité číselné ID.

API používá oficiální Python MCP SDK a veřejný endpoint Komunikace MCP.
Má vlastní strojový grant `hotel-lost-found`, omezený na odeslání, stav
vlastní operace a kontrolu konektoru. Příjemce je pevná soukromá konfigurace
na obou stranách; nelze jej změnit formulářem. Provider token vlastní pouze
Komunikace. Hotel čte svůj samostatný token ze souboru 0600 bez symlinků.

## Provoz

API konfigurace:
- `KAJOVO_API_LOST_FOUND_WHATSAPP_ENABLED=true`
- `KAJOVO_API_LOST_FOUND_WHATSAPP_RECIPIENT`: autorizované číslo E.164
- `KAJOVO_API_LOST_FOUND_WHATSAPP_TOKEN_FILE`: soukromý soubor vlastního grantu

Komunikace: stejný `HOTEL_FOUND_RECIPIENT` a
`HOTEL_FOUND_IMAGE_TEMPLATE=kajovo_hotel_nalez_foto_v1`.
Žádný token ani skutečné telefonní číslo nepatří do Gitu.

V otevřeném servisním okně se odesílá původní text a obrázek. Mimo okno
musí být schválené české UTILITY šablony: původní provozní textová šablona
a obrazová šablona s IMAGE hlavičkou a dvěma BODY parametry. Meta v textovém
parametru nepřijímá původní zalomení; šablona sjednotí bílé znaky, obsah
všech polí zůstane zachován. JPEG/PNG do 2 MB se přenáší celé, ostatní
podporované obrázky se převádějí na JPEG; nepublikují se veřejné media URL.
Neschválená šablona drží frontu jako blokovanou a sama se znovu ověří.

Stavy přijetí, doručení a přečtení jsou odlišné. API počítá jako přijatou
část až providerem přijatou zprávu; samotná frontová účtenka nestačí.
Přijetí není koncový stav: worker každých 60 sekund čte původní účtenku
až do doručení, přečtení nebo chyby. Pozdější odmítnutí se promítne do
detailu nálezu. Výpadek čtení, chybějící účtenka ani dočasně starší stav
po prokázaném přijetí nesmějí spustit další odeslání.
Detail ukazuje přijaté/celkové části a problém odesílání. Nález zůstává
uložený při výpadku. Selhání jedné části nezastaví nezávislé části.
Nejistý pokus obnovuje pouze původní UUID přes čtení stavu. Autoritativní
NOT_FOUND dovoluje stejnou operaci předat až v dalším průchodu; nevzniká
nová identita. Migrace 0051 a účtenky přežívají rollback kódu.

## Matice dopadů a ověření

| Oblast | Výsledek |
| --- | --- |
| Zdroj/API | Fronta, životní cyklus workeru, transakční hook nálezu/fotografií, aditivní DTO stavu |
| Testy | Izolovaná DB, všechny fotografie, dlouhý Unicode text, rollback, výpadek, původní UUID, žádný historický backfill; přijetí následované doručením/chybou a výpadkem čtení bez dalšího odeslání |
| UI a překlady | Stav na detailu v cs/en/uk; původní formulář a RBAC zachovány |
| CI | Ověřit beze změny: úplný release gate a runtime image; bez živých zpráv |
| Dokumentace a instrukce | Tento runbook, README a AGENTS |
| Build/deploy | Oprava sledování stavu mění pouze API image; bez migrace, změny závislostí, grantů nebo konfigurace |
| Android / OpenAPI / klient | Ověřit beze změny: existující create/upload i výstupní kontrakt zachován |
| Komentáře, fixtures, překlady | Aktualizovat očekávání testů; existující lokalizované upozornění na chybu zachováno |
| Instrukce / SSOT | Aktualizovat koncové stavy a zákaz opakovaného odeslání přijaté operace |

Automatické testy používají izolované adaptéry bez skutečného rozesílání.
Živá přejímka kontroluje schválení šablon, vlastní grant, oficiální SDK
handshake/katalog, konektor a nové runtime SHA. Výslovně autorizovaný živý
test z 3. 11. 2026 vytvořil jeden označený testovací nález se třemi obrázky.
Všechny čtyři zprávy provider následně odmítl kódem `131042`; doručení
neprošlo. Samotný obecný stav účtu `AVAILABLE` není důkaz doručitelnosti.
Konkrétní účtenky a soukromý příjemce jsou v chráněné provozní evidenci,
nikoli v repozitáři. Neúspěšný živý test se automaticky nerozesílá znovu.
