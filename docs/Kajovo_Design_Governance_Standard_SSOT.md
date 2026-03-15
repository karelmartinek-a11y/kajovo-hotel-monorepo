# Kájovo Design Governance Standard (SSOT)

Datum: 2026-03-15
Typ dokumentu: závazný řídící dokument
Zdroj: převzato a zapsáno do repozitáře podle dokumentu `Kajovo_Design_Governance_Standard_revised.docx`

## Účel a autorita

Tento soubor je jediný závazný a řídící dokument repozitáře pro:

- značku rodiny Kájovo,
- integraci značky do UI,
- ergonomii,
- layoutové normy,
- kvalitu finálních UI výstupů,
- pravidla pro AI generované nebo AI upravované výstupy.

Pokud jakýkoliv README, ticket, e-mail, komentář, Figma poznámka nebo jiný dokument odporuje tomuto souboru, neplatí.

Podřízené dokumenty smějí:

- konkretizovat implementaci,
- popsat proces,
- doplnit testovací postupy,
- rozpracovat komponenty, layouty a UX flow.

Podřízené dokumenty nesmějí:

- přepisovat tento standard,
- zavádět alternativní brand pravidla,
- zavádět alternativní palety, typografii nebo geometrii,
- zavádět výjimky bez výslovného zápisu.

## Binární pravidlo platnosti

Výstup je platný jen tehdy, když neporušuje žádné pravidlo tohoto dokumentu.

Neexistuje:

- „téměř hotovo“,
- „vizuálně skoro správně“,
- „dočasně bez dopadu“,
- „výjimka bez zápisu“.

Pokud je porušeno libovolné normativní pravidlo, výstup je neplatný a nesmí být publikován ani předán jako hotový.

## Závaznost pro AI

Tento standard je závazný i pro AI agenty a modely pracující nad repozitářem.

AI nesmí:

- vydávat nehotový výstup za hotový,
- nahrazovat požadovaný binární výstup pouhým popisem, pseudokódem nebo návodem,
- předstírat funkčnost pomocí placeholderů, fake implementací nebo rozpadlého layoutu.

Pokud AI nemůže dodat celé řešení, musí:

- dodat maximální hotovou část,
- jasně oddělit hotové a nedokončené části,
- přesně uvést důvod nedokončení.

## Zákaz placeholderů a neuzavřených norem

V závazných částech dokumentace a řízení je zakázané používat:

- `TODO`
- `TBD`
- `FIXME`
- `doplnit`
- `později`
- jinou neuzavřenou formulaci

Stejně tak je zakázané předat jako finální:

- wireframe vydávaný za produkční UI,
- neostylovanou komponentu bez stavů,
- UI bez loading, empty nebo error stavů,
- placeholder text vydávaný za skutečný obsah,
- fake implementaci, která předstírá funkční stav.

## Základní brand a UI pravidla

Každé view musí obsahovat alespoň jeden validní a rozpoznatelný brand prvek z množiny:

- `SIGNACE`
- `FULL LOCKUP`
- `WORDMARK`
- `MARK`, pokud je jeho samostatné použití v daném kontextu přípustné

Četnost na view:

- minimum: 1 brand prvek
- maximum: 2 brand prvky, pokud není výslovně zdůvodněno jinak

Brand prvek musí být:

- součástí skutečného layoutu view,
- čitelný,
- kontrastní,
- nepoškozený,
- bez efektů nebo kolizí,
- nesmí narušovat použitelnost view.

## Povinné stavy view

Každé view musí mít hotové a validní varianty:

- default
- hover, active a focus tam, kde dávají smysl
- loading
- empty state
- error state
- offline nebo maintenance
- `404` nebo obdobný fallback
- responsive varianty

Brand integrita musí být zachovaná i v těchto stavech.

## Ergonomie a validace formulářů

Ergonomie je testovatelná vlastnost, ne subjektivní estetický dojem.

Platí zejména:

- primární akce musí být snadno rozpoznatelná,
- navigace musí být srozumitelná,
- formuláře musí mít lokální i souhrnnou validaci,
- chybové stavy musí říkat, co se stalo a co má uživatel udělat dál,
- dlouhý obsah nesmí rozbít layout,
- žádný prvek nesmí být mimo očekávanou čitelnou nebo kliknutelnou oblast.

## Geometrická integrita a zákaz rozpadů

Každé view, sekce, komponenta i subkomponenta musí být geometricky validní v každém podporovaném breakpointu a v každém povinném stavu.

Je zakázané:

- neřízený overflow,
- překryv běžných sibling prvků mimo explicitní overlay vztah,
- useknutý nebo nepoužitelný interaktivní prvek,
- text přetékající mimo hranice komponenty,
- sekce přesahující do jiné sekce,
- negativní layoutové hacky vytvářející kolize nebo rozpad rytmu,
- breakpoint, ve kterém je část UI neviditelná, useknutá nebo nekliknutelná.

Root viewport nesmí mít horizontální overflow s výjimkou explicitně řízených interních scroll kontejnerů.

## Tokeny, grid a přístupnost

Každý produkt musí mít centrálně definované tokeny minimálně pro:

- barvy
- typografii
- spacing
- radius
- elevation
- motion
- z-index
- stavy komponent

Ad-hoc hodnoty jsou zakázané bez explicitní dočasné výjimky.

Další závazná minima:

- základní mřížka: `8 pt`
- touch hit target: minimálně `44 × 44 px`
- desktop hit target: minimálně `36 × 36 px`
- minimální úroveň přístupnosti: `WCAG 2.2 AA`
- focus ring musí být viditelný a kontrastní

## Responsivita

Každý view musí být validní minimálně na:

- `sm = 0–599`
- `md = 600–1023`
- `lg = 1024–1439`
- `xl = 1440+`

Klíčové funkce musí být dostupné na všech třídách zařízení.

## Release gate

Release je blokovaný, pokud platí alespoň jedna z těchto podmínek:

- view nemá validní brand prvek,
- chybí povinné stavy view,
- UI porušuje geometrickou integritu nebo ergonomii,
- jsou použité hodnoty mimo tokeny bez evidované výjimky,
- výstup je generický, nedokončený nebo maskovaný jako finální řešení,
- AI nebo člověk předává placeholder, fake implementaci nebo rozpadlý layout jako hotový výstup.

## Vazba na zbytek repozitare

Tento dokument je zavazny pro brand, UI, ergonomii i pravdivost finalniho vystupu.

Repo nesmi obsahovat aktivni runtime, testy, CI ani dokumentaci, ktere predstiraji realitu pomoci mocku, fallbacku, placeholderu nebo bootstrap obchazek.