HISTORICAL DOCUMENT - superseded by docs/SSOT_SCOPE_STATUS.md (2026-03-12).

# ForenznĂ­ audit 2026-03-01 (legacy vs kajovo-hotel-monorepo)

## 1) RozdĂ­ly obsahu: legacy `hotel-frontend` + `hotel-backend` vs. monorepo

### Stav po opravĂˇch v tomto cyklu

| Oblast | Legacy poĹľadavek | Monorepo stav | Evidence |
|---|---|---|---|
| Admin/User auth lockout + tichĂ© chovĂˇnĂ­ | 3 pokusy / 1h, generickĂ© chyby, unlock link | **OPRAVENO** | `apps/kajovo-hotel-api/app/api/routes/auth.py` |
| Multi-role login + role switch | role selection pĹ™ed pĹ™Ă­stupem do modulĹŻ | **OPRAVENO** | `apps/kajovo-hotel-api/app/api/routes/auth.py`, `app/security/rbac.py` |
| Admin Users (list/create/edit/reset-link) | CRUD + reset link + validace | **OPRAVENO** | `apps/kajovo-hotel-api/app/api/routes/users.py`, `app/api/schemas.py` |
| E.164 telefon + validace emailu | povinnĂˇ validace | **OPRAVENO** | `apps/kajovo-hotel-api/app/api/schemas.py` |
| RBAC role set (pokojskĂˇ/ĂşdrĹľba/recepce/snĂ­danÄ›) | bez driftu rolĂ­ | **OPRAVENO (kanonickĂˇ vrstva)** | `apps/kajovo-hotel-api/app/security/rbac.py`, `app/api/schemas.py` |

### OtevĹ™enĂ© funkÄŤnĂ­ GAPy

| Oblast | Legacy poĹľadavek | Monorepo stav | Dopad |
|---|---|---|---|
| SnĂ­danÄ›: import PDF + IMAP fetch workflow | ruÄŤnĂ­ PDF import + periodickĂ© fetch z mailu | **CHYBĂŤ** (v API je CRUD, nenĂ­ import/fetch pipeline) | chybĂ­ provoznĂ­ automatizace snĂ­danĂ­ |
| Sklad: piktogramy/ikony poloĹľek + upload | ikony a jejich sprĂˇva | **CHYBĂŤ** | niĹľĹˇĂ­ UX a chybĂ­ parity s legacy procesem |
| ZĂˇvady/ZtrĂˇty: foto upload + thumbnails | foto dokumentace k zĂˇznamĹŻm | **CHYBĂŤ** | chybĂ­ klĂ­ÄŤovĂˇ procesnĂ­ evidence |

## 2) ForenznĂ­ kontrola login oddÄ›lenĂ­ (User vs Admin)

### OvÄ›Ĺ™enĂ© body

- OddÄ›lenĂ© endpointy a session flow:
  - admin login: `/api/auth/admin/login`
  - user login: `/api/auth/login`
- Admin lockout je maskovanĂ˝ stejnou odpovÄ›dĂ­ `401 Invalid credentials`.
- Unlock token flow a throttle pro admin hint jsou implementovĂˇny.
- User lockout + forgot-password je implementovĂˇn.
- Multi-role session vyĹľaduje `active_role` pĹ™ed pĹ™Ă­stupem k modulĹŻm.

### Evidence

- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- `apps/kajovo-hotel-api/app/security/rbac.py`
- `apps/kajovo-hotel-api/tests/test_auth_lockout.py`
- `apps/kajovo-hotel-api/tests/test_auth_role_selection.py`

## 3) ForenznĂ­ kontrola souladu s ManifestDesignKĂˇjovo

### OpravenĂ© body

- Login admin uĹľ nepouĹľĂ­vĂˇ full-page background; brand prvky jsou samostatnĂ© (`logo` + samostatnĂ˝ vizuĂˇlnĂ­ panel s KĂˇjou).
- V aplikaÄŤnĂ­m shellu je doplnÄ›nĂˇ personifikace KĂˇja po modulech jako samostatnĂ˝ brand prvek.
- Signace zĹŻstĂˇvĂˇ v shellu a je zachovĂˇna i po zmÄ›nĂˇch.
- Brand assety pro admin i web jsou sjednocenĂ© v public cestĂˇch (wordmark + postavy), takĹľe login i internĂ­ obrazovky renderujĂ­ logo/KĂˇju bez zĂˇvislosti na panel PNG.
- Na login obrazovkĂˇch (user i admin) je renderovanĂˇ i signace jako samostatnĂ˝ brand element.
- User login mĂˇ doplnÄ›nĂ˝ flow â€žzapomenutĂ© hesloâ€ś volajĂ­cĂ­ `/api/auth/forgot-password` s generickou odpovÄ›dĂ­.

### Evidence

- `apps/kajovo-hotel-admin/src/main.tsx`
- `packages/ui/src/shell/AppShell.tsx`
- `packages/ui/src/tokens.css`

### OtevĹ™enĂ© design GAPy

- Personifikace je nynĂ­ Ĺ™eĹˇenĂˇ samostatnĂ˝mi assety postavy KĂˇji (ne pĹ™es full panel obraz), ale nenĂ­ jeĹˇtÄ› plnÄ› diferencovanĂˇ po vĹˇech sub-flow stavech (create/edit/detail/fail) podle vĹˇech panel podkladĹŻ.

## 4) DĹŻkaznĂ­ bÄ›hy (aktuĂˇlnĂ­)

- API testy: `cd apps/kajovo-hotel-api && pytest -q` â†’ **27 passed**.
- Web CI testy: `pnpm test` â†’ **34 passed, 2 skipped**.

## 5) ZĂˇvÄ›r

- KritickĂ© auth + users regressions jsou opravenĂ©.
- Login separace, lockout chovĂˇnĂ­ a admin/user UI jsou vĂ˝raznÄ› dorovnanĂ©.
- SMTP settings modul v admin UI je implementovanĂ˝ vÄŤetnÄ› test e-mailu.
- IMAP/scheduler ingest snĂ­daĹovĂ˝ch PDF je nynĂ­ implementovanĂ˝ v API sluĹľbÄ›, ale je podmĂ­nÄ›nĂ˝ produkÄŤnĂ­m IMAP nastavenĂ­m pĹ™es env.
- Pro plnou parity akceptaci zbĂ˝vĂˇ hlavnÄ› admin profil (zmÄ›na hesla) a forenznĂ­ ovÄ›Ĺ™enĂ­ IMAP ingestu na produkÄŤnĂ­ch datech.

