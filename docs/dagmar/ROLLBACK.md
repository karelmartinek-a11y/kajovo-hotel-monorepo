# Kompatibilní rollback aplikace

Rollback je main-only opravný nebo cílený revert commit, ověřený běžným exact-SHA
CI a deployem. Zachovává `dagmar-server` schema v1, migration marker, společnou
paměť, LogicalCall, originální operation/request ID, trvalé výsledky a receipt
a audio potvrzovací kontrakty. Není dovolený návrat na starý soukromý memory snapshot
ani restart sent/uncertain mutace pod novou identitou.

Před vydáním uchovat chráněný aktuální SQL/roles dump, prostředí a provider master
key s právy 0700/0600 a předchozí image ID. Rollback zvolí aplikaci kompatibilní s
aktuální databází; nevkládá starou databázi přes novější zápisy, neprovádí schema
downgrade a nepřepisuje provozní `.env` starým souborem. V případě regrese opravovat
pouze dotčené chování, zachovat současnou paměť a mutační journaly.

Historický `kajovo-prod_diagnostics_data` a jeho nezávislý klíč zůstávají offline.
Reader `tools/voice_archive` podporuje v1 E/M i v2 B/J a původní checksumy/AAD.
Aplikace archiv nemontuje a nic v něm neobnovuje, nemaže ani rekonciluje.
Návrat starých collectoru/UI není nezbytný k obnově funkčního hovoru.

Samostatný recovery drill používá izolovaný PostgreSQL a poslední chráněný dump:

```
python3.11 scripts/verify_dagmar_recovery.py --backup-dir <protected-directory> --expect-schema dagmar --api-image <compatible-image> --evidence <sanitized-proof.json>
```

Ověřuje schema, nový izolovaný zápis, replay originální receipt a shodu klíčů.
Neprovádí provider/MCP mutace ani nemění živou DB. Disaster recovery vyžaduje
samostatné posouzení zápisů po backupu; neslouží jako automatický rollback.
Izolovaný API testovací kontejner čte chráněný read-only klíč jako root v interní
síti. Zdrojové soubory zůstávají 0600; produkční API běží pod svým běžným uživatelem.
Historické recovery důkazy v `evidence/` platí pouze pro uvedené tehdejší SHA.
