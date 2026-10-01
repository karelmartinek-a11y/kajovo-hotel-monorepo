# CI gates

CI Gates je jediný automatický validační graf pro main a PR. CI Core se spouští pouze při pull_request a volá tentýž reusable workflow; push do pracovní větve nevytváří druhý totožný běh. Full a Release jsou ruční plné diagnostiky.

## Rozsah a závislosti

První job vždy vypočítá rozsah pomocí `scripts/ci_scope.py` z ověřeného base/head diffu. Selektivní rozsah je povolen pouze nad předkem s ověřeným úspěšným exact-main CI ; tento důkaz potvrzuje pouze testy, nikoli přijetí produkčního runtime. Neověřený nebo zrušený předek, neznámý diff, chybějící historie, workflow, toolchain, společná infrastruktura nebo bezpečnostní změna vyvolají plný relevantní rozsah. Výjimku pro historické neaktivní texty mají pouze docs/archive a docs/notes; aktuální runbooky a kontrakty mají full scope. Cílené UI jsou pouze prezentační CSS/SCSS a rastrové assety; spustitelné TS/JS, JSON a SVG mají full scope. API a sdílené kontrakty zahrnují testy skutečných Android spotřebitelů; Android UI/emulátor a vydání zůstávají samostatné.

`fast-checks` ověří Ruff, TypeScript a regresní kontrakty CI před spuštěním drahých jobs. `guardrails` zachovává text integrity, manifest, runtime, legacy, policy, tokeny, brand, signage a překlady. `contract` ověřuje OpenAPI a generovaný klient. Web smoke a admin smoke mají v rutinním grafu každý jeden běh. `visual-web` a `visual-admin` běží samostatně s úplným rozsahem scénářů a viewportů; admin ponechává workers: 1. `unit-tests` a `portable-voice-core` běží podle doložených závislostí. Android consumer testy/buildu/emulátoru jsou v samostatném Android CI, které se spouští i při změně sdíleného API; jeho výsledek neblokuje webový deploy. `api-runtime-image` vždy připraví ověřené obrazy aktuálního SHA, i pro historické poznámky; každý release tak má vlastní ověřený runtime artefakt.

`release-gate` běží always(), ověřuje scope i výsledky všech potřebných jobs a odmítá failure, cancelled, chybějící výsledek i skipped povinné sady. Skipped je přípustné pouze pro sadu, kterou platný router označil za nerelevantní. Artefakt váže výsledek na přesné SHA a deklaruje deploy_required. Periodická stability sada třikrát spouští kompletní admin smoke; nezastupuje povinný rutinní release gate.

## Deterministické prostředí

Node setup používá packageManager pnpm@10.34.4, cache pnpm store a frozen lockfile. Playwright jobs používají připravený image odpovídající verzi v pnpm-lock.yaml; nestahují opakovaně systémové balíčky. Python instalace a produkční API Dockerfile používají stejné requirements/constraints.txt a závislosti z API pyproject.toml. Ruff profil neinstaluje celý backend; Python unit job nepotřebuje Node.

Při lokálním prvním běhu nainstaluj Chromium explicitně pomocí `pnpm --filter @kajovo/kajovo-hotel-web test:install-browsers` a podle potřeby také další browser projekty. Playwright failure uchovává trace a reporty; workflow je uploaduje i při selhání. CI používá pouze lokální testovací účty, nikoli produkční admin secrets.

## Review a nasazení

CI validační graf běží bez produkčních secrets a bez čekání na hotové release review. Povinné review ověřuje produkční prepare/deploy gate až po úspěšném exact-main CI; jeho chybějící nebo stale důkaz blokuje nasazení, nikoli provedení testů.

Review je vázané na výsledný zdrojový fingerprint a ověřený rozsah od důvěryhodného přezkoumaného předka. Malé izolované změny používají cílený profil; společný protokolový, bezpečnostní nebo deploy zásah zachovává šest nezávislých oblastí nad hotelovým zdrojem. JSON konzistence není autentizací skutečného provedení review. Změna zdroje po review důkaz zneplatní.

CI sestaví API/admin/web images jednou, ověří importy, samostatnou Voice policy i skutečný proxy řetězec a uloží image archiv s manifestem SHA/image IDs/checksum. Deploy přijímá právě tyto obrazy a na serveru nesestavuje náhradní verzi. Úspěšné aktuální main CI Gates automaticky spustí exact-main CI/review gate, ověření obrazu a vlastní hotelový root controller. Root worker a runtime fence chrání změny; nezávislý deadline obnovuje předchozí runtime při selhání nebo neprovedené acceptance. Živé funkční kontroly musí předcházet acceptance. CI a automatický deploy nemají placená Voice volání. Viz [deploy runbook](how-to-deploy.md).

Automatické validace stejného ref mohou rušit starší rozpracovaný běh; ruční diagnostika má vlastní group. Produkční nasazení se novým pushem neruší.
