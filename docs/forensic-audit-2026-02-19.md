HISTORICAL DOCUMENT - superseded by docs/SSOT_SCOPE_STATUS.md (2026-03-12).

# ForenznĂ­ audit: kĂˇjovo-hotel-monorepo

Datum auditu: 2026-02-19  
Rozsah: `apps/`, `packages/`, `legacy/`, `docs/`, `ManifestDesignKĂˇjovo.md`

## NĂˇlezy

| # | Druh nĂˇlezu | PĹ™esnĂ˝ vĂ˝skyt | Popis chyby / rizika |
|---|---|---|---|
| 1 | Jen kostra / nedokonÄŤenĂ˝ modul | `apps/kajovo-hotel-api/README.md:3` | Backend je explicitnÄ› oznaÄŤen jako â€žapplication skeletonâ€ś, tj. deklarovanÄ› nedokonÄŤenĂ˝ stav. |
| 2 | Jen kostra / nedokonÄŤenĂ˝ modul | `apps/kajovo-hotel-web/README.md:3` | Frontend je explicitnÄ› oznaÄŤen jako â€žWeb application skeletonâ€ś, tj. deklarovanÄ› nedokonÄŤenĂ˝ stav. |
| 3 | NedokonÄŤenĂˇ migrace (dokumentovanĂˇ) | `docs/migration-map.md:13` | Dokument potvrzuje, Ĺľe cĂ­lovĂˇ API aplikace je stĂˇle skeleton a migrace nenĂ­ uzavĹ™ena. |
| 4 | ChybÄ›jĂ­cĂ­ modul (podle migraÄŤnĂ­ho plĂˇnu) | `docs/migration-map.md:22` + chybÄ›jĂ­cĂ­ adresĂˇĹ™ `apps/kajovo-hotel-web/src/legacy-parity/` | MigraÄŤnĂ­ plĂˇn poÄŤĂ­tĂˇ s cĂ­lem `src/legacy-parity/`, ale adresĂˇĹ™ v aktuĂˇlnĂ­m stromu chybĂ­. |
| 5 | ChybnĂ˝ zdrojovĂ˝ kĂłd (duplicitnĂ­ atribut) | `apps/kajovo-hotel-api/app/db/models.py:90-99` | `LostFoundItem` definuje `updated_at` dvakrĂˇt; druhĂˇ definice pĹ™episuje prvnĂ­ (copy/paste chyba). |
| 6 | ChybnĂ˝ zdrojovĂ˝ kĂłd (duplicitnĂ­ atribut) | `apps/kajovo-hotel-api/app/db/models.py:141-150` | `Issue` definuje `updated_at` dvakrĂˇt; stejnĂ˝ problĂ©m s pĹ™episem atributu. |
| 7 | ChybnĂ˝ zdrojovĂ˝ kĂłd (duplicitnĂ­ atribut) | `apps/kajovo-hotel-api/app/db/models.py:169-178` | `InventoryItem` definuje `updated_at` dvakrĂˇt; stejnĂ˝ problĂ©m s pĹ™episem atributu. |
| 8 | ChybnĂ˝ zdrojovĂ˝ kĂłd (typovĂ˝ nesoulad) | `apps/kajovo-hotel-api/app/db/models.py:19,46,89,140,168,197,215` | Sloupce `DateTime` jsou typovanĂ© jako `Mapped[str]` mĂ­sto `Mapped[datetime]`/`Mapped[datetime\|None]`; riziko chyb v type-checkingu i serializaci. |
| 9 | Placeholder / nepropracovanĂ˝ kĂłd | `apps/kajovo-hotel-web/src/main.tsx:127` | `defaultServiceDate = '2026-02-19'` je hardcoded hodnota pĹŻsobĂ­cĂ­ jako doÄŤasnĂ˝ placeholder mĂ­sto runtime logiky â€ždnesâ€ś. |
| 10 | NepropracovanĂ© chovĂˇnĂ­ / kĹ™ehkĂ© API mapovĂˇnĂ­ | `apps/kajovo-hotel-web/src/main.tsx:362` | Fallback `throw new Error("Unsupported API call")` v centrĂˇlnĂ­m adapteru znamenĂˇ tvrdĂ˝ pĂˇd pĹ™i neobslouĹľenĂ© endpoint variantÄ›. |
| 11 | Placeholder implementace | `legacy/hotel-backend/app/security/rate_limit.py:136-139` | `RateLimitMiddleware` je explicitnÄ› â€žNo-op middleware placeholderâ€ś (prĂˇzdnĂˇ kostra middleware). |
| 12 | Placeholder implementace | `legacy/hotel-backend/app/security/csrf.py:268-270` | `csrf_protect` je explicitnÄ› placeholder funkce, kterĂˇ nic nevykonĂˇvĂˇ (`return None`). |
| 13 | PotlaÄŤenĂˇ chyba / nepropracovanĂ© error handling | `legacy/hotel-backend/app/web/routes.py:813-816` a `legacy/hotel-frontend/routes.py:818-821` | Blok `except Exception: pass` tiĹˇe ignoruje chybu pĹ™i mazĂˇnĂ­ media souborĹŻ; ztrĂˇta diagnostiky a auditovatelnosti. |
| 14 | Nesoulad s manifestem designu | `ManifestDesignKĂˇjovo.md:551-557` vs. `apps/kajovo-hotel-api/README.md:3` a `apps/kajovo-hotel-web/README.md:3` | Manifest zakazuje â€žbasic/MVP/skeleton/placeholderâ€ś vĂ˝stupy, ale obÄ› hlavnĂ­ aplikace jsou textovÄ› deklarovĂˇny jako skeleton. |
| 15 | NeuzavĹ™enĂ˝ refaktor / nedokonÄŤenĂ© UI bloky | `legacy/hotel-frontend/REFACTOR_AUDIT_REPORT.md:18-19` | Audit ve `legacy` explicitnÄ› Ĺ™Ă­kĂˇ, Ĺľe zbĂ˝vĂˇ pĹ™epsat hlubĹˇĂ­ admin bloky; prĂˇce je stĂˇle nedokonÄŤenĂˇ. |

## PoznĂˇmka

Tento audit eviduje pouze prokazatelnĂ© nĂˇlezy s pĹ™esnĂ˝m vĂ˝skytem v repozitĂˇĹ™i (soubor + Ĺ™Ăˇdek).

