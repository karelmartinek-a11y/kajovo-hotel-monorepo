# Historický archiv hlasové diagnostiky

Produkční Dagmar nemá diagnostické UI, API, collectory, nahrávání, event batching,
WebRTC getStats sampling, diagnostické časovače ani startup/shutdown úlohy úložiště.
API nemontuje historický volume ani jeho klíč. Běžný hovor neposílá diagnostické
požadavky a neukládá obsah rozhovoru, audio, prompty ani obsah nástrojů do logů.
Funkční identitu hovoru vlastní LogicalCall; reconnect, paměť a potvrzovací journaly
jsou nezávislé na historickém archivu.

Historický Docker volume `kajovo-prod_diagnostics_data` a samostatný klíč
`/home/deploy-hotel/dagmar-secrets/diagnostic.key` se zachovávají bez automatického
mazání, migrace, rekonciliace nebo evikce. Klíč není provider master key ani SMTP klíč.
Datový formát obsahuje SQLite `index.sqlite3` a `objects/`: v1 E/M a v2 B/J objekty,
AES-GCM s původním AAD, checksumy jednotlivých záznamů a audio decoder manifesty.
Historické mezery, neúplné producer finals a neznámý původní capture zůstávají pravdivé.

`tools/voice_archive/reader.py` je samostatný read-only reader mimo API image.
Nevytváří adresáře, tabulky ani zámkové soubory v archivu. SQLite otevírá přes
`mode=ro`, `query_only=ON` a čtecí transakci; každý session/handle uzavírá.
Reader čte původní metadata, manifest, audio a šifrované objekty včetně ověření
AAD a checksumů. Neobsahuje writer ani servisní smyčku. CI ověřuje syntetické
E/B/J/M objekty a byte-equal stav archivu před/po čtení.

Samostatný export z chráněné kopie/readonly mountu:

```
python3.11 -m tools.voice_archive.export --root <readonly-archive> --key-file <protected-key-file> --call <call-id> --output <new-private-directory>
```

Cesty k privátním zdrojům nejsou tajné hodnoty; samotný klíč nesmí být v argumentech,
logu, repozitáři nebo CI artefaktu. Export vytvoří nový adresář s právy 0700 a soubory
0600. Obsah může zahrnovat citlivé historické audio a přepisy. Do stdout vypíše pouze
stav dokončení. Export není obnovou provozní databáze ani oprávněním k operaci MCP.
