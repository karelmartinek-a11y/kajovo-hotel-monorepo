# Developer Handbook

Tento dokument shrnuje, co potřebuje vývojář pro práci na portálu bez přímého SSH přístupu na produkční server.

## 1. Source of truth

- Zdrojový kód: GitHub repozitář `karelmartinek-a11y/kajovo-hotel-monorepo`, branch `main`.
- Produkce se nasazuje automaticky z `main` přes GitHub Actions workflow `Deploy - hotel.hcasc.cz`.
- Kopie na serveru v `/opt/kajovo-hotel-monorepo` je pouze deploy workspace, ne autoritativní zdroj pravdy.

## 2. Co musí vývojář znát

- Design governance SSOT: `docs/Kajovo_Design_Governance_Standard_SSOT.md`
- Runtime truth SSOT: `docs/forensics/runtime-truth-ssot-2026-03-15.md`
- Inventář bootstrapu a simulací: `docs/forensics/bootstrap-and-simulation-inventory-2026-03-15.md`
- Live proof backlog: `docs/forensics/live-proof-backlog-2026-03-15.md`
- Informační architektura: `apps/kajovo-hotel/ux/ia.json`
- RBAC pravidla: `docs/rbac.md`
- Forenzní parity matrix: `docs/feature-parity-matrix.csv`
- Pracovní chronologie: `docs/forensics/finalization-log.md`

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

```bash
pnpm lint
pnpm typecheck
pnpm unit
pnpm ci:gates
```

Když změna sahá do UI, runtime pravdivosti, forenzních dokumentů nebo bootstrap/test helperů, zkontroluj navíc:

- `docs/Kajovo_Design_Governance_Standard_SSOT.md`
- `docs/forensics/runtime-truth-ssot-2026-03-15.md`
- `docs/forensics/bootstrap-and-simulation-inventory-2026-03-15.md`
- `docs/forensics/live-proof-backlog-2026-03-15.md`

## 5. GitHub pipeline

Push do `main` spouští:

- `CI Gates - KajovoHotel`
- `CI Full - Kajovo Hotel`
- `CI Release - Kajovo Hotel`
- po úspěšné autoritativní CI gate: `Deploy - hotel.hcasc.cz`

## 6. GitHub secrets a variables pro produkční deploy

Autoritativní checklist: `docs/github-settings-checklist.md`

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

Pokud jsou aliasy přítomné, musí se shodovat s `HOTEL_ADMIN_EMAIL` a `HOTEL_ADMIN_PASSWORD`. CI, deploy i post-deploy verify to vynucují a žádný GitHub workflow nepoužívá hardcoded fallback admin účet.

Credentials se nikdy necommitují do repozitáře ani dokumentace. Produkční compose blokuje start API, pokud výsledné admin credentials chybí.

## 7. Post-deploy smoke check

Produkční deploy workflow blokuje release, pokud neprojdou všechny tyto kontroly:

- `GET https://hotel.hcasc.cz/`
- `GET https://hotel.hcasc.cz/admin/login`
- `GET https://hotel.hcasc.cz/api/health`
- live admin login přes GitHub admin e-mail nebo username a heslo
