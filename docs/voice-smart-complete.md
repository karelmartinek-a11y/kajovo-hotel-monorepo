# Úplné Smart výběry a ověřené komponenty

Host použije response_mode:complete jen po detekci enumu v MCP schématu. Původní MCP obslouží interním stránkováním read-only operací; lokální slovníky se přemapují bez záměny cNN/rNN/rows. Mutace se nepřepisují a neopakují. Mění se pouze transport čtení. Jedna relace zachovává již otevřené MCP spojení a schéma.

Společné povinné texty jsou v balíčku dagmar_server/smart_instructions.json, shodné s fixtures standalone MCP. Po control následuje operation_status původního request_id a read celého dotčeného výběru. Zapnutí hlavního výstupu se nesmí zaměnit se zabezpečením pojistky; parametry a význam funkcí pocházejí z konkrétního describe. Host status rozpracované operace sleduje nejdříve za .5s, pak 1s, dále nejvýše jednou za 2s a nejdéle 30s. Uncertain se automaticky neopakuje. Dokončený status nevyvolává čekání.

Existující ready_responses/continuations_queued a potvrzení doručení již spouští právě jedno navázání po výsledku, bez pevné prodlevy. Tyto mechanismy, Mail, paměť, barge-in a registry audio confirmation zůstávají zachovány. Produkční důkaz je oddělen od izolovaných testů a od skutečné odezvy modelu/hlasu.

## Matice dopadů
Zdroj: Smart schéma/transport/instrukce aktualizovat. Testy/fixtures: complete a legacy stránky, počty/dictionary refs, polling identity, chyby, literal instructions aktualizovat. CI/release gates: stávající plné kontroly beze změny. Dokumentace a AGENTS: aktualizovat. API/OpenAPI/UI a DB: ověřit beze změny, žádná veřejná HTTP změna/migrace. Docker package-data: JSON již balen, ověřit v runtime image. Mail a business moduly: nedotčeny. Nasadit kompatibilní adaptér před standalone MCP; rollback zachová živá data a identity.
