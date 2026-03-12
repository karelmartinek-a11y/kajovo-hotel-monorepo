# A) Cíl
Zpřísnit kompozici brandových elementů v admin aplikaci a nahradit hardkódované datum výchozí hodnotou odvozenou z lokálního časového pásma za běhu.

# B) Exit criteria
- AppShell defaultně renderuje `showFigure = false`, takže non-popup views nezobrazují více než 2 brand elementy.
- Admin login view zobrazuje přesně 2 brand elementy (wordmark + figure).
- Hardkódované datum `2026-02-19` bylo odstraněno ze zdrojového kódu admin aplikace.
- Utility `toLocalDateInputValue()` vrací správně formátovaný lokální datum pro defaultní hodnoty formulářů.
- CI testy prochází bez chyb.

# C) Změny
- `packages/ui/src/shell/AppShell.tsx`: `showFigure` má výchozí hodnotu `false`.
- `apps/kajovo-hotel-admin/src/main.tsx`: Odstraněn plovoucí duplikát znaku z login route; wordmark označen `data-brand-element="true"`.
- `apps/kajovo-hotel-admin/src/dateDefaults.ts`: Nová utilita `toLocalDateInputValue()` pro runtime výchozí datum.
- `apps/kajovo-hotel-admin/tests/ci-gates.spec.ts`: Rozšíření Playwright testů o timezone-aware test výchozích dat a kontrolu počtu brand elementů.

# D) Ověření
- Spustit `pnpm --filter @kajovo/kajovo-hotel-admin lint` – musí proběhnout bez chyb.
- Ověřit absenci hardkódovaného data v admin zdrojových souborech (`grep -r "2026-02-19" apps/kajovo-hotel-admin/src`).
- Playwright CI gate testy ověřují počet brand elementů a správnost výchozích hodnot data.
- CI musí projít bez chyb.

# E) Rizika/known limits
- Playwright testy vyžadují stažení browser binaries, které nemusí být dostupné v sandboxovaném prostředí; testy jsou navrženy pro spuštění v CI.
- Timezone-aware datum test předpokládá, že CI runner má správně nastavené systémové časové pásmo.

# F) Handoff pro další prompt
Při dalších změnách brand kompozice udržovat invariant max 2 brand elementů per view. Při přidávání formulářů s datem používat `toLocalDateInputValue()` z `dateDefaults.ts` namísto hardkódovaných hodnot.
