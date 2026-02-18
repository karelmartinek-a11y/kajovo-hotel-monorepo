# ManifestDesignDNAKájovo — Závazný a vymahatelný manifest značky (SSOT)

Tento dokument je **jediný** závazný a řídící dokument pro repozitář značek rodiny Kájovo a pro používání značky v UI, na webu, v aplikacích (včetně Android), portálech, dokumentaci i marketingu.

## 0. Závaznost, vymahatelnost a neobejditelnost (NORMA)

### 0.1 Jediný zdroj pravdy (SSOT) a zákaz obcházení
1) **SSOT:** Tento soubor je jediný zdroj pravdy pro pravidla značky a UI brand integrace v rámci rodiny Kájovo.
2) **Zákaz obcházení:** Je zakázané obcházet pravidla tohoto dokumentu jakýmkoliv způsobem, včetně (ale ne jen):
   - „optických“ úprav, které formálně mění geometrii, ale mají působit stejně,
   - použití jiných souborů, dokumentů, komentářů, ticketů, e-mailů, Figma poznámek apod. jako „nadřazených“ pravidel,
   - zavedení alternativních variant loga, signace, barev, typografie, layoutu nebo výjimek mimo explicitně povolené výjimky v tomto dokumentu.
3) **Přednost:** Pokud jakýkoliv jiný text, soubor, komentář nebo instrukce odporuje tomuto dokumentu, **neplatí** a musí být ignorován.

### 0.2 Normativní vs. informativní části
- **Závazné jsou výhradně kapitoly označené „NORMA“.**
- Kapitoly označené **INFORMATIVNÍ** slouží pouze jako vysvětlení a doporučení a **nesmí** měnit, oslabovat ani rozšiřovat výjimky z NORMA.

### 0.3 Binární pravidlo platnosti výstupu
1) Pokud existuje jakýkoliv výstup (view/screen/stav, tiskovina, marketingový materiál, asset, export), který porušuje jakékoliv pravidlo v kapitolách **NORMA**, pak:
   - výstup se **nepovažuje** za součást rodiny Kájovo,
   - výstup je **neplatný** a **nesmí** být použit, publikován ani předán dál.
2) Neexistuje „téměř splněno“, „přibližně“, „dočasně bez dopadu“ ani „výjimka bez zápisu“.

### 0.4 Princip vymahatelnosti (testovatelnost)
Každé pravidlo v NORMA je:
- **jednoznačné** (bez volné interpretace),
- **testovatelné** člověkem i automatizací,
- **splnitelné** v běžném provozu.

Pokud by se v praxi objevila nejednoznačnost, platí přísnější výklad (tj. ten, který vede k menšímu prostoru pro obcházení).

### 0.5 Definice prvků značky (NORMA)
V rámci rodiny Kájovo rozlišujeme tyto prvky:

- **SIGNACE** (rodinný podpis) — pevně předepsaný prvek „KÁJOVO“ v červeném bloku.
- **MARK** — grafický symbol konkrétní aplikace.
- **WORDMARK** — typografický název aplikace ve formátu „Kájovo + Jméno aplikace“.
- **MOTTO** — volitelný druhý řádek pod WORDMARK; slouží pro **OBECNÝ NÁZEV** (např. formát, obecné označení). Typografie/barvy jsou definované v NORMA C/D.
- **FULL LOCKUP** — sestavní logo: SIGNACE + MARK + WORDMARK (+ volitelně MOTTO).

### 0.6 Zákaz alternativních řídících textů (NORMA)
1) V repozitáři je povolen pouze tento soubor jako řídící text pro brand.
2) Jakékoliv další „manifesty“, „brand guidelines“, „README s pravidly“, „design bible“ apod. jsou **neplatné**.
3) AI i lidé je musí ignorovat a nesmí z nich čerpat pravidla ani je slučovat.

**Upřesnění:** Technické README bez brand pravidel (např. build, instalace) je povoleno, pokud neobsahuje žádná pravidla pro značku, barvy, typografii, layout loga ani UI design.

### 0.7 Zákaz placeholderů v normě (NORMA)
V normativních částech je zakázané používat placeholdery typu „doplnit“, „TBD“, „TODO“. Pokud je potřeba něco specifikovat, musí to být specifikováno zde.

### 0.8 Definice „view“ a „PopUp“ (NORMA)
- **View** = samostatná obrazovka/stránka/stav, který uživatel vnímá jako celek (web route, app screen, full-screen state, samostatná chybová stránka, prázdný stav, offline/maintenance obrazovka).
- **PopUp** = dočasný overlay/dialog/bottom-sheet, který (a) nepřebírá plně navigaci aplikace a (b) je zavíratelný bez změny route/screenu.

Pokud je overlay full-screen a chová se jako samostatná route/screen, považuje se za **view** (a tedy se na něj vztahují pravidla pro view).

### 0.9 Závaznost pro AI agenty a modely OpenAI (NORMA, povinné)
Tento manifest je závazný **výhradně** pro AI agenty a modely OpenAI, které generují nebo upravují výstupy značek/assetů v rámci rodiny Kájovo. Pro tyto AI platí:

1) Pokud AI vygeneruje jakýkoliv výstup značky (SVG/PNG/PDF, návrh, layout, exportní balíček), který je v rozporu s kapitolami **NORMA**, výstup je **neplatný** a nesmí být použit ani předán dál.
2) AI nesmí nahrazovat požadované binární výstupy (zejména SVG) pouze specifikací, popisem, pseudokódem, postupem, nebo programem, který by výstup teprve generoval.

---

## NORMA A — Struktura repozitáře a exportní povinnosti

### A.1 Povinná struktura (minimální)
Repozitář musí obsahovat minimálně:
- `/ManifestDesignKájovo.md` (tento soubor; SSOT)
- `/signace/` (master signace ve vektoru + rastrové exporty; referenční názvy: `signace.svg`, `signace.pdf`, `signace.png`)
- `/apps/<app-slug>/logo/sources/logo_master.svg` (master full lockup v křivkách)
- `/apps/<app-slug>/logo/exports/` (rychlé exporty dle A.2)

Dovoleno je mít i další binární assety (SVG/PNG/PDF/AI), ale žádné další textové řídící dokumenty pro brand (viz 0.6).

### A.2 Povinné exporty pro každou aplikaci
Každá aplikace musí mít tyto exportní balíčky:

- `exports/full/`  (SIGNACE + MARK + WORDMARK)
- `exports/mark/`  (MARK samostatně)
- `exports/wordmark/` (WORDMARK samostatně)
- `exports/signace/` (SIGNACE samostatně)

Každý balíček obsahuje:
- `svg/` (vektor)
- `pdf/` (vektor pro tisk)
- `png/` (rychlé použití)

Povinné PNG velikosti (šířka = výška v px pro čtvercové exporty; u nečtvercových exportů je delší strana daná hodnotou):
- 64, 128, 256, 512, 1024, 2048 px

### A.3 Názvosloví souborů (povinné)
`<app-slug>_<variant>.<ext>` a u PNG `_<size>.png`

Příklad:
- `kajovo-hotel_full.svg`
- `kajovo-hotel_full_1024.png`

### A.4 Technický standard assetů (povinné)
1) SVG pro loga nesmí obsahovat `<text>` elementy. Vše musí být v křivkách.
2) Barvy musí být zapsané jako 6místné HEX (např. `#FF0000`, nikoli `#F00`). Velká/malá písmena jsou akceptovaná, ale exportní pipeline má barvy normalizovat.
3) Zakázané: gradienty, stíny, filtry, blur, průhlednosti (opacity < 1), patterny, masky, blend-modes.
4) Zakázané: stroke na tvarech loga (MARK i WORDMARK musí být vyplněné plochy; výjimka pouze pokud je MARK historicky definován jako outline a není dostupný zdroj — viz C.3.2).

### A.5 Povinné metadatové soubory pro automatickou kontrolu
Každá aplikace musí mít:
- `apps/<app-slug>/brand/brand.json`

`brand.json` musí obsahovat minimálně:
- `appSlug` (string)
- `appName` (string)
- `wordmarkLine2` (string | null)
- `usesLegacyOutlinePackV1` (boolean)
- `lockupH` (number) — konstrukční H pro master export
- `gapG1` (number) — G1 dle D.2 (px ve finálním master viewBoxu)
- `gapG2` (number) — G2 dle D.2 (px ve finálním master viewBoxu)
- `safeZone` (number) — 0.10H dle D.5 (px ve finálním master viewBoxu)
- `signaceViewBox` (string) — očekávaný viewBox signace (např. `0 0 59 202`)

Tento soubor slouží pouze pro automatizaci a nesmí zavádět alternativní pravidla.

### A.6 Povinný výstup pro tvorbu nového loga/značky (AI) — SVG v opravdových křivkách
Pokud AI vytváří nové logo/značku (FULL LOCKUP, MARK, WORDMARK nebo jejich části), musí být jako primární a předávací artefakt vždy dodán **hotový** soubor `*.svg` splňující A.4 a navíc:

1) **Křivky jsou povinné:** Veškerá typografie (SIGNACE/WORDMARK i jakýkoliv text v MARK) musí být převedena na křivky (paths). SVG nesmí obsahovat `<text>` (už pokrývá A.4/1), a nesmí spoléhat na fonty, `@font-face`, externí fonty ani runtime text rendering.
2) **Žádné „generátory místo výstupu“:** Je zakázané předat pouze specifikaci, prompt, návod, skript, program, nebo projektový soubor (AI/PSD/Figma apod.) a tvrdit, že „lze vygenerovat SVG“. Výsledek musí být přítomen jako skutečný SVG soubor.
3) **Žádné externí závislosti:** SVG nesmí používat externí odkazy (`<image href=...>`, externí CSS, `<use href=...>` na externí soubory). Všechny tvary musí být obsažené přímo v souboru.
4) **Testovatelnost:** SVG musí být validovatelné automatizací: žádné zakázané prvky dle A.4/3, žádné opacity < 1, žádné filtry/masky/patterny, barvy jen dle povolené palety.
5) **Předání výstupu:** Pokud AI předává více souborů (např. master + exporty), musí být předány jako `ZIP` obsahující minimálně:
   - `apps/<app-slug>/logo/sources/logo_master.svg`
   - `apps/<app-slug>/logo/exports/...` dle A.2
   - a tento manifest (`/ManifestDesignKájovo.md`) jako SSOT.

#### A.6.1 Acceptance checklist pro `logo_master.svg` (povinné)
Před předáním se musí ověřit, že `logo_master.svg` splňuje zároveň:
1) **Žádné průniky (binární):** Žádná část SIGNACE, MARK, WORDMARK ani MOTTO nesmí geometricky protínat jiný prvek (viz D.7).
2) **Minimální mezery (binární):** Je dodrženo G1 a G2 dle D.2 (měřeno jako minimální vzdálenost obrys–obrys po aplikaci transformací; viz D.7).
3) **Výška MARK = H:** MARK má výšku přesně H dle D.2.
4) **Ochranná zóna:** Je dodrženo 0.10H ze všech stran dle D.5 (tj. viewBox/rozměr masteru zahrnuje i ochrannou zónu).
5) **Paleta:** Logo používá pouze barvy dle C.3.2 a MARK současně splňuje C.3.1 (tři barvy, červená jen miniaturní detail).
6) **Technický standard:** Platí A.4 (žádný `<text>`, žádné opacity < 1, žádné filtry/masky/patterny/gradienty, žádné stroke).

---

## NORMA B — Signace (jediný povolený vzhled)

### B.1 Povinné barvy (bez alternativ)
- Pozadí: **Kájovo Red** `#FF0000`
- Text: **White** `#FFFFFF`

Neexistují žádné varianty (žádná inverze, žádná černobílá verze, žádné přebarvení).

### B.2 Povinný text signace
Text je vždy: **KÁJOVO** (ALL CAPS, s diakritikou, Montserrat Bold).

### B.3 Orientace a kompozice
- Signace má orientaci odpovídající otočení o **90° doleva** (tj. vertikální blok dle masteru).
- Signace musí být vždy čitelná (nesmí být zrcadlená, převrácená, deformovaná).
- Text je vycentrovaný v rámci červeného pole.

**Upřesnění (master signace):** Referenční soubor `signace.svg` je již v cílové orientaci (vertikální blok s textem jako ve zdroji, viewBox `0 0 59 202`). Při skládání FULL LOCKUP se signace používá **bez další rotace**; jakýkoliv dodatečný `rotate/scale` je považován za změnu vzhledu.

### B.4 Bezpečné okraje uvnitř signace (povinné minimum)
Minimální „safe margins“ od textu k hraně signace:
- horní a dolní okraj: min. **6,5 %** výšky signace
- levý a pravý okraj: min. **17 %** šířky signace

### B.5 Zakázané úpravy signace
Zakázané je zejména:
- měnit barvy, písmo, řez, case, diakritiku,
- přidávat stíny/obrysy/efekty/průhlednost,
- ořezávat signaci tak, že se zmenší safe margins,
- používat signaci jen v menu / jen na hover / jen v intro.

### B.6 Povinnost přítomnosti v UI (web + aplikace)
- Web a aplikace: mimo PopUp je signace povinně **floating vlevo dole** a musí být stále viditelná (i při scrollu).
- PopUp: výjimka z povinné pozice „floating left-bottom“.

### B.7 Minimální velikost a interakce (aby bylo pravidlo splnitelné)
Aby signace nebránila běžnému použití:
- Signace musí být viditelná, ale nesmí překrývat primární ovládací prvky.
- Minimální čitelná velikost: kratší strana signace (tloušťka červeného bloku po otočení) musí být **min. 24 px**.
- Doporučené (a povinné, pokud by jinak docházelo ke kolizím): signace může být **klikací** a otevřít „About/Brand“ nebo domovskou stránku; klikatelnost však nesmí být vyžadována pro základní funkce.

---

## NORMA C — Sestavní logo aplikace (layout + typografie + barvy)

### C.1 Závazné pořadí zleva
1) SIGNACE
2) MARK
3) WORDMARK (a volitelně pod ním MOTTO jako druhý řádek)

### C.2 Typografie (povinné)
Font family: **Montserrat**
- „Kájovo“ (prefix ve wordmarku): Montserrat **Bold**
- Název aplikace (suffix ve wordmarku): Montserrat **Regular**
- MOTTO (pokud je): Montserrat **Regular**, **ALL CAPS**

Zakázané:
- jiné fonty,
- kurzíva,
- podtržení,
- deformace šířky (condense/expand),
- libovolné tracking hodnoty mimo D.4.

### C.3 Barvy (povinné)
#### C.3.1 Standardní (cílový) předpis
- „Kájovo“ (část wordmarku): `#000000`
- Název aplikace (druhá část wordmarku): **Metal** `#737578`
- MOTTO: **Subtle Metal** `#9AA0A6`
- MARK: povinně používá **vždy tři barvy**:
  1) `#000000` (stejné jako „Kájovo“ ve WORDMARK),
  2) `#737578` (stejná **Metal** jako pro název aplikace ve WORDMARK),
  3) `#FF0000` (miniaturní detail; stejná červená jako SIGNACE).

#### C.3.2 Povolená paleta pro logo (striktní)
Logo smí používat pouze tyto barvy:
- **Kájovo Red:** `#FF0000`
- **White:** `#FFFFFF`
- **Kájovo Ink:** `#000000`
- **Metal:** `#737578`
- **Subtle Metal:** `#9AA0A6`

Zakázané:
- libovolné další odstíny černé/šedé,
- gradienty,
- jakékoliv jiné barvy mimo paletu výše,
- použití `#FF0000` jako dominantní plochy v MARK (červená je povolená pouze jako **miniaturní detail**).

---

## NORMA D — Parametrická konstrukce (velikosti, poměry, spacing, tracking)

Tato část zavádí jednotný „konstrukční systém“ tak, aby všechna loga byla na identickém layoutu.

### D.1 Definice jednotky
Nechť **H** = celková výška sestavního loga (full lockup) bez ochranné zóny.

### D.2 Poměry prvků (povinné)
- Signace:
  - výška = **H**
  - šířka **S = (59/202)H = 0.292079H**
- Mezery (fixní):
  - mezera mezi SIGNACE a MARK **G1 = 10 px**
  - mezera mezi MARK a WORDMARK blokem **G2 = 30 px**
- MARK:
  - MARK musí mít **výšku přesně H** (tj. přesně na celou výšku SIGNACE).
  - MARK je vertikálně centrovaný vůči SIGNACE.
  - MARK se škáluje tak, aby výška odpovídala H; proporce MARK se nesmí deformovat.
- WORDMARK blok:
  - WORDMARK (samostatně) je vycentrovaný na výšku layoutu (tj. vůči H).
  - Pokud je použit i MOTTO, pak se jako celek (WORDMARK + MOTTO) vycentruje na výšku layoutu (tj. vůči H).

### D.3 Typografické velikosti (povinné, v poměru k H)
- WORDMARK řádek 1 (Kájovo + Název): cap height = **0.28H**
- MOTTO (řádek 2, pokud existuje): cap height = **0.15H**
- Vertikální mezera mezi řádky (WORDMARK ↔ MOTTO): **0.12H**

**Pravidlo šířky MOTTO (povinné):**
- MOTTO nesmí být nikdy širší než WORDMARK (řádek 1).
- Pokud text MOTTO přesahuje šířku WORDMARK, musí se velikost písma MOTTO zmenšit na **první takovou velikost**, aby výsledná šířka MOTTO byla alespoň o **5 % užší** než šířka WORDMARK (tj. `width(MOTTO) ≤ 0.95 × width(WORDMARK)`), při zachování stejného řezu, barvy a trackingu dle D.4.

### D.4 Tracking (povinné)
- „Kájovo“ (Bold): tracking **0.00em**
- Název aplikace (Regular): tracking **0.00em**
- MOTTO (Regular ALL CAPS): tracking **+0.08em**

### D.5 Ochranná zóna (povinné)
Ochranná zóna full loga = **0.10H** ze všech stran.

Žádný jiný prvek UI se nesmí dostat do této zóny.

### D.6 Kontrola „identického layoutu“ (neobejditelné)
Každé master logo musí být ověřené tak, že:
- signace začíná na levém okraji konstrukčního boxu (žádné skryté záporné translate),
- prvky odpovídají poměrům D.2 s tolerancí **± 2 %**,
- barvy odpovídají C.3 bez odchylek,
- žádný `<text>` element (pouze křivky),
- optické centrování wordmarku vůči MARK je zkontrolováno vizuálně.

### D.7 Geometrická validace (kolize a měření mezer) — binární
1) **Zákaz průniků:** V FULL LOCKUP nesmí žádná část SIGNACE, MARK, WORDMARK ani MOTTO geometricky protínat (intersect) jiný prvek. Kontroluje se na finálních křivkách (fill plochy) po aplikaci všech transformací.
2) **Měření G1/G2:** G1 a G2 dle D.2 se měří jako minimální vzdálenost mezi obrysy (path-to-path distance) sousedních prvků po aplikaci transformací. Pokud je vzdálenost menší než předepsaná hodnota, výstup je neplatný.
3) **Transformace:** Před měřením se musí vyhodnotit/„zploštit“ všechny transformace (`transform=`) tak, aby geometrie odpovídala tomu, co se skutečně vykreslí.

---

## NORMA E — Kdy je povolen MARK samostatně (bez signace)

MARK smí být bez signace pouze:
- favicon,
- app icon / ikona okna,
- miniaturní launchery/dlaždice,
- progress/loading obrazovky,
- extrémně malé náhledy, kde by signace nebyla čitelná.

Jinak je povinný full lockup (SIGNACE + MARK + WORDMARK).

---

## NORMA F — Intro pro portály

Vstup do portálu musí mít intro, které zobrazuje kompletní značku:
- SIGNACE + MARK + WORDMARK + MOTTO (je-li).

Intro musí být:
- krátké,
- statické,
- bez efektů,
- a nenahrazuje povinnou přítomnost signace v dalších view.

---

## NORMA G — Přítomnost značky v UI (četnost, viditelnost, stavy)

### G.1 Četnost na view
- Minimum: **1×** brand prvek na view (typicky signace; u miniaturních výjimek MARK dle E).
- Maximum: **2×** (cokoliv nad 2× je porušení).

### G.2 Viditelnost bez scrollu
- Na vstupu do view musí být relevantní brand prvek viditelný v prvním viewportu.
- Brand prvek nesmí být schovaný jen v menu/drawer/hamburger.

### G.3 Kontrast a čitelnost
- Zakázané: blur, průhlednost, efekty a překryvy snižující čitelnost.
- Signace nesmí být překrytá cookie lištami, chat widgety ani jinými overlay prvky.

### G.4 Povinné stavy
Signace (nebo výjimečně MARK-only dle E) musí být i v těchto stavech:
- loading / spinner / progress
- empty state
- error state
- offline / maintenance
- 404 / not found
- fallback obrazovky a utility view
- modály a kritické dialogy, pokud tvoří samostatný view

---

## NORMA H — Barevné palety pro UI (rodinný rámec)

### H.1 Primární brand paleta (povinná)
- **Kájovo Red:** `#FF0000` (vázáno na signaci)
- **White:** `#FFFFFF`

Pravidla:
1) Signace se nikdy nepřebarvuje a nikdy se neinvertuje.
2) `#FF0000` se v UI nesmí používat tak, aby konkurovala signaci (velké dekorativní plochy bez účelu jsou zakázané).

### H.2 Povinná neutrální UI paleta (povinná)
- Ink 900 (hlavní text): `#111111`
- Ink 700 (sekundární text): `#333333`
- Ink 500 (metadata): `#666666`
- Line 300 (rámečky/dividery): `#E0E0E0`
- Surface 100 (základní plocha): `#FFFFFF`
- Surface 200 (sekundární plocha): `#F5F5F5`
- Surface 300 (karta/sekce): `#EEEEEE`

Zakázané: barevné pozadí jako „výchozí styl“ aplikace, které konkuruje signaci.

### H.3 Povinné stavové barvy (povinné)
- Success: `#1B5E20`
- Warning: `#E65100`
- Error: `#B71C1C`
- Info: `#0D47A1`

Pravidla:
1) Stavové barvy nikdy nenahrazují signaci ani brand identitu.
2) Error barva není „brand red“. Brand red zůstává `#FF0000` a je vázaná na signaci.

### H.4 Produktové sekundární palety (povolené, řízené)
Sekundární palety jsou povolené pouze pokud:
- jsou definované v `apps/<app-slug>/palette/palette.json`,
- mají popsaný účel (stav/kategorie/dataviz),
- nevytváří „druhý brand“ konkurující signaci.

---

## NORMA I — Governance a release gate (neobejditelné)

### I.1 Checklist (automatické blokování)
Release je blokovaný, pokud:
- existuje view mimo PopUp bez signace jako floating podpis vlevo dole,
- signace není stále vidět (perzistence při scrollu/užití),
- signace je jiná než `#FFFFFF` text na `#FF0000` pozadí,
- signace není Montserrat Bold, ALL CAPS, nebo chybí diakritika,
- wordmark neodpovídá C.2 a D.4,
- logo porušuje C.3 (barvy) nebo A.4 (technický standard),
- brand prvky jsou více než 2× na view,
- MARK-only je použit mimo výjimky v E.

### I.2 Doporučený testovací standard (povinné minimum procesu)
Každý produkt musí mít automatizovanou kontrolu, která ověří minimálně:
1) signace je přítomná (mimo PopUp) jako floating vlevo dole,
2) je stále vidět při scrollu,
3) má správné barvy a text,
4) je max 2× na view,
5) MARK-only výjimky jsou jen dle E.
6) `logo_master.svg` pro každou aplikaci splňuje A.6.1 a D.7 (žádné průniky, dodržení G1/G2, paleta, technický standard).

### I.3 Povinná vizuální a UX kontrola pro web (povinné minimum procesu)
Každý webový produkt musí mít ověřeno (automatizací nebo kontrolou člověka), že:
1) signace je přítomná a nekolizní dle B/G/M,
2) na všech klíčových view existují hotové stavy dle G.4 (loading/empty/error/offline/404) a jsou vizuálně dokončené,
3) nejsou použity hodnoty „mimo tokeny“ (J.1),
4) je splněno WCAG 2.2 AA (J.3),
5) `prefers-reduced-motion` je respektováno dle J.6,
6) výsledek nepůsobí jako generická šablona (viz NORMA N).

---

## NORMA J — Design systém: tokeny, grid, přístupnost, motion (povinné)

Tato kapitola definuje minimální parametry pro jednotný „administrativní“ look a kvalitu napříč rodinou.

### J.1 Povinné design tokeny
Každý produkt musí mít centrálně definované tokeny a používat je bez výjimek:
- barvy (palety, stavy, pozadí, texty, rámečky),
- typografie (font family, řezy, velikosti, řádkování, tracking),
- spacing (8pt grid),
- radius,
- elevation/shadow,
- motion (délky, easing),
- z-index vrstvy (včetně signace),
- komponentové stavy.

Tokeny musí být uložené a verzované v repozitáři aplikace minimálně jako:
- `apps/<app-slug>/palette/palette.json`
- `apps/<app-slug>/ui-tokens/tokens.json`

**Upřesnění (binární):** Je zakázané používat v UI/kódu ad-hoc hodnoty pro barvy, spacing, radius, elevation, duration, easing, z-index a stavy komponent. Vše musí odkazovat na tokeny; výjimka je povolena pouze tehdy, pokud je explicitně uvedena jako dočasná výjimka v `brand.json` a zároveň má uvedené datum odstranění.

### J.2 Grid a rozměrová disciplína
- Základní mřížka: **8pt**.
- Hit-target: min. **44×44 px** (touch), min. **36×36 px** (desktop).

### J.3 Přístupnost
- UI musí splnit min. **WCAG 2.2 AA**.
- Focus ring pro klávesnici: min. 2 px, zřetelný kontrast.

### J.4 Typografie UI (minimální standard)
Font family: **Montserrat** (Regular + Bold povinné).

Minimální rozsah:
- H1: 32/40 Bold
- H2: 24/32 Bold
- H3: 20/28 Bold
- Body: 16/24 Regular
- Small: 14/20 Regular
- Micro: 12/16 Regular (jen metadata)
- Button/CTA: 14–16 Bold

### J.5 Radius a elevation
Radius tokeny (používat jen tyto):
- r0=0, r8=8, r12=12, r16=16

Elevation:
- e0 (flat), e1 (karty), e2 (overlay/popup), e3 (kritické modály)

### J.6 Motion
- Mikro-interakce: 120–180 ms
- Přechod view: 180–260 ms
- Modál/overlay: 160–220 ms
- Respektovat `prefers-reduced-motion`.

Zakázané: parallax, „bouncy“ animace, random easing, efekty snižující čitelnost signace.

**Upřesnění (povinné):** Motion tokeny (durations + easing + pravidla pro view transitions) musí být verzované v `apps/<app-slug>/ui-motion/motion.json` a používané bez výjimek. Je zakázané zavádět další easing/duration mimo tokeny.

---

## NORMA K — Responsivita a personalizovaná dostupnost (web: Desktop/Telefon/Tablet)

### K.1 Povinné cílové třídy zařízení
Každý webový produkt musí být plně použitelný a vizuálně dokončený pro:
- **Telefon**: 360–480 CSS px šířky
- **Tablet**: 768–1024 CSS px šířky
- **Desktop**: 1280–1920 CSS px šířky

Pravidla:
1) Nesmí existovat „jen desktop“ nebo „jen mobile“ varianta. Všechny klíčové funkce musí být dostupné na všech třech třídách.
2) Layout se musí přizpůsobit bez horizontálního scrollu (výjimka: datové tabulky mohou scrollovat horizontálně uvnitř vlastního kontejneru).
3) Signace musí zůstat floating vlevo dole i na telefonu a tabletu; pokud by překrývala primární ovládání, musí se upravit okolní UI (nikoliv skrýt signaci).

### K.2 Breakpointy (povinné minimum)
Povinné breakpointy:
- `sm` = 0–599
- `md` = 600–1023
- `lg` = 1024–1439
- `xl` = 1440+

Je povoleno mít více breakpointů, ale tyto musí existovat a být konzistentně používány.

### K.3 Personalizace a dostupnost obsahu
- Personalizovaný obsah (např. jméno uživatele, role, preference) nesmí měnit brand pravidla.
- Personalizace nesmí skrývat signaci ani snižovat její čitelnost.
- Pokud je UI lokalizované, signace a wordmark se nelokalizují (SIGNACE je vždy „KÁJOVO“).

---

## NORMA L — Pravidla pro Android aplikace

### L.1 Povinné brand prvky v Android UI
- Signace musí být přítomná na každém view dle pravidel B.6 a G.
- MARK-only je povolen pouze dle E (typicky launcher icon, splash/loading).

### L.2 App icon (launcher)
- Launcher icon používá **MARK** (bez signace) dle E.
- Ikona nesmí používat jiné barvy než povolené pro logo (C.3.3), s výjimkou systémových adaptivních masek/pozadí, které jsou řízené OS.

### L.3 Adaptivní ikony
Pokud Android vyžaduje adaptivní ikonu:
- Foreground: MARK.
- Background: neutrální (doporučeno `#FFFFFF` nebo `#EEEEEE`).
- Zakázané: použít `#FF0000` jako dominantní background ikony.

### L.4 Typografie v aplikaci
- UI font: Montserrat (Regular + Bold).
- Pokud platformní omezení dočasně znemožní Montserrat (např. technický incident), je povolena dočasná náhrada systémovým sans-serif pouze pro UI texty; loga (SVG/PDF/PNG) se nemění a zůstávají dle A.4 (křivky).

### L.5 Přístupnost a systémové nastavení
- Povinně respektovat: font scaling, dark mode (pokud je podporován), `prefers-reduced-motion` ekvivalent na platformě.
- Dark mode nesmí invertovat signaci; signace zůstává `#FF0000` + `#FFFFFF`.

---

## NORMA M — Umístění signace v UI (z-index, odsazení, kolize)

Aby byla signace trvale viditelná a současně neblokovala běžné použití, platí:

### M.1 Umístění a odsazení
- Signace je **fixed/sticky** vlevo dole.
- Minimální odsazení od okraje viewportu: **16 px** (telefon), **20 px** (tablet), **24 px** (desktop).

### M.2 Vrstevnatost
- Signace musí mít definovaný z-index token a být nad běžným obsahem.
- Signace nesmí být nad kritickými systémovými dialogy OS (např. permission dialog) — to je mimo kontrolu aplikace.

### M.3 Kolize s UI prvky
- Pokud by signace kolidovala s cookie lištou, chat widgetem, FAB tlačítkem nebo navigací, musí se upravit tyto prvky (posun, padding, safe-area), nikoliv skrýt signaci.

---

## NORMA N — Web portály: kvalita, personalizace, zákaz zjednodušených výstupů

### N.1 Závaznost pro generování webů (AI)
Tento manifest je závazný i pro AI, která generuje webové portály (stránky, komponenty, animace, styly, UX flow, texty). Každý výstup musí být plně použitelný a vizuálně dokončený ve všech stavech dle N.4.

### N.2 Zákaz “základní verze” a placeholder řešení (binární)
Je přísně zakázáno generovat nebo předat:
- “minimal”, “basic”, “MVP UI”, “draft”, “wireframe”,
- neostylované komponenty bez definovaných stavů,
- animace bez pravidel (nahodilé easing/duration),
- UI bez dokončených prázdných/error/loading stavů,
- texty typu lorem / placeholder / generické copy, které neodpovídá pravidlům značky.

Pokud výstup nesplňuje N.3–N.6, považuje se za **neplatný** (binární pravidlo).

### N.3 Povinný “nadstandardně personalizovaný” vzhled (definice, vymahatelné)
„Nadstandardně personalizovaný“ znamená, že UI je na první pohled rozpoznatelné jako rodina Kájovo a současně má produktové “signature” rysy (řízené tokeny a komponenty) bez porušení signace a palet.

Povinné:
1) použití tokenů dle J.1 bez výjimek,
2) konzistentní typografie dle J.4 a pravidel značky,
3) produktové signature prvky pouze v rámci pravidel H.4 (sekundární palety) a dále v rámci UI (ikonografie/pattern/layout) tak, aby nevznikal “druhý brand” konkurující signaci,
4) viditelná řemeslná kvalita: mikro-interakce, stavy, rytmus spacingu, ergonomie, žádné generické šablony.

### N.4 Povinné stavy dokončení pro každé view (binární)
Každé view musí mít hotové a vizuálně finální varianty:
- default,
- hover/active/focus pro interaktivní prvky,
- loading,
- empty state,
- error state,
- offline/maintenance,
- 404/not found (web),
- responsive varianty pro K.1.

### N.5 Povinné animace (motion) – profesionální standard (binární)
Animace musí být:
- konzistentní (tokeny pro duration/easing dle J.6),
- funkční (zvyšují čitelnost a orientaci, ne “efekt pro efekt”),
- kompatibilní s `prefers-reduced-motion` (povinně: vypnout pohybové přechody; ponechat jen neinvazivní fade/opacity dle tokenů).

Zakázané: parallax, “bouncy” animace, random easing, animace snižující čitelnost signace (již zakázáno v J.6).

### N.6 Povinná ergonomie a intuitivnost (vymahatelné)
Povinné:
1) primární akce (CTA) musí být jednoznačně identifikovatelná v prvním viewportu,
2) navigace musí být zřejmá bez studování (max. 2 úrovně pro primární navigaci),
3) chyby musí jasně říkat “co se stalo” a “co má uživatel udělat dál”,
4) formuláře musí mít srozumitelnou validaci (inline + souhrn při odeslání),
5) žádný prvek nesmí snižovat čitelnost signace ani ji překrývat (B/G/M).

### N.7 Povinné soubory pro webový produkt (kvůli vymahatelnosti)
Každý webový produkt musí mít (mimo tento manifest) v repozitáři přítomné a verzované minimálně:
- `apps/<app-slug>/ui-tokens/tokens.json` (J.1)
- `apps/<app-slug>/palette/palette.json` (H.4)
- `apps/<app-slug>/ui-motion/motion.json` (J.6)
- `apps/<app-slug>/ux/ia.json` (informační architektura a mapování view → funkce)

Je povoleno přidat další pomocné soubory (např. `ux/voice.md`, `ui-components/components.json`), ale nesmí zavádět alternativní brand pravidla (0.6).

### N.8 Release gate pro web portál (blokující)
Release je blokovaný, pokud:
- existuje view bez hotových stavů dle N.4,
- jsou použity hodnoty mimo tokeny (J.1) bez explicitní dočasné výjimky,
- `prefers-reduced-motion` není respektováno (J.6),
- výsledek působí jako generická šablona bez rozpoznatelné rodiny Kájovo a bez řemeslné kvality (N.3).

---

## INFORMATIVNÍ P — Doporučené vstupy před generováním webu (neřídící)

Aby bylo reálně možné splnit požadavek “nadstandardně personalizovaného” a ergonomicky dotaženého webu, je vhodné mít pro každý webový produkt připraveno:

1) Informační architekturu (`ux/ia.json`): stránky/view, navigace, primární CTA pro každé view, mapování funkcí.
2) Hlas značky pro UI texty (např. `ux/voice.md`): pravidla tónu, slovník, zakázaná slova, šablony microcopy (error/empty/loading).
3) Katalog komponent (např. `ui-components/components.json`): seznam komponent a variant, povinné stavy, a11y požadavky.
4) Motion pravidla (`ui-motion/motion.json`): durations, easing, vzdálenosti, pravidla pro view transitions, reduced-motion.
5) Obsahový inventář (např. `ux/content.json`): seznam sekcí a minimální texty (H1/H2/CTA) pro klíčové stránky.
6) Checklist “hotovo” (např. `ux/done.json`): seznam view a stavů, které musí existovat (pro kontrolu a gate).

Tyto soubory slouží k řízení generování a kontroly kvality; nesmí měnit pravidla značky definovaná v kapitolách NORMA tohoto manifestu (0.6).

## INFORMATIVNÍ O — Poznámky k implementaci (neřídící)

**Poznámka:** Tato kapitola byla dříve označena jako INFORMATIVNÍ N. Označení bylo posunuto kvůli vložení závazné kapitoly NORMA N.

- Pro web je vhodné implementovat signaci jako samostatnou komponentu s pevnými barvami a s testy (viz I.2).
- Pro exporty je vhodné mít skript, který ověří A.4 (žádný `<text>`, žádné opacity, žádné zakázané elementy) a zkontroluje HEX barvy.
