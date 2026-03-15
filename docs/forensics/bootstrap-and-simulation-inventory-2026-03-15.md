# Inventar bootstrapu a simulaci (2026-03-15)

Datum: 2026-03-15
Repo root: `C:\GitHub\kajovo-hotel-monorepo`
Typ dokumentu: autoritativni doplnkovy inventar k runtime truth SSOT
Status: aktivni

## Ucel

Tento dokument doplnuje [runtime truth SSOT](/C:/GitHub/kajovo-hotel-monorepo/docs/forensics/runtime-truth-ssot-2026-03-15.md).

Jeho cil je striktne oddelit:

- produkcni runtime kod,
- legitimni bootstrap domeny,
- compat vrstvy,
- test-only simulace,
- seed a smoke helpery.

Tento dokument neni seznam produkcnich bugu. Je to inventar mist, ktera by pri povrchnim auditu mohla byt mylne oznacena jako fake runtime chovani.

## Klasifikace

1. `PRODUCTION_RUNTIME`
   Produkcni chovani, ktere je soucasti bezneho provozu.
2. `LEGITIMATE_BOOTSTRAP`
   Bootstrap tok legitimni pro danou domenu, ale mimo bezny uzivatelsky provoz.
3. `COMPAT_LAYER`
   Vrstva kompatibility nebo tolerance legacy stavu.
4. `TEST_ONLY_SIMULATION`
   Mock, fake klient, route interception nebo simulovany seed urceny jen pro test.
5. `HISTORICAL_EVIDENCE`
   Historicka nebo forensic evidence mimo aktualni runtime.

## Inventar

### 1. Device provisioning

- Kategorie: `LEGITIMATE_BOOTSTRAP`
- Soubory:
  - [apps/kajovo-hotel-api/app/api/routes/device.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/api/routes/device.py)
  - [apps/kajovo-hotel-api/app/api/schemas.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/api/schemas.py)
  - [packages/shared/src/generated/client.ts](/C:/GitHub/kajovo-hotel-monorepo/packages/shared/src/generated/client.ts)
- Popis:
  Device provisioning pouziva `bootstrap_key`.
  Jde o legitimni bootstrap domenu, ne o fake identitu nebo fake data v uzivatelskem runtime.
- Aktualni ochrana:
  Runtime uz nema implicitni default secret.
  Bez explicitni konfigurace registrace selze transparentne.

### 2. SMTP settings compat read

- Kategorie: `COMPAT_LAYER`
- Soubor:
  - [apps/kajovo-hotel-api/app/api/routes/settings.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/api/routes/settings.py)
- Popis:
  `_fallback_smtp_settings_read` toleruje malformed nebo legacy zaznam.
  Tato vrstva neslouzi k predstirani funkce SMTP, ale k editovatelnosti a obnoveni starych zaznamu.

### 3. E2E seed SMTP data

- Kategorie: `TEST_ONLY_SIMULATION`
- Soubor:
  - [apps/kajovo-hotel-api/app/tools/e2e_seed.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/tools/e2e_seed.py)
- Popis:
  Seeduje `mock.smtp.local`, `mock-user` a souvisejici test data.
  Tento soubor neni dukaz produkcni SMTP integrace a nesmi byt tak interpretovan.

### 4. Breakfast runtime smoke

- Kategorie: `TEST_ONLY_SIMULATION`
- Soubor:
  - [scripts/run_breakfast_runtime_smoke.py](/C:/GitHub/kajovo-hotel-monorepo/scripts/run_breakfast_runtime_smoke.py)
- Popis:
  Pouziva `_FakeImapClient` a synteticky PDF payload.
  Script overuje scheduler pipeline a artefakty, ne realne mailbox spojeni.

### 5. Frontend Playwright route mocks

- Kategorie: `TEST_ONLY_SIMULATION`
- Soubory:
  - [apps/kajovo-hotel-web/tests](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-web/tests)
  - [apps/kajovo-hotel-admin/tests](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-admin/tests)
- Popis:
  `page.route`, `route.fulfill`, `route.fallback` a `mockAuth` jsou testovaci simulace.
  Zeleny Playwright beh sam o sobe neni dukaz live-runtime pravdivosti.

### 6. Historical forensic evidence

- Kategorie: `HISTORICAL_EVIDENCE`
- Soubory:
  - [docs/forensic-audit-2026-03-11-deep.md](/C:/GitHub/kajovo-hotel-monorepo/docs/forensic-audit-2026-03-11-deep.md)
  - [docs/remediation-plan-2026-03-11-by-module.md](/C:/GitHub/kajovo-hotel-monorepo/docs/remediation-plan-2026-03-11-by-module.md)
  - [docs/remediation-task-breakdown-2026-03-11.md](/C:/GitHub/kajovo-hotel-monorepo/docs/remediation-task-breakdown-2026-03-11.md)
- Popis:
  Tyto dokumenty slouzi jako historicka evidence a casova stopa.
  Nejsou autoritativnim current-state zdrojem.

## Pravidla interpretace

- `LEGITIMATE_BOOTSTRAP` neni automaticky bug.
- `TEST_ONLY_SIMULATION` neni produkcni runtime, ale musi byt jasne oddelena od forenznich tvrzeni o realnem provozu.
- `COMPAT_LAYER` neni fake operace, dokud nevyrabi nahradni identitu, data nebo uspech.
- Za autoritativni current-state zdroj se povazuji pouze:
  - [docs/Kajovo_Design_Governance_Standard_SSOT.md](/C:/GitHub/kajovo-hotel-monorepo/docs/Kajovo_Design_Governance_Standard_SSOT.md)
  - [docs/forensics/runtime-truth-ssot-2026-03-15.md](/C:/GitHub/kajovo-hotel-monorepo/docs/forensics/runtime-truth-ssot-2026-03-15.md)
  - tento inventar bootstrapu a simulaci

## Otevrene ukoly

1. Udrzovat tento inventar pri kazdem novem smoke scriptu, seeding helperu nebo compat vrstve.
2. Pri release auditu vzdy oddelit live proof od mocked proof.
3. Nepridavat nove test-only simulace bez jasneho oznaceni v kodu nebo dokumentaci.
