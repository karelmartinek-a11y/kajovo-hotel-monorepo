# Developer Handbook

Tento dokument shrnuje current-state minimum pro vývoj na portálu bez přímého SSH přístupu na produkční server.

## 1. Source of truth

- Zdrojový kód: GitHub repozitář `karelmartinek-a11y/kajovo-hotel-monorepo`, branch `main`.
- Produkce se nasazuje automaticky z `main` přes GitHub Actions workflow `Deploy - hotel.hcasc.cz`.
- Kopie na serveru v `/opt/kajovo-hotel-monorepo` je pouze deploy workspace, ne autoritativní zdroj pravdy.

## 2. Co musí vývojář znát

- design governance SSOT: [`docs/Kajovo_Design_Governance_Standard_SSOT.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/Kajovo_Design_Governance_Standard_SSOT.md)
- implementační plán souladu: [`docs/forenzni-plan-implementace-kdgs-2026-03-16.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/forenzni-plan-implementace-kdgs-2026-03-16.md)
- informační architektura: [`apps/kajovo-hotel/ux/ia.json`](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel/ux/ia.json)
- RBAC pravidla: [`docs/rbac.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/rbac.md)
- release checklist: [`docs/release-checklist.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/release-checklist.md)
- CI gate popis: [`docs/ci-gates.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/ci-gates.md)

## 3. Lokální spuštění

Používej `pnpm` workspaces z rootu repozitáře.

```bash
pnpm install
```

API:

```bash
cd apps/kajovo-hotel-api
python -m pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
```

Admin aplikace:

```bash
cd apps/kajovo-hotel-admin
pnpm dev
```

Portálový web:

```bash
cd apps/kajovo-hotel-web
pnpm dev
```

## 4. Povinné kontroly před push

Minimální current-state sada:

```bash
pnpm typecheck
pnpm unit
pnpm ci:gates
pnpm ci:visual
pnpm ci:e2e-smoke
pnpm contract:check
```

Když změna sahá do API Python kódu:

```bash
python -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests
```

Když změna sahá do UI, auth, role, SMTP, workflow nebo release toku, zkontroluj navíc:

- [`docs/Kajovo_Design_Governance_Standard_SSOT.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/Kajovo_Design_Governance_Standard_SSOT.md)
- [`docs/forenzni-plan-implementace-kdgs-2026-03-16.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/forenzni-plan-implementace-kdgs-2026-03-16.md)
- [`docs/release-checklist.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/release-checklist.md)
- [`docs/rbac.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/rbac.md)

## 5. GitHub pipeline

Push do `main` spouští:

- `CI Gates - KajovoHotel`
- `CI Full - Kajovo Hotel`
- `CI Release - Kajovo Hotel`

Produkční deploy `Deploy - hotel.hcasc.cz` se spouští po úspěšném `CI Gates - KajovoHotel` na `main` nebo ručně.

Podrobnosti a přesné blokující joby jsou v [`docs/ci-gates.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/ci-gates.md).

## 6. GitHub secrets a variables pro produkční deploy

Autoritativní checklist: [`docs/github-settings-checklist.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/github-settings-checklist.md)

Deploy a CI workflow používají tyto klíče:

- `HOTEL_DEPLOY_HOST`
- `HOTEL_DEPLOY_PORT`
- `HOTEL_DEPLOY_USER`
- `HOTEL_DEPLOY_PASS`
- `HOTEL_ADMIN_EMAIL`
- `HOTEL_ADMIN_PASSWORD`

Admin username je stejná hodnota jako admin e-mail, takže `HOTEL_ADMIN_EMAIL` funguje jako login e-mail i username.

Volitelné aliasy:

- `KAJOVO_API_ADMIN_EMAIL`
- `KAJOVO_API_ADMIN_PASSWORD`

Pokud jsou aliasy přítomné, musí se shodovat s `HOTEL_ADMIN_EMAIL` a `HOTEL_ADMIN_PASSWORD`. CI, deploy i post-deploy verify to vynucují a žádný GitHub workflow nepoužívá hardcoded admin účet.

Credentials se nikdy necommitují do repozitáře ani dokumentace. Produkční compose blokuje start API, pokud výsledné admin credentials chybí.

## 7. Post-deploy smoke check

Produkční deploy workflow blokuje release, pokud neprojdou všechny tyto kontroly:

- `GET https://hotel.hcasc.cz/`
- `GET https://hotel.hcasc.cz/admin/login`
- `GET https://hotel.hcasc.cz/api/health`
- live admin login přes kanonický admin e-mail a heslo z nasazeného runtime
- live smoke správy uživatelů
