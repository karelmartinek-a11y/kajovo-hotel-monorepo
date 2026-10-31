# Aktuální CML identita během hovoru

Kandidát má vlastní background konzument CML webové autority. Výchozí
`CmlWebBoundary` i skutečné zapojení v `app/main.py` stále mají hovory vypnuté.
Odložená aktivace není nahrazena samotnou existencí nového konzumenta.
Lokální fixture může výslovně vložit `voice_enabled=True`; produkční konfiguraci
tento test nemění. Nové hlasové MCP tokeny ani provider granty se nezakládají.

## Ověření před operací

Ověřený CML podpis nad Hotel call/session požadavkem obsahuje hash privátního
údaje `X-CML-Voice-Authority`. Browser nemůže tuto hlavičku předat gateway jako
vlastní oprávnění. `cml_voice_authority.CmlVoiceAuthority` porovná podpisový
hash, účel routy a neměnnou vazbu SID, epochy, centrálního subjektu a nativního
ID. Nový záznam může vzniknout pouze při původním POST `/calls`.

Pevný endpoint `https://kajovocml.hcasc.cz/internal/web-voice-authority` se ptá
na přesně tuto vazbu. Nepředává cookie, Origin, provider token ani zprávy.
Úspěch znamená pouze přesný JSON `{active: true}`. Redirect, timeout, nejasná
odpověď, jiný typ nebo příliš velké tělo odmítají autorizaci. Produkční HTTP
klient ověřuje TLS, nepřebírá proxy z prostředí a má dvousekundový timeout.
Kladné výsledky se necachují a neprodlužují platnost či neaktivitu CML relace.

Migrace `0051_cml_voice_authority` přidává vlastní tabulku. Capability je
šifrovaný AES-GCM vlastním hotelovým Voice master key s AAD obsahující celou
vazbu. Souběžné workery zachovají jediný neměnný řádek, ciphertext a expiraci.
Řádek není přihlašovací `AuthSession` a jeho životnost se neobnovuje. Aditivní
migraci nelze odstranit destruktivním rollbackem. Docker spouští Alembic před
startem API; při řízeném nasazení musí migrace úspěšně skončit před výměnou
procesu. Neobnovovat kvůli rollbacku živou DB.

Původní `dagmar_adapter.identity('cml:<sid>')` předá jen čerstvou CML autoritu
a znovu ověřený aktivní lokální admin profil. Zachovává hlavní
`admin-profile:1` a odlišný `portal:<id>` skutečného správce. Lokální blokace či
odebrání role odmítá další operaci i tehdy, když CML odpoví kladně. Neexistuje
fallback do původních cookies pro `cml:` principal. Původní nativní/Android
AuthSession pokračuje vlastní větví i při nedostupnosti CML.

Původní Dagmar `RuntimePorts`, logický hovor, greeting ledger, přerušení,
paměťové účtenky, sdílený prostor a souhlasy zůstávají rozhodující. Runtime
ověřuje aktuální identitu před účinky a jeho původní lease ukončuje odvolané
hovory. HTTP admission není samostatným oprávněním k pozdějšímu účinku.

## Místní důkazy a jejich rozsah

Úplná sada API, VoiceCore a Dagmar má 535 PASS, 0 skipped a 270 původních
deprekačních warnings. Nové scénáře zahrnují šifrovaný restart, porušení AAD,
změnu klíče, lokální blokaci/roli, současný CML stav, výpadek a expiraci,
odmítnutí cizího účelu a odebrání oprávnění mezi podpisovým admission a fake
účinkem. PostgreSQL test spouští skutečnou migraci a čtyři souběžné workery
v odděleném lokálním schématu; chráněný původní sentinel zůstává beze změny.
Migrační regrese ověřuje zachování záznamů při odmítnutém downgrade.

Samostatný CML browser test `tests/library/hotel-voice-rtc.browser.mjs`
používá v Hotelu `tests/cml_voice_provider.py` pouze při obou explicitních
kvalifikačních přepínačích. CML HTTP gateway, podpisy, skutečné native routy,
logické hovory, session manager, background identita a ukončení jsou původní.
Pouze provider HTTP/socket porty a zdroj zvuku jsou syntetické. Dva skutečné
browser peery přenášejí oscilátorový zvuk; není přístup k mikrofonu, OpenAI,
MCP poskytovatelům, produkčním účtům ani skutečné poště. Síť fixture odmítá
vše mimo loopback. Fixture není součástí Docker runtime.

Chromium i WebKit prokázaly dekódované zvukové pakety s rostoucí energií,
ztlumení, pozastavení vstupu po vyčerpání limitu, odlišného Hotel admina a
ukončení původní background relace po odebrání CML grantu. Kvalifikace také
končí čekající handshake, uvolňuje jeho pozdní původní
session a po ztraceném ACK prokazuje jediný původní POST bez replaye. Neznámou
relaci uzavírá skutečný background lease po testovém posunu jeho deadline;
čtyři nabídky vytvoří právě čtyři provider relace a čtyři ukončení. To není přejímka
kvality AI odpovědí, fyzického mikrofonu/reproduktorů, veřejné sítě, placeného
modelu nebo doručení zprávy. Publikace, nasazení, úplná vizuální přejímka a
rozhodnutí o dosud výslovně odložené aktivaci zůstávají samostatné otevřené kroky.
