# Hotelové konektory SMART

Hotelový API host Dagmar neprovisionuje historické KajaVoiceHA ani SmartPlan.
`create_dagmar()` předává pouze hostové `voice_*` nastavení a paměťový adaptér.
HA endpoint, token, trusted origins a SmartPlan endpoint zůstávají prázdné.
Staré proměnné prostředí nemohou konektory aktivovat. Deploy odstraňuje
`KAJAVOICEHA_MCP_TOKEN` a `SMARTPLAN_VOICE_HOST_TOKEN` z přenášeného prostředí;
Compose již token KajaVoiceHA nepředává. Importní CLI SmartPlan není součástí hostu.
Přenositelné balíčky si zachovávají izolované kontrakty a testy pro jiné hostitele.
Bez konfigurace skončí konektor před sítí a čtením uloženého tajemství.
Čtecí provozní kontrola `scripts/verify_voice_mcp_live_readonly.py` tento stav
vykáže jako `not_configured` bez pokusu o připojení.

Současný KajovoSmart je samostatná služba `smartnewgen.service`. Jeho HA přístup
„SMART NEW GEN“, aktivní OAuth adaptér, databáze a scénáře nejsou touto změnou měněné.

## Provozní uzavření

Před změnou pořiď chráněnou konzistentní zálohu PostgreSQL a Smart SQLite,
fingerprint definic scénářů, procesů a konfigurací. Zálohy a citlivá data nepatří do Gitu.
Po nasazení cíleně odstraň pouze starý hostový ciphertext z `dagmar_smartplan_secrets`
a starou vazbu z `dagmar_smartplan_links` v jedné transakci s kontrolou počtů.
Historické operace, účtenky, doručení a hlasová nastavení zachovej.

HA přístupy „MCP chytré technologie“ a „MCP SmarNGRW“ odvolej podporovaným
WebSocket příkazem `auth/delete_refresh_token`, po kontrole přesného jména,
typu a identity záznamu. Neupravuj živý soubor HA auth ručně.
Ověř odmítnutí odvolaných přístupů a funkční autorizované čtení současným přístupem.

Nepoužívaný soubor `/etc/smartnewgen/chatgpt-oauth/config.json` lze po chráněné
záloze odstranit. Aktivní adaptér načítá `/etc/smartnewgen-chatgpt-oauth/config.json`;
jeho obsah, databázi a aktuální přihlášení zachovej. Samotné odstranění nepoužívaného
souboru nevyžaduje restart Smart ani HA.

## Ověření a hranice

Regrese hostového adaptéru a deploy prostředí musí odmítnout aktivaci starých
konektorů i se zbylými env hodnotami. Spusť úplné CI a ověření API image.
Nasazení je omezené na API/admin přes `Hotel-Deploy-Scope: api-admin` a `--no-deps`.
Živě ověř prázdné konfigurace konektorů, odstraněné staré env hodnoty a cílené DB řádky,
zachování historických záznamů a definic současných scénářů. Neprováděj spínací testy.
Odpojení starých přístupů samo o sobě nedokazuje historickou příčinu zapnutí zařízení.

## Matice dopadů

| Oblast | Rozhodnutí |
| --- | --- |
| API adaptér, konfigurace, import CLI | aktualizovat / odstranit staré zapojení |
| Hostové regresní testy, deploy testy | aktualizovat |
| Compose a přenos deploy prostředí | odstranit starý token |
| AGENTS a aktuální provozní dokumentace | aktualizovat |
| Přenositelné knihovny, fixtures a kontrakty | ověřit beze změny, stále použitelné izolovaně |
| UI, OpenAPI a generovaný klient | ověřit beze změny, schéma rout se nemění |
| CI, runtime image a deploy gates | ověřit stávajícími kontrolami |
| Android, účetní/hostovská data, modelové volání | nerelevantní, žádný změněný kontrakt ani účinek |
