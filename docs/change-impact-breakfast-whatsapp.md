# Denní přehled snídaní přes WhatsApp

## Matice dopadů

| Oblast | Rozhodnutí |
| --- | --- |
| Produkční zdroj | Aktualizovat Hotel API, plánovač a aktivní CML Nastavení Hotelu. |
| Testy | Doplnit časová pásma/DST, výpočet, souběh, restart, nejisté doručení, RBAC a responzivní formulář. |
| CI a gates | Doplnit novou browserovou kvalifikaci do úplného release gate; zachovat ostatní kontroly. |
| Dokumentace | Doplnit provozní kontrakt a README. |
| Komentáře | Popsat pouze současné chování, zvláště neověřené doručení. |
| AGENTS | Doplnit vlastnictví plánovače a omezené komunikační identity. |
| Data a texty | Aditivní tabulky; kontakty pouze ve vlastní DB, syntetické testy; administrace česky. |
| Build a kontrakt | Připnout oficiální MCP klient a kompatibilní transport; regenerovat OpenAPI/klienta. Android ani původní frontend nový administrační kontrakt nekonzumují. |

## Kontrakt

Nastavení Hotelu umožňuje zapnout denní WhatsApp souhrn, zadat čas HH:MM
v Europe/Prague a nejvýše 20 unikátních telefonních čísel v mezinárodním formátu.
Nová instalace je vypnutá a nemá příjemce. Změna nastavení platí pro další
plánované odeslání; již předané zprávy nelze odvolat. Nastavení používá revizi,
aby pozdní uložení nepřepsalo novější změnu. Čas respektuje letní/zimní čas:
neexistující čas se posune na první platnou minutu, opakovaný čas nastane jednou.
Zapnutí po zvolené hodině plánuje až další den. Restart dohání jen tentýž den.

Před odesláním se čte úplný aktuální výpočet BetterHotel pro následující kalendářní
den. Počet je součet zakoupených snídaní, s vynecháním místně zrušených položek
se stejnou identitou pobytu. Neúplná/nedostupná data se nikdy nevydávají za nulu.
Nula ověřená poskytovatelem se odešle. Zpráva obsahuje pouze datum a počet,
žádná jména hostů, pokoje ani poznámky.

Hotel vlastní harmonogram, příjemce a trvalé dávky/účtenky. Odesílá přes
existující KájovoKomunikace MCP, oficiální Python SDK a samostatný M2M grant
`notification:hotel-breakfast`, omezený na `whatsapp_send_message`,
`whatsapp_message_status`, `whatsapp_connector_status`. WhatsApp provider
credentials zůstávají výhradně v Komunikaci a její Secret Library/cache.
Komunikace vybírá schválenou provozní šablonu mimo otevřené servisní okno.
Chybějící konfigurace/šablona je viditelná překážka, nikoli úspěch.

Dávka má unikátní den a příjemci stabilní UUID. Intent se uloží před síťovým
voláním. Po timeoutu či restartu se čte původní účtenka, odeslání se neopakuje.
`accepted` znamená přijetí poskytovatelem; teprve `delivered`/`read` dokládá
doručení podle WhatsApp webhooku. Bez doručenky se doručení netvrdí.

## Provoz

`KAJOVO_API_BREAKFAST_WHATSAPP_CONFIG_PATH` ukazuje na vlastní chráněný JSON,
standardně `/app/data/credentials/breakfast-whatsapp.json`. Profil
`kajovo-breakfast-whatsapp/1` obsahuje přesný HTTPS `endpoint`, vlastní `token`
a UTC `expires_at`. Soubor není součástí image, Gitu ani výstupů; přístup pouze
uživateli API. Protějšek je aktivní grant `notification:hotel-breakfast` v
existujícím `mcp-access.json` Komunikace. Není dovoleno sdílet token jiné služby.
Endpoint ani token nelze měnit přes web. Read-only konfigurace/preview nikdy
neodesílá zprávu. Web má pouze správce s původním CML/RBAC/CSRF oprávněním.

Plánovač se spouští při startu API, kontroluje harmonogram po 30 sekundách.
Tabulky jsou aditivní, rollback kódu neobnovuje DB. Před nasazením chránit
aktuální runtime/DB a vlastní grant; nasadit přes přímé SSH z publikovaného SHA,
bez restartu Komunikace, CML, webu či PostgreSQL. Živá přejímka používá pouze
čtení katalogu, readiness a náhledu. Skutečné odesílání spustí vlastník uložením
zapnutého harmonogramu s konkrétními příjemci.
