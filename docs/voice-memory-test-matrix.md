# Matice důkazů hlasové paměti

Běžné testy jsou deterministické a nevolají placené API. Názvy níže odkazují na `apps/kajovo-hotel-api/tests/test_voice_memory.py` (M), `test_voice_memory_protocol.py` (P), `test_voice_memory_migration.py` (DB), admin `tests/voice-memory.spec.ts` (UI) a `scripts/verify_voice_memory_postgres.py` (PG). Přesné výsledky konkrétního běhu uvádí release evidence; tento dokument popisuje trvale ověřované oblasti, nikoli živý OpenAI důkaz.

| # | Požadavek | Automatizovaný důkaz |
|---|---|---|
| 1 | memory CRUD | M test_memory_crud_remember_correct_deactivate_forget |
| 2 | remember/forget | M stejné + test_forget_blocks_late_curator_and_purges_summaries + test_forget_deletes_automatic_derivatives_and_their_history |
| 3 | rozpor | M CRUD odmítne duplicitní konfliktní remember a update uloží revision |
| 4 | note create | M test_note_full_structured_lifecycle; P notes sequence |
| 5 | rename | M note lifecycle; UI |
| 6 | add/insert | M note lifecycle; UI/P |
| 7 | remove | M note lifecycle; P zůstávají pouze žárovky |
| 8 | edit | M note lifecycle; UI |
| 9 | archive/delete | M note lifecycle; cascades; UI delete |
| 10 | nejednoznačnost | M test_ambiguous_note_title_requires_exact_target |
| 11 | principal isolation | M test_two_stable_principals_and_new_login |
| 12 | CSRF | M test_rbac_and_csrf_all_endpoints |
| 13 | RBAC | M stejné; voice session auth zůstává v test_voice_core |
| 14 | optimistic conflict | M CRUD/note/settings; PG |
| 15 | provider retry | M test_durable_retry_restart_and_digest_conflict; P notes retry |
| 16 | reconnect/restart | P test_notes_protocol_sequence_and_retry_after_bridge_restart |
| 17 | budget | M test_context_budget_relevance_and_bounded_selection |
| 18 | selection/relevance | M stejné; P preference/project next session |
| 19 | bounded SQL | M context s 200 položkami; žádná neomezená query contextu |
| 20 | bez MCP | P test_phrase_to_function_db_confirmed_result_and_voice_continuation_without_mcp |
| 21 | MCP outage | P test_mcp_outage_and_memory_outage_keep_ordinary_voice_enabled + test_stalled_mcp_initialization_does_not_block_memory |
| 22 | memory outage | P stejné, output unavailable a následná response.create |
| 23 | injection | M test_prompt_injection_is_only_note_data; P datový user-role context; backend nemá SQL operaci |
| 24 | no raw DB transcript | M test_curator_completed_turn_summary_privacy_cleanup sentinel; P project |
| 25 | no transcript log | M stejné + test_sensitive_payloads_never_echo_to_logs_or_audit |
| 26 | no audio persistence | M test_transient_bounds_duplicate_events_and_audio_ignored; portable telemetry exclusions |
| 27 | session summary | M curator; P close paths a project next session |
| 28 | brief summary | M 600/1200 bounds + sentinel; P dlouhý rozhovor vs stručné continuation |
| 29 | transient cleanup | M close/reset/bounds; P Stop/timeout/disconnect/shutdown |
| 30 | UI CRUD | UI skutečné API, reload, desktop/tablet/phone, nulový overflow |
| 31 | API/OpenAPI | M test_openapi_exposes_exact_closed_contract; pnpm contract:check |
| 32 | previous migration | DB upgrade0041→0042→downgrade→upgrade; PG stejný upgrade |
| 33 | SQLite | DB a všechny M/P API testy |
| 34 | PostgreSQL | PG produkční API image, skutečná PostgreSQL16.4; revisions/order/retries/cascades |

Dodatečné M testy ověřují strict Responses store:false/no tools, cancelled assistant text, datum Europe/Prague, vypnutí automatiky, hard limit lístku, timeout/rate cap a opožděnou známou transcription po invalidaci. Portable runtime test ověřuje generic connection readiness oddělenou od nedostupných technologií. Privacy assertions používají umělé sentinelové texty, nikoli reálná tajemství.

| Scénáře hlasu | Důkaz a hranice |
|---|---|
| A–D preference remember/search/deactivate/forget | M CRUD; P skutečný sideband write + další RTC session lookup. Fake model mapuje frázi na kontrakt; jazykovou interpretaci živého modelu neprokazuje. |
| E–K lístky a položky | M plný lifecycle/ambiguous; P voice create/add/rename/remove/restart, UI reálný CRUD. |
| L–O minulá témata, rozhodnutí, projekty a continuation | M summary search topics + Prague dates; P projektový summary v další session. Retrieval společně vrací content/decisions/open_points/continuation. |
| Acceptance 1 | P preference v nové RTC session a její Memory Context + function search. |
| Acceptance 2 | P Nákup→žárovky+baterie→Nákup hotel→remove baterie; výsledek pouze žárovky. |
| Acceptance 3 | P dlouhý raw dialog→curated summary→nová RTC session lookup; bez raw dialogu. |
| Acceptance 4 | P bez tokenu a MCP outage; memory operace potvrzené. |
| Acceptance 5 | P backend exception→unavailable output→potvrzená response.create; ordinary generation zůstává zapnutá. |

Živá modelová interpretace, provider paid transport, fyzický mikrofon a náhlý kill se odlišují od fake protokolu. Bez opt-in se paid smoke vynechá; RAM při náhlém kill může ztratit poslední dávku. Automatická extrakce je modelová a privacy filtr heuristický; lidská oprava/deaktivace/zapomenutí zůstává k dispozici.
