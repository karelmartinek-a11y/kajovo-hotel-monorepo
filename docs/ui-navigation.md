# Navigace portálu a administrace

Přihlášené stránky obou aplikací používají `packages/ui/src/shell/AppShell.tsx`. Uživatelský portál má na všech velikostech obrazovky pevné spodní zápatí s čtvercovými kreslenými piktogramy a viditelnými názvy. Ukazuje Profil a jednotlivé pohledy dostupné aktivnímu účtu: Pokoje, Recepce, Snídaně, Ztráty a nálezy, Závady, Skladové hospodářství a Hlášení. Delší řada se posouvá vodorovně. Přechod do pohledu jiné přiřazené role nejprve bezpečně změní aktivní roli přes `/api/auth/select-role`. Záhlaví obsahuje přepínač jazyka a ikonu Odhlásit; odhlášení používá CSRF chráněný endpoint `/api/auth/logout`.

Administrace používá vlastní `ModuleNavigation.tsx`, samostatný profil a základní cestu `/admin`. Její postranní panel, tabletové záhlaví a mobilní menu zůstávají zachované. Přihlašovací a servisní stránky používají veřejné rozložení. Aktivní položka zápatí portálu je označena také na podstránkách.

Vizuální testy portálu a administrace pořizují snímky testovaných přihlášených sekcí pro desktop, tablet a telefon. Portál ověřuje zápatí, ikonu odhlášení, značku a nepřítomnost vodorovného přesahu dokumentu. Snímky běžných provozních dat se ukládají jako výstup Playwright běhu mimo verzované zdrojové soubory.
