# Navigace portálu a administrace

Přihlášené stránky obou aplikací používají `packages/ui/src/shell/AppShell.tsx` a `ModuleNavigation.tsx`. Portál předává moduly podle aktivní role a oprávnění, administrace sestavuje vlastní povolené moduly. Odkaz na `/profil` je samostatnou součástí shellu; administrační router používá základní cestu `/admin`. Přihlašovací a servisní stránky mají vlastní veřejné rozložení.

- Od šířky 1180 px je navigace v pevném levém panelu. Panel obsahuje všechny povolené sekce a samostatný profil; u portálu zůstávají přepínače jazyka a role.
- Do šířky 1179 px je záhlaví přichycené k horní hraně. První řádek obsahuje značku a profil, další přímo klikatelné názvy povolených sekcí. Posouvá se pouze řádek sekcí, nikoli dokument do strany.
- Do šířky 767 px zůstává k dispozici také vyhledávací menu; přímé odkazy jsou viditelné i bez jeho otevření. Přepínače portálu jsou v samostatném řádku záhlaví.
- Aktivní sekce je označena i na jejích podstránkách. Položky, pro které účet nemá oprávnění, se do navigace nezařazují.

Vizuální testy portálu a administrace pořizují snímky všech testovaných přihlášených sekcí pro desktop, tablet a telefon. Ověřují existenci přímých odkazů, profilu, značky a nepřítomnost vodorovného přesahu dokumentu. Snímky běžných provozních dat se ukládají jako výstup Playwright běhu mimo verzované zdrojové soubory.
