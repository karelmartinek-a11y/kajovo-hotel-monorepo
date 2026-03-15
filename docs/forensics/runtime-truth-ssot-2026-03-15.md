# Runtime Truth SSOT Audit (2026-03-15)

Datum: 2026-03-15
Repo root: `C:\GitHub\kajovo-hotel-monorepo`
Typ dokumentu: autoritativni forenzni audit aktualniho stavu
Status: aktivni SSOT pro runtime pravdivost, simulace, bootstrap a auditni zbytky

## Vazba na zavazne governance dokumenty

Tento audit je autoritativni jen pro runtime pravdivost, simulace, bootstrap vrstvy a otevrene forenzni nalezy.

Pro zavazna pravidla znacky, UI, ergonomie, povinnych stavu view a zakazu nehotovych nebo fake vystupu plati:

- `docs/Kajovo_Design_Governance_Standard_SSOT.md`
- `docs/forensics/bootstrap-and-simulation-inventory-2026-03-15.md`

Stare closeout dokumenty s prehnane finalnim jazykem byly z repozitare odstranene a nesmi byt znovu vytvarene jako paralelni autorita.

## Ucel

Tento dokument nahrazuje silna a dnes uz nepresna tvrzeni v drivejsich auditnich closeout dokumentech.
Jeho cil je odlisit:

- aktivni produkcni runtime problemy,
- zavadejici UX nebo observability,
- test-only simulace,
- bootstrap a compat vrstvy,
- legacy a historicke dokumenty,
- oblasti, ktere uz nejsou aktivnim problemem.

Tento dokument nesmi tvrdit vic, nez je dolozene zdrojovym kodem, testy nebo explicitnim runtime dukazem.
Simulace, bootstrap helpery a compat vrstvy se posuzuji spolu s doplnkovym inventarem:

- `docs/forensics/bootstrap-and-simulation-inventory-2026-03-15.md`

## Metodika

Byl proveden pruchod nad:

- `apps/**`
- `packages/**`
- `scripts/**`
- `docs/**`
- `legacy/**`

Pruchod kombinoval:

- hruby grep na tokeny `fallback`, `mock`, `placeholder`, `seed`, `bootstrap`, `StateSwitcher`, `StateMarker`, `__KAJOVO_TEST_NAV__`, `?state=`, `anonymous`, `offline`, `maintenance`, `404`, `no-op`, `stub`, `fake`,
- rucni kontrolu vybranych produkcnich souboru,
- oddeleni runtime code path od testu, tooling, docs a legacy evidence.

Celkovy pocet prohledanych textovych souboru v auditu: `1183`

## Klasifikace

Pouzite kategorie:

1. `ACTIVE_RUNTIME`
   Produkcni kod nebo produkcni konfigurace, ktera muze zkreslit realny provoz nebo je technicky nepresna.
2. `MISLEADING_UX`
   Stav je backendove realny, ale UI nebo wording uzivatele vede k chybnemu zaveru.
3. `TEST_SIMULATION`
   Simulace, mocky nebo route interception pouzite v testech.
4. `BOOTSTRAP_OR_COMPAT`
   Bootstrap, seed, compat nebo legacy bridge vrstva, ktera neni bezne produkcni chovani, ale v repu stale existuje.
5. `DOC_DRIFT`
   Dokumentace tvrdi neco, co uz dnes neplati nebo je silnejsi, nez dovoluje evidence.
6. `HISTORICAL_OR_LEGACY`
   Historicky nebo legacy obsah, ktery neni fer pocitat jako bug noveho runtime.
7. `CLEARED`
   Historicky problem, ktery byl v produkcnim runtime odstranen a v tomto auditu nebyl potvrzen jako aktivni.

## Exekutivni verdict

Plati tyto zaveri:

- Repo neni v rezimu "desitky aktivnich produkcnich fake funkci".
- Repo stale neni ve stavu "forenzne plne docistene a pravdive uzavrene".
- Existuji aktivni produkcni nesoulady a nepresnosti.
- Test/tooling vrstva je stale ve velkem simulační.
- Klicove casti dokumentace stale preceňuji uroven uzavreni remediation.

## Potvrzene nalezy

### 1. Aktivni produkcni runtime nebo produkcni drift

#### 1.1 Web admin users panel neni v synchronizaci s admin app
- Kategorie: `ACTIVE_RUNTIME`
- Soubor: [apps/kajovo-hotel-web/src/admin/UsersAdmin.tsx](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-web/src/admin/UsersAdmin.tsx)
- Popis:
  Webova admin surface stale pouziva starsi reset-link UX a obecne hlasky typu "Pokud ucet existuje...".
  Admin app uz ma prisnejsi model zalozeny na explicitnim vysledku serveru.
- Riziko:
  Rozdilne chovani dvou povrchu stejne domeny.
- Stav:
  Otevrene.

#### 1.2 SMTP operational status ma nepresny datovy model
- Kategorie: `ACTIVE_RUNTIME`, `MISLEADING_UX`
- Soubor: [apps/kajovo-hotel-api/app/api/routes/settings.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/api/routes/settings.py)
- Popis:
  `last_test_connected` a `last_test_send_attempted` se odvozuji z `last_test_success`.
  Backend tedy neumi pravdive rozlisit:
  - navazani spojeni bez uspesneho odeslani,
  - realny pokus o odeslani, ktery skoncil chybou,
  - uplne neprovedeny test.
- Riziko:
  Admin panel muze zobrazovat technicky zjednoduseny nebo zavadejici stav SMTP.
- Stav:
  Otevrene.

#### 1.3 Device bootstrap key uz nema runtime default secret
- Kategorie: `CLEARED`, `BOOTSTRAP_OR_COMPAT`
- Soubory:
  - [apps/kajovo-hotel-api/app/config.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/config.py)
  - [apps/kajovo-hotel-api/app/api/routes/device.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/api/routes/device.py)
- Popis:
  `device_bootstrap_key` uz nema default `change-me-device-bootstrap-key`.
  Pokud neni explicitne nastaveny v ENV, registrace zarizeni konci transparentni chybou `503 Device bootstrap key is not configured`.
- Riziko:
  Bootstrap domena zustava legitimni soucasti produktu, ale uz neni kryta implicitnim default secretem.
- Stav:
  Uzavreno v runtime 2026-03-15.

#### 1.4 Historicka `anonymous` vetev byla odstranena z portal guardu
- Kategorie: `CLEARED`
- Soubor: [apps/kajovo-hotel-web/src/portal/PortalRoutes.tsx](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-web/src/portal/PortalRoutes.tsx)
- Popis:
  Portal guard uz explicitne nepocita s `auth.userId === 'anonymous'`.
  Neautentizovany nebo neportalovy stav se ridi pouze skutecnym auth resultatem a `actorType`.
- Riziko:
  Odstranen zbytek stareho pseudoidentity modelu v produkcnim routingu.
- Stav:
  Uzavreno v runtime 2026-03-15.

### 2. Zavadejici UX nebo observability

#### 2.1 Obecne anti-enumeration texty jsou legitimni jen v nekterych floch
- Kategorie: `MISLEADING_UX`
- Soubor: [packages/shared/src/i18n/auth.ts](/C:/GitHub/kajovo-hotel-monorepo/packages/shared/src/i18n/auth.ts)
- Popis:
  Texty typu `Pokud ucet existuje...` jsou legitimni u forgot/hint flow.
  Stejny wording neni legitimni v admin operaci nad konkretne zvolenym uzivatelem.
- Riziko:
  Smiseni bezpecnostniho anti-enumeration patternu s admin operational UX.
- Stav:
  Otevrene na nekterych povrsich.

#### 2.2 Utility state dokumentace je sirsi nez aktualni runtime realita
- Kategorie: `MISLEADING_UX`, `DOC_DRIFT`
- Soubory:
  - [docs/module-ztraty-a-nalezy.md](/C:/GitHub/kajovo-hotel-monorepo/docs/module-ztraty-a-nalezy.md)
  - [docs/module-zavady.md](/C:/GitHub/kajovo-hotel-monorepo/docs/module-zavady.md)
  - [docs/module-sklad.md](/C:/GitHub/kajovo-hotel-monorepo/docs/module-sklad.md)
  - [docs/module-reports.md](/C:/GitHub/kajovo-hotel-monorepo/docs/module-reports.md)
- Popis:
  Docs stale popisuji sirokou matici `loading/empty/error/offline/maintenance/404`, ackoli cast drivejsich simulaci byla z runtime odstranena.
- Riziko:
  Dokumentace nafukuje nebo zkresluje realny modulovy model.
- Stav:
  Otevrene.

### 3. Test-only simulace

#### 3.1 MockAuth a route.fulfill jsou rozsahle napric frontend testy
- Kategorie: `TEST_SIMULATION`
- Soubory:
  - [apps/kajovo-hotel-web/tests](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-web/tests)
  - [apps/kajovo-hotel-admin/tests](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-admin/tests)
- Popis:
  Velka cast Playwright pokryti je stale zalozena na simulovanem auth a API.
- Riziko:
  Zeleny test suite sam o sobe neznamena live-runtime pravdivost.
- Stav:
  Otevrene, ale ocekavane.

#### 3.2 Auth smoke explicitne pracuje s mock transport mode
- Kategorie: `TEST_SIMULATION`
- Soubor: [apps/kajovo-hotel-admin/tests/auth-smoke.spec.ts](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-admin/tests/auth-smoke.spec.ts)
- Popis:
  Soubor obsahuje scenar `hint email flow returns stable response in mock transport mode`.
- Riziko:
  Test evidence nelze zaměňovat za dukaz realneho SMTP transportu.
- Stav:
  Otevrene, ale test-only.

#### 3.3 Breakfast runtime smoke pouziva fake IMAP klient
- Kategorie: `TEST_SIMULATION`
- Soubor: [scripts/run_breakfast_runtime_smoke.py](/C:/GitHub/kajovo-hotel-monorepo/scripts/run_breakfast_runtime_smoke.py)
- Popis:
  `_FakeImapClient` vraci synteticky e-mail s fake PDF.
- Riziko:
  Script nesmi byt interpretovan jako dukaz provozu nad realnou mailbox integraci.
- Stav:
  Otevrene, ale test-only.

### 4. Bootstrap, seed a compat vrstvy

#### 4.1 Device provisioning stale pouziva bootstrap koncept
- Kategorie: `BOOTSTRAP_OR_COMPAT`
- Soubory:
  - [apps/kajovo-hotel-api/app/api/routes/device.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/api/routes/device.py)
  - [apps/kajovo-hotel-api/app/api/schemas.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/api/schemas.py)
  - [packages/shared/src/generated/client.ts](/C:/GitHub/kajovo-hotel-monorepo/packages/shared/src/generated/client.ts)
- Popis:
  Device domena legitimne pouziva `bootstrap_key`.
- Riziko:
  Neni to fake runtime, ale musi byt vedeno jako bootstrap domena, ne jako cista bezbootstrapova cast produktu.
- Stav:
  Otevrene, legitimni bootstrap.

#### 4.2 SMTP settings route drzi compat fallback pro legacy/malformed zaznam
- Kategorie: `BOOTSTRAP_OR_COMPAT`
- Soubor: [apps/kajovo-hotel-api/app/api/routes/settings.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/api/routes/settings.py)
- Popis:
  `_fallback_smtp_settings_read` drzi editovatelnost i pri malformed nebo legacy DB stavu.
- Riziko:
  Compat vrstva muze komplikovat forenzni cteni stavu, ale neni to fake SMTP runtime.
- Stav:
  Otevrene, legitimni compat vrstva.

#### 4.3 E2E seed tool stale generuje mock SMTP data
- Kategorie: `BOOTSTRAP_OR_COMPAT`, `TEST_SIMULATION`
- Soubor: [apps/kajovo-hotel-api/app/tools/e2e_seed.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/tools/e2e_seed.py)
- Popis:
  Seeduje `mock.smtp.local`, `mock-user` a related hodnoty.
- Riziko:
  Musi byt v dokumentaci explicitne vedeno jako seed/test-only helper.
- Stav:
  Otevrene.

### 5. Dokumentacni drift a nepravdy

#### 5.1 Odebrany dokument `forensic-audit-2026-03-11-current-state.md` tvrdil vice, nez odpovidalo aktualnimu stavu
- Kategorie: `DOC_DRIFT`
- Stav dokumentu: odstraneny z repozitare 2026-03-15
- Popis:
  Dokument tvrdi:
  - ze system je plne realne provozovatelny,
  - ze P2 mezery jsou uzavrene,
  - ze SMTP status je priznan jako `smtp` vs `mock`,
  - ze repo je po cleanupu konzistentni.
- Riziko:
  Vytvari falesny pocit uzavrene forenzni remediation.
- Stav:
  Uzavreno odstraneni dokumentu; auditni pouceni zustava platne.

#### 5.2 Odebrane closeout dokumenty mely prehnane finalni jazyk
- Kategorie: `DOC_DRIFT`
- Soubory:
  - `docs/audit-remediation-final.md` - odstraneno z repozitare 2026-03-15
  - [docs/audit-gap-analysis.md](/C:/GitHub/kajovo-hotel-monorepo/docs/audit-gap-analysis.md)
- Popis:
  Jazyk closeout dokumentu je silnejsi nez aktualni evidence.
- Riziko:
  Auditor nebo vyvojar bez kontextu usoudi, ze repo je zavrene.
- Stav:
  Castecne uzavreno odstraneni mylnych closeout dokumentu; `audit-gap-analysis.md` zustava historicky analyzni material.

#### 5.3 Parity matrix sama priznava `PARTIAL` runtime proof
- Kategorie: `DOC_DRIFT`
- Soubor: [docs/feature-parity-matrix.csv](/C:/GitHub/kajovo-hotel-monorepo/docs/feature-parity-matrix.csv)
- Popis:
  `Users`, `Settings`, `Breakfast`, `Inventory`, `Reports`, `Issues`, `Lost&Found` stale nejsou plne runtime-proven.
- Riziko:
  Jakykoli text o plnem closure je s timto souborem v rozporu.
- Stav:
  Otevrene.

### 6. Historicke nebo legacy nalezy, ktere nejsou aktivnim bugem noveho runtime

#### 6.1 Legacy strom obsahuje placeholdery, fallbacky a compat vrstvy
- Kategorie: `HISTORICAL_OR_LEGACY`
- Adresar: [legacy](/C:/GitHub/kajovo-hotel-monorepo/legacy)
- Popis:
  Legacy frontend/backend obsahuje placeholdery, 404 fallbacky, compat CSS vrstvy, seed poznamky a historicke implementace.
- Riziko:
  Pokud se grep vystupy nectou s kontextem, nafukuje to pocet "problemovych" nalezu.
- Stav:
  Ocekavane.

#### 6.2 Historicke `docs/regen/**` a remediation docs nejsou aktualni truth source
- Kategorie: `HISTORICAL_OR_LEGACY`
- Adresare:
  - [docs/regen](/C:/GitHub/kajovo-hotel-monorepo/docs/regen)
  - starsi remediation a forenzni docs
- Popis:
  Jde o auditni stopu, ne o aktualni runtime truth.
- Riziko:
  Smiseni historical evidence s aktualnim stavem.
- Stav:
  Ocekavane.

## Cleared / nepotvrzene jako aktivni produkcni problem

Tyto body byly v minulosti auditovane, ale v tomto pruchodu nebyly potvrzeny jako aktivni produkcni problem:

- `__KAJOVO_TEST_NAV__` v produkcnim runtime
- `StateSwitcher` v produkcnim runtime
- `StateMarker` v produkcnim runtime
- query-driven `?state=` forcing v produkcnim runtime
- `MockEmailService` v produkcnim runtime
- `anonymous/recepce` fallback identita jako aktivni produkcni auth behavior
- inventory `seed-defaults` endpoint jako aktivni bezny produkcni flow

Poznamka:
Absence potvrzeni v tomto auditu neznamena, ze se token nikdy nevyskytuje v docs, testech nebo historical stopach.
Znamena pouze, ze nebyl potvrzen jako aktivni produkcni runtime behavior.

## Rozpor proti drivejsim tvrzenim

Nejvetsi rozpor proti drivejsim tvrzenim je tento:

- Drivejsi komunikace a cast closeout docs tvrdily nebo implikovaly, ze remediation je v zasade uzavrena.
- Aktualni evidence ukazuje:
  - aktivni produkcni drift stale existuje,
  - test evidencni vrstva je stale silne simulační,
  - docs nejsou srovnane s realitou.

Proto tento dokument prepisuje interpretaci stavu na:

`repo je po znacne remediation vlne, ale forenzni closure neni dokoncena`

## Prioritni plan napravy

### Vlna P0 - runtime pravdivost
1. Sjednotit [apps/kajovo-hotel-web/src/admin/UsersAdmin.tsx](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-web/src/admin/UsersAdmin.tsx) s admin app.
2. Opravit SMTP observability model v [apps/kajovo-hotel-api/app/api/routes/settings.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/api/routes/settings.py).
3. Doplňovat dalsi dukazy pro moduly vedene v parity matrix jako `PARTIAL`, aby se runtime truth neopiral jen o cileny audit a test-only evidence.
4. Doplňovat oddělenou evidenci legitimních bootstrap domén, aby se device provisioning nemíchal s dřívějšími runtime fallbacky.

### Vlna P1 - docs a truth source
1. Oznacit starsi closeout docs jako historicke.
2. Srovnat [docs/feature-parity-matrix.csv](/C:/GitHub/kajovo-hotel-monorepo/docs/feature-parity-matrix.csv) s novym SSOT.
3. Nepouzivat formulace typu `uzavreno`, `konecne hotovo`, `realne provozovatelne` bez runtime evidence pro konkretni SHA.

### Vlna P2 - test realism
1. Rozdelit dokazni vrstvy na:
   - `mocked integration`
   - `API-backed smoke`
   - `live runtime proof`
2. Kriticke operace mit minimalne ve dvou vrstvach:
   - create/update/delete user
   - reset link
   - SMTP test
   - login/logout

### Vlna P3 - bootstrap a compat quarantine
1. Oznacit seed/bootstrap tooling jako `test-only` nebo `bootstrap-only`.
2. Dodat seznam vsech legitimnich bootstrap domen:
   - device provisioning
   - e2e seed
   - migrate_legacy

## Pravidla pro dalsi tvrzeni

Od tohoto bodu je prijatelne tvrdit pouze to, co splnuje vsechny podminky:

1. tvrzeni odkazuje na konkretni soubor nebo konkretni SHA,
2. je zrejme, zda jde o runtime, test, docs, tooling nebo legacy,
3. neni smichan `mocked test pass` s `live runtime proof`,
4. pokud je neco jen `PARTIAL`, je to tak explicitne receno.

## Navazujici artefakty

Tento SSOT ma byt pouzit jako zaklad pro:

- navazujici task list oprav,
- aktualizaci parity matrix,
- oznaceni historickych closeout docs,
- pripadnou CI gate na nepravdive auditni formulace.
