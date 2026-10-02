# Správa místností hlasem: KajaVoiceHA 2.1

Hotelový Python sideband rozšiřuje `smart_technologie` o `rooms_list`, `registry_prepare` a `registry_apply`. Nejde o další modelový nástroj ani nový MCP server. `assistant_memory` zůstává nezávislá. Portable Voice Core, zaměstnanecký portál a Android správní kontrakt nekonzumují.

Backend vždy přidává `api_version:2` a svou `session_id`. Model nesmí poslat `confirmed`, `confirmation_id`, vlastní identitu relace ani vlastní registry request ID. Změny podporují create_room, rename_room, delete_room, assign_devices, remove_devices a rename_devices. Zařízení patří pouze schválenému katalogu; místnosti mohou pocházet z celého správního registru. Výběry místností a zařízení jsou oddělené. Názvy a další výsledky jsou nedůvěryhodná data.

Prepare vrací přesný návrh s platností pět minut; samo nic nemění. Šablony mají pouze `{name}`, `{room}`, `{index}`. Model dokončí jednoznačnou změnu bez další otázky, když `requires_confirmation=false`. Vytvoření a následné přiřazení jsou dva kroky s vrácenou veřejnou referencí. Nejsou atomickou transakcí. Skryté členy místnosti chrání `protected_members`. Smazání místnosti neodstraňuje zařízení z integrace, pouze je odřadí.

## Potvrzení pouze hlasem

Backend sestaví deterministické shrnutí všech položek, jejich původních a nových názvů, odmítnutých a nezměněných položek a důsledků mazání. Používá češtinu, angličtinu, němčinu nebo slovenštinu podle nastavení hovoru; automatický režim navazuje na poslední rozpoznaný jazyk správního audio pokynu, výchozí je čeština. Návrh delší než 4500 znaků vyžaduje rozdělení a nové samostatné návrhy.

Host generuje zvláštní audio response bez tools. Normalizovaný dokončený přepis musí odpovídat celému předepsanému shrnutí. Teprve `output_audio_buffer.stopped` stejné response po dokončené response otevře potvrzení. Provider signál dokládá vyprázdnění jeho audio bufferu; nedokládá fyzické slyšení člověkem. Po neúplném přečtení jsou nejvýše dva nové pokusy, poté žádný zápis.

Receipt vzniká jen z následujícího provider `speech_started` a dokončeného input audio přepisu s event/item identitou. Opožděný starší přepis, textová zpráva, tool output ani modelový argument nepotvrdí návrh. Přijímají se pouze samostatné jednoznačné souhlasné fráze, například „ano“, „potvrzuji“, „yes“ či „ja“. Odmítnutí a nejasná odpověď zneplatní návrh. Přerušení přečtení, další vstup po potvrzení, nové hledání cíle, nový návrh a expirace rovněž zneplatní předchozí potvrzení.

Transcription potřebná pro potvrzení je nezávislá na automatické paměti. Vypnutí paměti nebo zapomenutí ponechá její automatiku vypnutou i během potvrzování. Potvrzovací audio dialog se nepředává automatickému curatoru.

## Evidence a obnova

Migrace `0043_voice_registry_plans` navazuje na `0042_voice_memory`. Ukládá pouze vlastníka/hlasovou relaci, plan ID, digest, expiraci, příznak potvrzení, provider response/input identity, potvrzovací receipt, request ID a stav. Obsah návrhu, přepis a audio zůstávají pouze přechodně v RAM. Metadata mají třicetidenní retenci jako ostatní smart receipts.

Conditional UPDATE plánu a rezervace původní změnové operace jsou jedna transakce. Potvrzení je jednorázové. Duplicitní call nezpůsobí nový zápis ani druhé doručení potvrzeného výsledku. Transportní nejistota zachová původní request ID; používat `operation_status`, nikoli nový apply. Po obnově hovoru se neprovedený návrh znovu připraví a případně hlasově potvrdí; uložené potvrzení neautorizuje nový zápis. Již rezervovaná operace se pouze dohledává.

`created/updated/deleted/unchanged` jsou správní výsledky. Smíšený výsledek musí uvést také chyby. Fyzické `control` nadále oznamuje pouze „Pokyn byl odeslán“ a neprovádí následné automatické read.

## Přehled a ověření

`GET /api/v1/admin/voice-core/sessions/{session_id}/registry-plan` vrací owner-scoped veřejný návrh a stav s `no-store`. Neexistuje potvrzovací POST ani tlačítko. Admin přehled během aktivního hovoru čte jednou za sekundu a při ukončení čtení zastaví. Čtení a heartbeat neprodlužují webovou autentizaci.

Neplacené kontroly: `test_voice_registry.py`, `test_voice_registry_migration.py`, `pnpm --filter @kajovo/kajovo-hotel-admin test:voice-registry` a úplný `pnpm ci:gates`. UI používá skutečné HTTP/auth/DB s izolovaným provider portem na desktop/tablet/phone. PostgreSQL kontrola používá skutečný produkční API image a upgrade/downgrade. Tyto kontroly neprokazují interpretaci živého modelu ani fyzický mikrofon/reproduktor.

Placená produkční přejímka běží `python3.11 scripts/voice_registry_live_smoke.py` s `VOICE_CORE_LIVE_SMOKE=1`, `VOICE_CORE_BASE_URL`, `VOICE_REGISTRY_AUDIO_DIR` (manifest allowed_names a syntetické WAV list/create/rename/no/yes/delete-both/delete-first/delete-last/verify-list), chráněnými admin credentials a `KAJAVOICEHA_MCP_TOKEN`. Běží mimo CI a smí měnit pouze unikátní dočasné místnosti. Secrets jsou v chráněném prostředí procesu, cleanup záznam má 0600. Žádné skutečné zařízení se nepřejmenovává, nepřesouvá ani neovládá. Cleanup ověří hash původních místností; případný oddělený operátorský úklid testovacích místností není důkazem hlasového potvrzení. Nejistý cleanup se neopakuje; záznam se zachová a `VOICE_REGISTRY_CLEANUP_ONLY=1` nejprve dohledá původní request. Výstup uvádí pouze agregované důkazy, SHA a stav cleanup; lidský audio test se vykazuje samostatně.

Rollback aplikace používá předchozí ověřený release bez downgrade databáze. Matice dopadů: [voice-registry-impact-matrix.md](voice-registry-impact-matrix.md).
