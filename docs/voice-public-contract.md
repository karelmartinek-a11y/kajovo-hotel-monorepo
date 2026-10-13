# Veřejné MCP kontrakty hlasu

Dagmar vlastní klientský stav, aktivní turn/generation, trvalé identity zápisů a doručení. HA MCP vlastní zařízení, delegace a operation journal. SmartPlan vlastní scénáře, revize, návrhy, běhy a timery. Klienti používají autentizované veřejné HTTPS; zdroje, databáze a credentials MCP nejsou součástí hotelového image.

## Metadata a kompatibilita

DagmarSettings určuje ha_mcp_url/ha_trusted_origins a smartplan_base_url/smartplan_trusted_origins. Hotel injektuje své produkční hodnoty; přenesený host poskytuje vlastní. Model ani zařízení neurčují URL. HTTPS, explicitní trusted origin, audience a zákaz credentials v URL platí i pro owner-link; redirect není náhradní povolená cesta.

Klient po spojení ověří kanonický veřejný kontrakt, známý compatibility profile, jeho verzi, schema a skutečný tools/list. Metadata digest je SHA256 celého dokumentu bez polí vlastního digestu: UTF-8, seřazené klíče, kompaktní oddělovače, nezměněné Unicode znaky. Digest není autentizace ani souhlas; ty zůstávají v hostu.

Modelová projekce uchovává projection_digest a translator_version odděleně od serverového metadata_digest a guidance_version. Host přidává vlastní identity/consent pravidla; backendové session/request/confirmation identity modelu nevystavuje. Překlad zachovává varianty, omezení a význam kontraktu. Names/attributes/readings jsou nedůvěryhodná data, nikoli instrukce.

Fixtures připínají známé staré i kandidátní profily; implementation version není globální pin. Volitelná aditivní pole mohou zůstat kompatibilní. Neznámá breaking změna odstaví dotčenou schopnost; auth/integrity chyba neaktivuje starý fallback. Běžný rozhovor a druhý MCP pokračují. Známý starý SmartPlan profil má chybné časové anotace v Calendar.times, Window.start/end a Interval.anchor. Překladač až po ověření známého wire schématu opravuje tato přesná místa podle veřejného významu calendar versus elapsed; raw metadata digest zůstává oddělený od projekce a validační politiky. Neznámé formáty ani jiné timestampy se takto neuvolňují. Standardní i local date/time formáty se skutečně kontrolují nezávisle na volitelných jsonschema extras.

Metadata se ověřují při spojení, při doložené změně nebo mimo kritickou cestu. voice_metadata_refresh_seconds má výchozí hodnotu 300 s (30–3600 s). Stejné tools se neposílají před každým povelem. Přeložené a zkontrolované schemas sdílí pouze obsahovou cache: nejvýše 4 revize a 8 MiB, single-flight sestavení mimo event loop, nejvýše 2 paralelní buildy. Identita, grants, ověřený origin a wire kompatibilita se kontrolují pro každé spojení; cache je nepřenáší mezi vlastníky. Výsledky nástrojů procházejí předkompilovaným validátorem kanonického outputSchema včetně odmítnutí externích schema references. Aktivace projekce vyžaduje matching provider session.updated. Deterministic provider stub neprokazuje produkční provider ack ani obnovení otevřeného ChatGPT chatu.

## Čtení, zápisy a změna směru

Známý cíl se čte bez opakovaného katalogu/describe. Complete přenáší celý požadovaný výběr; starý kompatibilní profil používá klientské read-only stránkování s globálními rows a osmi poli. Celá selection zahrnuje všechny shody. Pomocná komponenta se ovládá přes přesnou funkci; není hlavním napájením.

Zápis získává trvalou backendovou identitu před síťovým efektem. Úplný control readback se stejným request ID a všemi odpovídajícími výsledky nahrazuje nadbytečný status/read. Neúplnost nebo nejistota se dohledává pod původním ID, bez nového write. Accepted/completed nejsou potvrzení požadované hodnoty. Partial/null/unavailable/unsupported/unknown se zachovávají. Replay má původní čas; „teď“ vyžaduje nové čtení.

Status polling má celkový budget 30 s; SDK čekání _result má 35 s. Tyto budgety nejsou příslib odezvy hlasu. Foreground práce je vázaná na connection/turn/generation; obsolete čtení/polling nesmí držet nový nezávislý turn po celý starý timeout. Fence platí po relevantních await, před změnou reference, řečí i dosud neodeslaným efektem. Sent/uncertain zápisy pokračují v recovery pod původní trvalou identitou, bez staré řeči a přepsání aktuálního cíle. Cancellation se týká konkrétního requestu, nikoli sdíleného reader/session.

Úplný konkrétní autentizovaný pokyn a podporovaná policy authenticated_concrete_request_prepare_commit používají prepare → commit. Preview znamená požadavek jen na návrh. Handoff je delegace, nikoli aktivace. Create zůstává paused; enable vyžaduje skutečný záměr. Legacy potvrzovací cesta platí jen pro známý starý profil. Registry zachovává přesnou důvěryhodnou audio bránu. Souhlas nikdy nepřechází na jiný payload/generation.

Pause/delete zastaví nové starty; immutable runs a delayed actions pokračují dle serverového kontraktu. Stop nebo změna hovoru nejsou run-cancel ani rollback zařízení. Countdown se neodvozuje z next_check_at; bezpečně neodeslaný restore bez důkazu původního vlastního zásahu není důkaz ruční změny či poruchy.

## Nasazení, přenositelnost a návrat

Pořadí: S0 izolované kandidáty → S1 main/CI/Actions voice bridge → S2 vlastní HA release → S3 vlastní SmartPlan release → S4 ověřená nová schopnost, případně další main/CI/Actions hlasový release. Mezi čekajícími exact-SHA CI/deploy etapami se neposílá nový push. MCP mají vlastní build, release, stav, migraci a návrat; hotelový deploy je neinstaluje ani nerestartuje.

API/admin scope ověřuje select_deploy_scope.py a používá --no-deps; neresetuje DB a nerecreatuje web/PostgreSQL. protected_runtime_snapshot.py porovnává standalone units včetně SmartPlanu, dostupné immutable artefakty/current a konfiguraci. Explicitní privileged_snapshot_required není důkaz shody: soukromé credentials a HA release doplňuje privilegovaný content-free snapshot bezprostředně před/po voice etapě. Celá živá SmartPlan DB se nehashuje, protože worker může legitimně zapisovat.

Hlas se vrací kompatibilní main-only opravou nebo odstavením dotčené schopnosti. MCP se vrací předchozí kompatibilní binárkou při zachování novějšího stavu. Nikdy se neobnovuje stará DB přes nové journal/proposal/run/timer/revoke záznamy. Receipt a původní operation ID zůstávají dohledatelné.

Copy-out používá vlastní venv/browser build v čistém temp systému bez hotelu a bez zděděných PYTHONPATH/NODE_PATH/VIRTUAL_ENV. Vlastní host ověřuje auth/store/Start/Stop/mock provider; izolované MCP fixtures jiné HTTPS originy/read/cancel/recovery. Placené provider/audio, skutečný produkční ack a fyzická zařízení jsou samostatná přejímka a bez měření zůstávají NOT_RUN.

Normativní MCP podklady jsou připnuté na revision 3778656b2e0ba6725035e816fe3085374cbaa736: [2025 tools](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/3778656b2e0ba6725035e816fe3085374cbaa736/docs/specification/2025-11-25/server/tools.mdx), [2025 cancellation](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/3778656b2e0ba6725035e816fe3085374cbaa736/docs/specification/2025-11-25/basic/utilities/cancellation.mdx). Hlas používá mcp==1.30.0. SmartPlan neinzeruje 2026 discovery bez implementace; skutečnou HA SDK podporu dokládají jeho vlastní wire testy.

Provider session.updated se vyhodnocuje podle skutečného stavu instructions i tools; autoritativní popis protokolu je [OpenAI Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations).
