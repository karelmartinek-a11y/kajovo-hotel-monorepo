# Forenzní audit: kájovo-hotel-monorepo

Datum auditu: 2026-02-19  
Rozsah: `apps/`, `packages/`, `legacy/`, `docs/`, `ManifestDesignKájovo.md`

## Nálezy

| # | Druh nálezu | Přesný výskyt | Popis chyby / rizika |
|---|---|---|---|
| 1 | Jen kostra / nedokončený modul | `apps/kajovo-hotel-api/README.md:3` | Backend je explicitně označen jako „application skeleton“, tj. deklarovaně nedokončený stav. |
| 2 | Jen kostra / nedokončený modul | `apps/kajovo-hotel-web/README.md:3` | Frontend je explicitně označen jako „Web application skeleton“, tj. deklarovaně nedokončený stav. |
| 3 | Nedokončená migrace (dokumentovaná) | `docs/migration-map.md:13` | Dokument potvrzuje, že cílová API aplikace je stále skeleton a migrace není uzavřena. |
| 4 | Chybějící modul (podle migračního plánu) | `docs/migration-map.md:22` + chybějící adresář `apps/kajovo-hotel-web/src/legacy-parity/` | Migrační plán počítá s cílem `src/legacy-parity/`, ale adresář v aktuálním stromu chybí. |
| 5 | Chybný zdrojový kód (duplicitní atribut) | `apps/kajovo-hotel-api/app/db/models.py:90-99` | `LostFoundItem` definuje `updated_at` dvakrát; druhá definice přepisuje první (copy/paste chyba). |
| 6 | Chybný zdrojový kód (duplicitní atribut) | `apps/kajovo-hotel-api/app/db/models.py:141-150` | `Issue` definuje `updated_at` dvakrát; stejný problém s přepisem atributu. |
| 7 | Chybný zdrojový kód (duplicitní atribut) | `apps/kajovo-hotel-api/app/db/models.py:169-178` | `InventoryItem` definuje `updated_at` dvakrát; stejný problém s přepisem atributu. |
| 8 | Chybný zdrojový kód (typový nesoulad) | `apps/kajovo-hotel-api/app/db/models.py:19,46,89,140,168,197,215` | Sloupce `DateTime` jsou typované jako `Mapped[str]` místo `Mapped[datetime]`/`Mapped[datetime\|None]`; riziko chyb v type-checkingu i serializaci. |
| 9 | Placeholder / nepropracovaný kód | `apps/kajovo-hotel-web/src/main.tsx:127` | `defaultServiceDate = '2026-02-19'` je hardcoded hodnota působící jako dočasný placeholder místo runtime logiky „dnes“. |
| 10 | Nepropracované chování / křehké API mapování | `apps/kajovo-hotel-web/src/main.tsx:362` | Fallback `throw new Error("Unsupported API call")` v centrálním adapteru znamená tvrdý pád při neobsloužené endpoint variantě. |
| 11 | Placeholder implementace | `legacy/hotel-backend/app/security/rate_limit.py:136-139` | `RateLimitMiddleware` je explicitně „No-op middleware placeholder“ (prázdná kostra middleware). |
| 12 | Placeholder implementace | `legacy/hotel-backend/app/security/csrf.py:268-270` | `csrf_protect` je explicitně placeholder funkce, která nic nevykonává (`return None`). |
| 13 | Potlačená chyba / nepropracované error handling | `legacy/hotel-backend/app/web/routes.py:813-816` a `legacy/hotel-frontend/routes.py:818-821` | Blok `except Exception: pass` tiše ignoruje chybu při mazání media souborů; ztráta diagnostiky a auditovatelnosti. |
| 14 | Nesoulad s manifestem designu | `ManifestDesignKájovo.md:551-557` vs. `apps/kajovo-hotel-api/README.md:3` a `apps/kajovo-hotel-web/README.md:3` | Manifest zakazuje „basic/MVP/skeleton/placeholder“ výstupy, ale obě hlavní aplikace jsou textově deklarovány jako skeleton. |
| 15 | Neuzavřený refaktor / nedokončené UI bloky | `legacy/hotel-frontend/REFACTOR_AUDIT_REPORT.md:18-19` | Audit ve `legacy` explicitně říká, že zbývá přepsat hlubší admin bloky; práce je stále nedokončená. |

## Poznámka

Tento audit eviduje pouze prokazatelné nálezy s přesným výskytem v repozitáři (soubor + řádek).
