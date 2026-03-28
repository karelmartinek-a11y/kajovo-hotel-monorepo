# Forenzní plán implementace souladu s KDGS

Datum: 2026-03-16
Vstupní norma: [`docs/Kajovo_Design_Governance_Standard_SSOT.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/Kajovo_Design_Governance_Standard_SSOT.md)
Účel: dovést celý portál, admin, API, shared vrstvu, testy, CI a dokumentaci do plného a doložitelného souladu s KDGS.

## 1. Cíl plánu

Cílem není jen přiblížení se normě, ale binární uzavření souladu.

Za dokončený lze stav považovat až tehdy, když současně platí:

- runtime odpovídá KDGS,
- testy vykonávaně dokazují KDGS soulad,
- GitHub pipeline blokuje porušení KDGS,
- dokumentace v `docs` neobsahuje starou nebo rozpornou pravdu,
- deploy run potvrzuje stejný stav jako `main`.

## 2. Aktuální forenzní vstup

Z aktuálního auditu vyplývá, že hlavní gapy jsou tyto:

1. chybí vykonávaný vizuálně-geometrický důkaz pro všechna view a breakpointy,
2. část guardů kontroluje jen deklaraci v manifestech, ne skutečný runtime,
3. dokumentace `docs` stále obsahuje rozporná nebo historicky zastaralá tvrzení,
4. release a CI dokumentace není plně sladěná se skutečnými workflow,
5. KDGS vyžaduje binární gate i pro layoutové rozpady, overflow, kolize a nehotové stavy.

## 3. Rozsah implementace

Plán se týká všech těchto vrstev:

- `apps/kajovo-hotel-web`
- `apps/kajovo-hotel-admin`
- `apps/kajovo-hotel-api`
- `packages/ui`
- `packages/shared`
- `apps/kajovo-hotel/ux`
- `apps/kajovo-hotel/ui-tokens`
- `.github/workflows`
- `scripts`
- `docs`

## 4. Pracovní proudy

### P1. SSOT a dokumentační cleanup

Cíl:

- odstranit starou nebo rozpornou current-state tvrzení,
- sjednotit `docs` s novým KDGS,
- výslovně oddělit aktivní, historické a forenzní dokumenty.

Kroky:

1. projít celé `docs` na odkazy na neexistující nebo superseded dokumenty,
2. odstranit nebo přepsat odkazy na `docs/SSOT_SCOPE_STATUS.md`,
3. opravit `docs/README.md`, aby nepředstíral odstranění historických dokumentů, pokud v repu zůstávají,
4. srovnat `docs/ci-gates.md`, `docs/developer-handbook.md`, `docs/release-checklist.md`, `docs/testing.md`, `docs/uat.md` s reálným CI a release tokom,
5. označit historické audity jako historické a nepoužitelné pro current-state rozhodování.

Výstup:

- jednotná a aktuální dokumentace,
- nulový drift mezi `docs` a skutečným runtime/CI.

Exit kritéria:

- žádný dokument v `docs` netvrdí něco, co neplatí v runtime nebo workflow,
- všechny current-state dokumenty odkazují jen na existující autoritativní zdroje.

### P2. Vykonávaný vizuální a geometrický důkaz

Cíl:

- zavést skutečné testy, které prokážou soulad s `NORMA G`, `K`, `N` a `O`.

Kroky:

1. vytvořit spustitelné `visual.spec.ts` pro web,
2. vytvořit spustitelné `visual.spec.ts` pro admin,
3. pokrýt minimálně breakpointy odpovídající KDGS třídám zařízení a release checklistu,
4. pro každé důležité view ověřit:
   - default
   - loading
   - empty
   - error
   - offline nebo maintenance
   - `404`
5. doplnit explicitní detekci:
   - horizontálního overflow root viewportu,
   - useknutých overlayů,
   - kolizí fixed a sticky prvků s CTA,
   - kolizí textu a formulářových stavů,
   - přítomnosti 1 až 2 validních brand prvků na view.

Výstup:

- reálně spustitelné Playwright testy pro web i admin,
- baseline snapshoty odpovídající aktuálnímu stavu,
- vykonávaný důkaz místo pouhé deklarace.

Exit kritéria:

- visual testy běží lokálně i v GitHub Actions,
- selžou při layoutovém rozpadu, overflow nebo chybě brand prvku.

### P3. Runtime guardy proti KDGS porušením

Cíl:

- rozšířit guardy tak, aby nehlídaly jen metadata, ale i závazné runtime zákazy.

Kroky:

1. doplnit guard na počet brand prvků v renderovaném view,
2. doplnit guard na povinné utility stavy a state routy,
3. doplnit kontrolu token-only stylování tam, kde dnes hrozí ad-hoc hodnoty,
4. doplnit kontrolu reduced motion,
5. doplnit kontrolu UTF-8 bez BOM pro aktivní textové soubory v celém rozsahu KDGS.

Výstup:

- silnější CI guardy proti regresím,
- menší závislost na ručním review.

Exit kritéria:

- guardy padají na konkrétní KDGS porušení,
- nevznikají falešně zelené buildy při manifestové deklaraci bez runtime reality.

### P4. CI a GitHub workflow enforcement

Cíl:

- dostat KDGS gate přímo do blokujících GitHub workflow.

Kroky:

1. zařadit vizuální a geometrické testy do `CI Gates - KajovoHotel`,
2. zařadit je i do `CI Full - Kajovo Hotel`,
3. doplnit release gate artifact o výsledek KDGS kontrol,
4. sjednotit názvy kroků a dokumentaci s tím, co skutečně běží,
5. ověřit, že deploy workflow navazuje jen na úspěšný KDGS-compliant gate.

Výstup:

- GitHub pipeline, která blokuje release při porušení KDGS,
- auditně doložitelné artefakty z CI.

Exit kritéria:

- GitHub run obsahuje explicitní důkaz výsledku KDGS gate,
- deploy se nespustí při červeném KDGS kroku.

### P5. Aplikační plochy a detailní dotažení view

Cíl:

- provést detailní dorovnání všech skutečných view, ne jen hlavních tras.

Kroky:

1. projít všechny route/view v portálu i adminu proti `apps/kajovo-hotel/ux/ia.json`,
2. zkontrolovat i utility view, retired view a fallbacky,
3. zkontrolovat formuláře na:
   - lokální validace,
   - souhrnné validace,
   - helper a error text,
   - dlouhý obsah,
   - sticky/fixed kolize,
4. zkontrolovat tabulky, galerie, modály, drawers a popupy na `NORMA O`,
5. zkontrolovat, že každé view drží 1 až 2 validní brand prvky a neporušuje `NORMA M`.

Výstup:

- seznam konkrétních code fixů po view,
- odstraněné layoutové a ergonomické výjimky.

Exit kritéria:

- žádné view neselhává v žádném povinném stavu a breakpointu,
- žádný overlay ani fixed prvek nerozbíjí interakci.

### P6. Forenzní uzavření a důkazní balík

Cíl:

- uzavřít implementaci tak, aby byla obhajitelná při opakovaném auditu.

Kroky:

1. vytvořit finální forenzní report s mapou požadavků KDGS -> důkaz v kódu/testu/workflow,
2. uvést přesné GitHub runy, SHA a deploy run,
3. přiložit seznam residual risks, pokud by nějaké zůstaly,
4. označit datum, od kterého je stav považován za current-state pravdu.

Výstup:

- finální auditní dokument,
- přímé odkazy na testy, workflow a evidence.

Exit kritéria:

- opakovaný audit nenajde current-state drift mezi KDGS, runtime, CI a docs.

## 5. Prioritizace realizace

Pořadí implementace:

1. `P1` SSOT a dokumentační cleanup
2. `P2` vizuální a geometrický důkaz
3. `P3` runtime guardy
4. `P4` CI workflow enforcement
5. `P5` detailní dorovnání view
6. `P6` finální forenzní uzavření

Toto pořadí je nutné, protože bez `P1` není jasná autoritativní pravda a bez `P2` až `P4` nelze binárně prokázat soulad.

## 6. Měřitelné dokončení

Stav bude považován za dokončený teprve tehdy, když současně projde:

- lokální KDGS gate,
- GitHub `CI Gates - KajovoHotel`,
- GitHub `CI Full - Kajovo Hotel`,
- `contract:check`,
- unit testy,
- web smoke,
- admin smoke,
- vizuální/geometrické testy,
- produkční deploy run se zeleným post-deploy verify.

## 7. Co tento plán nenahrazuje

Tento dokument není náhradou KDGS. Je to pouze implementační plán k dosažení souladu se závaznou normou.

V případě sporu vždy platí [`docs/Kajovo_Design_Governance_Standard_SSOT.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/Kajovo_Design_Governance_Standard_SSOT.md).
