# Kájovo Design Governance Standard (SSOT)

Datum: 2026-03-16
Typ dokumentu: závazný řídící dokument
Zdroj: přepsáno podle přílohy [`Kajovo_Design_Governance_Standard_revised.docx`](C:\Users\provo\Downloads\Kajovo_Design_Governance_Standard_revised.docx)

Tento dokument je jediný závazný a řídící dokument pro repozitář značek rodiny Kájovo a pro používání značky v UI, na webu, v aplikacích, portálech, dokumentaci i marketingu.

## 0. Závaznost, vymahatelnost a neobejditelnost (NORMA)

### 0.1 Jediný zdroj pravdy (SSOT) a zákaz obcházení

Tento soubor je jediný zdroj pravdy pro pravidla značky a UI integrace v rámci rodiny Kájovo.

Je zakázané obcházet pravidla tohoto dokumentu:

- optickými úpravami,
- lokálními výjimkami bez zápisu,
- neformálními instrukcemi,
- jinými dokumenty vydávanými za nadřazený zdroj.

Pokud jakýkoliv jiný text, komentář, ticket, e-mail, Figma poznámka nebo README odporuje tomuto dokumentu, neplatí.

### 0.2 Normativní vs. informativní části

Závazné jsou výhradně kapitoly označené jako `NORMA`.

Informativní kapitoly slouží pouze:

- k vysvětlení,
- příkladům,
- doporučením.

Informativní kapitoly nesmí měnit, oslabovat ani rozšiřovat výjimky z `NORMA`.

### 0.3 Binární pravidlo platnosti výstupu

Pokud jakýkoliv výstup porušuje jakékoliv pravidlo v kapitolách `NORMA`, je neplatný a nesmí být použit, publikován ani předán dál.

Neexistuje:

- „téměř splněno“,
- „vizuálně skoro správně“,
- „dočasně bez dopadu“,
- „výjimka bez zápisu“.

### 0.4 Princip vymahatelnosti

Každé pravidlo v `NORMA` musí být:

- jednoznačné,
- testovatelné člověkem i automatizací,
- splnitelné v běžném provozu.

Pokud vznikne nejednoznačnost, platí přísnější výklad.

### 0.5 Definice prvků značky

V rámci rodiny Kájovo rozlišujeme:

- `SIGNACE`: rodinný podpis `KÁJOVO` v červeném bloku
- `MARK`: grafický symbol konkrétní aplikace nebo produktu
- `WORDMARK`: typografický název aplikace ve formátu `Kájovo + název`
- `MOTTO`: volitelný druhý řádek pod `WORDMARK`
- `FULL LOCKUP`: `SIGNACE + MARK + WORDMARK + případně MOTTO`

### 0.6 Řídící dokumenty a podřízené technické dokumenty

Tento dokument je jediný nadřazený řídící dokument pro:

- brand,
- UI brand integraci,
- ergonomii,
- layoutové normy

v rámci rodiny Kájovo.

Další textové dokumenty jsou povolené pouze jako podřízené technické nebo provozní dokumenty, například:

- README,
- implementační standardy,
- komponentové katalogy,
- UX checklisty,
- motion specifikace,
- IA mapy,
- a11y checklisty,
- release checklisty.

Podřízený dokument nesmí:

- přepisovat tento standard,
- zavádět alternativní brand pravidla,
- zavádět alternativní palety, typografii, geometrii loga,
- zavádět výjimky bez výslovného odkazu na tento standard.

Podřízený dokument smí:

- konkretizovat implementaci,
- popsat proces,
- doplnit testovací postupy,
- rozpracovat komponenty, layouty nebo UX flow,

pokud je plně podřízen tomuto standardu.

### 0.7 Zákaz placeholderů v normě

V normativních částech je zakázané používat:

- `TODO`
- `TBD`
- `FIXME`
- `doplnit`
- `později`
- jinou neuzavřenou formulaci

### 0.8 Definice view, sekce, komponenty a PopUp

- `View`: samostatná obrazovka, route, stránka nebo plnohodnotný stav obrazovky
- `Sekce`: vymezený layoutový celek uvnitř view
- `Komponenta`: samostatný UI prvek nebo skupina prvků s vlastním box modelem a interakcí
- `PopUp`: dočasný overlay, dialog, dropdown, popover nebo bottom-sheet, který nepřebírá plnou navigaci aplikace

Pokud se overlay chová jako samostatná obrazovka, považuje se za `view`.

### 0.9 Závaznost pro AI

Tento standard je závazný i pro AI agenty a modely, které generují nebo upravují výstupy rodiny Kájovo.

AI nesmí:

- vydávat nehotový, falešný nebo geometrií rozpadlý výstup za hotový,
- nahrazovat požadované binární výstupy pouze popisem, pseudokódem nebo návodem.

Pokud AI kvůli limitu délky, kontextu nebo jinému omezení nemůže dodat celé řešení, musí:

- dodat maximální kompletní část,
- jasně oddělit hotové a nedokončené části,
- přesně uvést důvod nedokončení.

## NORMA A — Struktura repozitáře a exportní povinnosti

### A.1 Povinná struktura

Repozitář musí obsahovat minimálně:

- tento standard jako SSOT,
- master signaci ve vektoru a rastrových exportech,
- pro každou aplikaci master logo ve vektoru,
- exporty `FULL LOCKUP`, `MARK`, `WORDMARK` a `SIGNACE`.

### A.2 Povinné exporty

Každá aplikace musí mít exportní balíčky:

- `full`
- `mark`
- `wordmark`
- `signace`

Každý balíček musí obsahovat:

- `svg`
- `pdf`
- `png`

Povinné PNG velikosti:

- `64 px`
- `128 px`
- `256 px`
- `512 px`
- `1024 px`
- `2048 px`

### A.3 Názvosloví souborů

`<app-slug>_<variant>.<ext>` a u PNG `_<size>.png`

### A.4 Technický standard assetů

SVG pro loga nesmí obsahovat textové elementy. Vše musí být v křivkách.

Barvy musí být zapsané jako 6místné HEX.

Zakázané jsou:

- gradienty,
- stíny,
- filtry,
- blur,
- průhlednosti pod 1,
- patterny,
- masky,
- blend modes.

Zakázané jsou i stroke obrysy na tvarech loga, pokud nejde o explicitně schválený legacy pack.

Textové, konfigurační a zdrojové soubory určené pro web, aplikace a automatizaci musí být uložené v kódování `UTF-8 bez BOM`.

### A.5 Povinné metadatové soubory

Každá aplikace musí mít `brand.json` s minimálně těmito položkami:

- `appSlug`
- `appName`
- `wordmarkLine2`
- `usesLegacyOutlinePackV1`
- `lockupH`
- `gapG1`
- `gapG2`
- `safeZone`
- `signaceViewBox`

### A.6 Povinný výstup při tvorbě nového loga

Pokud AI nebo člověk vytváří nové logo, primární předávací artefakt musí být hotový SVG soubor splňující `A.4`.

Platí:

- veškerá typografie musí být v křivkách,
- je zakázané předat jen prompt, specifikaci, skript, Figma soubor nebo generátor místo skutečného SVG,
- SVG nesmí mít externí závislosti,
- výstup musí být automaticky validovatelný,
- při předání více souborů musí být výsledkem ZIP obsahující master SVG, exporty a tento standard.

## NORMA B — Signace

### B.1 Povinné barvy signace

- pozadí: `#FF0000`
- text: `#FFFFFF`

### B.2 Povinný text signace

Text je vždy `KÁJOVO` v `ALL CAPS`, s diakritikou, `Montserrat Bold`.

### B.3 Orientace a kompozice

Signace odpovídá referenčnímu masteru.

Nesmí být:

- zrcadlená,
- deformovaná,
- graficky reinterpretovaná.

Text je vycentrovaný v červeném poli.

### B.4 Bezpečné okraje uvnitř signace

- horní a dolní okraj minimálně `6,5 %` výšky signace
- levý a pravý okraj minimálně `17 %` šířky signace

### B.5 Zakázané úpravy signace

Je zakázané:

- měnit barvy,
- měnit písmo,
- měnit řez,
- měnit case,
- měnit diakritiku,
- přidávat efekty,
- ořezávat safe margins.

### B.6 Pravidlo použití signace

Signace je povolený a preferovaný rodinný podpis, ale její trvalá přítomnost v každém view není povinná. Povinnost výskytu brand prvku ve view řeší `NORMA G`.

## NORMA C — Sestavní logo aplikace

### C.1 Závazné pořadí

- `SIGNACE`
- `MARK`
- `WORDMARK`
- případně `MOTTO`

### C.2 Typografie

- font family: `Montserrat`
- `Kájovo` ve wordmarku: `Bold`
- název aplikace: `Regular`
- `MOTTO`: `Regular`, `ALL CAPS`

### C.3 Barvy

Povolená paleta pro logo:

- `Kájovo Red #FF0000`
- `White #FFFFFF`
- `Kájovo Ink #000000`
- `Metal #737578`
- `Subtle Metal #9AA0A6`

`MARK` musí používat tři barvy:

- `#000000`
- `#737578`
- `#FF0000` pouze jako miniaturní detail

Zakázané jsou další odstíny, gradienty a dominantní červená plocha v `MARK`.

## NORMA D — Parametrická konstrukce loga

### D.1 Definice jednotky

`H` = celková výška sestavního loga bez ochranné zóny.

### D.2 Poměry prvků

- `SIGNACE`: výška `H`, šířka `(59/202)H`
- `G1` mezi `SIGNACE` a `MARK`: `10 px`
- `G2` mezi `MARK` a `WORDMARK`: `30 px`
- `MARK`: výška přesně `H`
- `WORDMARK` blok je vertikálně centrovaný vůči `H`

### D.3 Typografické velikosti

- `WORDMARK` řádek 1: cap height `0,28H`
- `MOTTO`: cap height `0,15H`
- mezřádková mezera `WORDMARK ↔ MOTTO`: `0,12H`

`MOTTO` nesmí být širší než `95 %` šířky `WORDMARK`.

### D.4 Tracking

- `Kájovo`: `0,00em`
- název aplikace: `0,00em`
- `MOTTO`: `+0,08em`

### D.5 Ochranná zóna

Ochranná zóna full loga je `0,10H` ze všech stran.

### D.6 Kontrola identického layoutu

Každé master logo musí:

- splnit poměry `D.2` s tolerancí `±2 %`,
- odpovídat paletě `C.3`,
- být ve finálních křivkách.

### D.7 Geometrická validace loga

Žádná část `SIGNACE`, `MARK`, `WORDMARK` ani `MOTTO` se nesmí geometricky protínat s jiným prvkem.

`G1` a `G2` se měří jako minimální vzdálenost mezi obrysy po aplikaci transformací.

Všechny transformace musí být před měřením geometricky vyhodnocené.

## NORMA E — Kdy je povolen MARK samostatně

`MARK` smí být bez `SIGNACE` pouze v těchto kontextech:

- favicon,
- app icon,
- launcher,
- loading nebo splash,
- extrémně malé náhledy,
- explicitně definované miniaturní kontexty.

Jinak je preferovaný `FULL LOCKUP` nebo jiný schválený brand prvek dle `NORMA G`.

## NORMA F — Intro pro portály

Intro je volitelné. Pokud je použito, musí být:

- krátké,
- statické,
- bez efektů snižujících čitelnost,
- s validními brand prvky.

Intro nenahrazuje požadavky na kvalitu view a layoutu.

## NORMA G — Přítomnost značky v UI

### G.1 Povinný brand prvek na view

Každé view musí obsahovat alespoň jeden rozpoznatelný a validní brand prvek z této množiny:

- `SIGNACE`
- `FULL LOCKUP`
- `WORDMARK`
- `MARK`, pokud jde o kontext, kde je jeho samostatné použití přípustné nebo ergonomicky vhodné

### G.2 Viditelnost a integrace

Brand prvek musí být:

- součástí skutečného layoutu view, ne skrytý pouze v menu nebo v pozdější interakci,
- čitelný,
- nepoškozený,
- ne degradovaný efekty nebo kolizí,
- nesmí narušovat použitelnost view.

### G.3 Četnost

- minimum: `1` brand prvek na view
- maximum: `2` brand prvky na view, pokud vyšší počet nemá výslovně definovaný důvod

### G.4 Povinné stavy

Brand identita musí být zachovaná i ve stavech:

- `loading`
- `empty state`
- `error state`
- `offline`
- `maintenance`
- `404` nebo obdobný fallback
- kritické utility view

## NORMA H — Barevné palety pro UI

### H.1 Primární brand paleta

- `Kájovo Red #FF0000`
- `White #FFFFFF`

`#FF0000` nesmí být používána tak, aby konkurovala identitě značky nebo nahrazovala stavové barvy.

### H.2 Povinná neutrální UI paleta

- `Ink 900 #111111`
- `Ink 700 #333333`
- `Ink 500 #666666`
- `Line 300 #E0E0E0`
- `Surface 100 #FFFFFF`
- `Surface 200 #F5F5F5`
- `Surface 300 #EEEEEE`

### H.3 Stavové barvy

- `Success #1B5E20`
- `Warning #E65100`
- `Error #B71C1C`
- `Info #0D47A1`

### H.4 Produktové sekundární palety

Jsou povolené pouze pokud:

- jsou verzované v `palette.json`,
- mají popsaný účel,
- nevytvářejí druhý brand.

## NORMA I — Governance a release gate

### I.1 Release je blokovaný, pokud

- logo porušuje `A` až `D`,
- view nemá validní brand prvek dle `G`,
- jsou použity hodnoty mimo tokeny bez evidované výjimky,
- UI porušuje `NORMA O`,
- chybí povinné stavy view,
- výsledkem je generický nebo nedokončený výstup maskovaný jako finální řešení.

### I.2 Povinné minimum kontroly

Každý produkt musí mít automatizovanou nebo manuální kontrolu, která ověří minimálně:

- validitu brand prvků,
- přítomnost povinných stavů,
- soulad s tokeny,
- soulad s `NORMA O`,
- u webových výstupů kódování `UTF-8 bez BOM` a optimalizaci pro povinné třídy zařízení dle `K`,
- u Android produktů nativní implementační model dle `NORMA L`,
- a11y minimum,
- `reduced-motion` chování,
- absenci neřízeného overflow a kolizí.

## NORMA J — Design systém: tokeny, grid, přístupnost, motion

### J.1 Povinné tokeny

Každý produkt musí mít centrálně definované tokeny pro:

- barvy
- typografii
- spacing
- radius
- elevation
- motion
- z-index
- stavy komponent

Ad-hoc hodnoty jsou zakázané, pokud nemají explicitní dočasnou výjimku.

### J.2 Grid a rozměrová disciplína

- základní mřížka: `8 pt`
- hit target touch: minimálně `44 × 44 px`
- hit target desktop: minimálně `36 × 36 px`

### J.3 Přístupnost

UI musí splnit minimálně `WCAG 2.2 AA`.

Focus ring musí být:

- viditelný,
- kontrastní.

### J.4 Typografie UI

- `H1 32/40 Bold`
- `H2 24/32 Bold`
- `H3 20/28 Bold`
- `Body 16/24 Regular`
- `Small 14/20 Regular`
- `Micro 12/16 Regular`
- `Button 14–16 Bold`

Font family je `Montserrat`.

### J.5 Radius a elevation

- `r0 = 0`
- `r8 = 8`
- `r12 = 12`
- `r16 = 16`

Elevation:

- `e0`: flat
- `e1`: karty
- `e2`: overlay
- `e3`: kritické modály

### J.6 Motion

- mikrointerakce `120–180 ms`
- přechod view `180–260 ms`
- modal nebo overlay `160–220 ms`

Zakázané jsou:

- parallax,
- nahodilý easing,
- motion snižující čitelnost nebo orientaci.

## NORMA K — Responsivita a dostupnost napříč zařízeními

### K.1 Cílové třídy zařízení

- telefon: `360–480 px`
- tablet: `768–1024 px`
- desktop: `1280–1920 px`

### K.2 Povinné breakpointy

- `sm = 0–599`
- `md = 600–1023`
- `lg = 1024–1439`
- `xl = 1440+`

### K.3 Pravidla

Klíčové funkce musí být dostupné na všech třídách zařízení.

Root viewport nesmí vytvářet horizontální scroll, s výjimkou explicitně povolených interních scroll kontejnerů.

Lokalizace nebo personalizace nesmí rozbít brand pravidla ani `NORMA O`.

U webových aplikací jsou optimalizace pro telefon, tablet a desktop dle `K.1` povinné. Nestačí pouze technická responsivita; layout, navigace, hustota informací a klíčové flow musí být pro každou třídu zařízení samostatně odladěné.

## NORMA L — Android aplikace

### L.0 Implementační model Android aplikace

Pokud je produkt dodáván jako Android aplikace, musí být kompletně nativní pro Android.

Hybridní wrappery, `WebView-first` aplikace a pouhé zabalení webu nebo PWA do APK nebo AAB nejsou v souladu s touto normou.

### L.1 Brand prvky v Android UI

Android UI musí používat validní brand prvky dle `NORMA G`.

`MARK-only` je povolen typicky pro:

- launcher icon,
- splash,
- malé systémové kontexty.

### L.2 Launcher icon

Launcher icon používá `MARK` bez `SIGNACE`.

### L.3 Adaptivní ikony

- foreground: `MARK`
- background: neutrální plocha

Dominantní červené pozadí je zakázané.

### L.4 Typografie v aplikaci

Preferovaná je `Montserrat`.

Dočasná náhrada systémovým sans-serif je povolená pouze pro provozní UI texty, nikoliv pro loga a exporty.

### L.5 Přístupnost a systémová nastavení

Musí být respektován:

- font scaling,
- reduced motion,
- případný dark mode.

Dark mode nesmí deformovat nebo reinterpretovat brand aktiva.

## NORMA M — Ekonomika pravidel a zákaz extrémně drahých omezení

Brand pravidlo nesmí vytvářet nepřiměřené UX nebo implementační náklady bez zřejmého přínosu.

Je zakázané vynucovat pevnou přítomnost jediného brand prvku na konkrétním místě obrazovky ve všech view, pokud to:

- zhoršuje ergonomii,
- překrývá ovládání,
- zdražuje layout bez přínosu.

Preferované je pravidlo `validní brand přítomnost v layoutu` místo pravidla `trvale floating prvek`.

Overlay, sticky a fixed prvky jsou přípustné pouze tehdy, když neporušují `NORMA O`, přístupnost ani použitelnost.

Pokud dvě normy vedou ke konfliktu, přednost má řešení, které zachová brand, funkčnost a ergonomii současně.

## NORMA N — Kvalita webů a zákaz nehotových výstupů

### N.1 Závaznost pro generování webů

Tento standard je závazný i pro AI, která generuje:

- stránky,
- komponenty,
- styly,
- UX flow,
- texty,
- layouty.

### N.2 Zákaz nehotových výstupů

Je zakázané generovat nebo předávat:

- minimal drafty vydávané za finální výstup,
- wireframy vydávané za produkční UI,
- neostylované komponenty bez stavů,
- UI bez `loading`, `empty` nebo `error` stavů,
- placeholder texty vydávané za skutečný obsah,
- fake implementace, které předstírají funkční stav.

### N.3 Povinná kvalita dokončení

Každý finální výstup musí být:

- plně použitelný,
- vizuálně dokončený,
- ergonomicky validní,
- v souladu s tokeny,
- bez layoutového rozpadu,
- bez generického šablonového dojmu vzniklého zanedbáním řemesla.

### N.4 Povinné stavy

Každé view musí mít hotové varianty:

- default
- hover, active a focus tam, kde dávají smysl
- loading
- empty state
- error state
- offline nebo maintenance
- `404` nebo obdobný fallback
- responsive varianty

### N.5 Ergonomie

Ergonomie se nepovažuje za subjektivní estetický dojem, ale za testovatelnou vlastnost.

Povinné je zejména:

- primární akce musí být snadno rozpoznatelná,
- navigace musí být srozumitelná,
- formuláře musí mít lokální i souhrnnou validaci,
- chybové stavy musí říkat, co se stalo a co má uživatel udělat dál,
- dlouhý obsah nesmí rozbít layout,
- žádný prvek nesmí být mimo očekávanou čitelnou nebo kliknutelnou oblast,
- výsledek musí obstát pro krátký, střední i dlouhý obsah.

## NORMA O — Geometrická integrita UI, ergonomie a zákaz rozpadů layoutu

### O.0 Základní pravidlo

Každý view, sekce, komponenta a subkomponenta musí být geometricky validní v každém podporovaném breakpointu a v každém povinném stavu.

Výstup s neřízeným overflow, kolizemi nebo porušením containmentu je neplatný.

### O.1 Binární zákaz kolizí

Žádné dva sibling prvky v témže layoutovém kontejneru se nesmí překrývat, pokud jejich vztah není explicitně definovaný jako overlay.

Překryv větší než `0 px` mezi běžnými prvky je porušení normy.

Interaktivní prvek nesmí být částečně ani plně zakryt jiným prvkem tak, že ztratí použitelnost.

### O.2 Binární zákaz přetékání

Root viewport nesmí mít horizontální overflow.

Viditelný obsah nesmí přetékat mimo bounding box svého rodiče, pokud nejde o explicitně definovaný overlay host.

Každý overflow musí být:

- záměrný,
- řízený,
- deklarovaný.

Neřízený overflow je porušení normy.

Text, ikony, badge, inputy, tlačítka, tabulky, média ani jiné prvky nesmí vizuálně vystupovat mimo svůj určený render box.

### O.3 Textová integrita

Text nesmí přesahovat hranice komponenty.

Pokud text nelze beze ztráty čitelnosti zalomit, musí být použita řízená truncace nebo jiné definované chování.

Víceřádkové texty nesmí kolidovat s okolními prvky ani při dlouhém obsahu.

Titulky a popisy musí mít takové šířky, řádkování a mezery, aby nevznikal vizuální rozpad.

### O.4 Sekční integrita

Žádná komponenta nesmí přesahovat hranice své sekce.

Žádná sekce nesmí:

- přesahovat hranice svého rodiče,
- narušovat jinou sekci.

Negativní margin nebo absolutní pozicování, které vytváří kolizi, rozpad rytmu nebo nečitelnou kompozici, je zakázané.

Každá sekce musí mít definované vnitřní a vnější spacing vztahy.

### O.5 Responsivní robustnost

Každá komponenta musí obstát minimálně pro:

- krátký obsah,
- běžný obsah,
- dlouhý obsah.

Každý view musí být validní na `sm`, `md`, `lg` a `xl`.

Nesmí existovat breakpoint, ve kterém je část komponenty:

- neviditelná,
- useknutá,
- mimo layout,
- nekliknutelná.

Média, tabulky a formuláře musí mít definované chování při nedostatku místa.

### O.6 Ergonomická validace

Primární CTA musí být v prvním viewportu nebo v jednoznačně očekávané pozici daného flow.

`Form label`, input, helper text a error text nesmí kolidovat.

Hit area a spacing musí odpovídat `J.2`.

Sticky a fixed prvky nesmí zakrývat:

- kritický obsah,
- formuláře,
- CTA,
- navigaci.

Overlay, dropdown, modal, sheet, tooltip a popover nesmí být useknuté rodičovským overflow, pokud to není explicitně požadované chování.

`z-index` vrstvy musí být tokenizované a nesmí vést ke konfliktům, při kterých běžný obsah překrývá kritickou interakci nebo naopak.

### O.7 Release gate pro layout a ergonomii

Release je blokovaný, pokud:

- jakýkoliv view má neřízený overflow,
- text přetéká mimo komponentu,
- komponenta zasahuje do jiné komponenty bez overlay vztahu,
- komponenta přesahuje svou sekci,
- sekce zasahuje do jiné sekce,
- root viewport vytváří nepovolený horizontální scroll,
- overlay je useknut rodičem,
- sticky nebo fixed prvek zakrývá kritickou interakci,
- dlouhý obsah rozbije layout,
- layout selže v některém povinném breakpointu nebo povinném stavu.

## INFORMATIVNÍ P — Doporučené podřízené dokumenty

Pro reálné vynucování tohoto standardu se doporučuje u každého produktu vést:

- komponentový katalog,
- IA mapu,
- motion specifikaci,
- a11y checklist,
- release checklist,
- content pravidla pro microcopy,
- testovací scénáře pro dlouhý obsah a extrémní stavy.

Tyto dokumenty jsou povolené pouze jako podřízené a nesmí přepisovat `NORMA`.

## INFORMATIVNÍ Q — Implementační poznámky

Layoutová a ergonomická kontrola má být součástí CI nebo povinného review.

Testy mají ověřovat:

- overflow,
- kolize,
- povinné breakpointy,
- povinné stavy,
- přítomnost brand prvků.

Výstup, který je brandově správný, ale layoutově rozpadlý, se považuje za neplatný stejně jako výstup s chybným logem.
