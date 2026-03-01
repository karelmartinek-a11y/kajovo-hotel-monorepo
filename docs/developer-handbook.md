# Developer Handbook (bez přístupu na server)

Tento dokument říká vše, co vývojář potřebuje pro práci na portálu bez SSH přístupu na produkční server.

## 1) Zdroj pravdy

- Zdrojové kódy: GitHub repozitář `karelmartinek-a11y/kajovo-hotel-monorepo`, branch `main`.
- Produkce se nasazuje automaticky z `main` přes GitHub Actions workflow `Deploy - hotel.hcasc.cz`.
- Lokální kopie na serveru (`/opt/kajovo-hotel-monorepo`) je pouze deploy checkout, ne primární zdroj pravdy.

## 2) Co musí vývojář znát

- Design SSOT: `ManifestDesignKájovo.md` (v rootu repozitáře).
- Informační architektura: `apps/kajovo-hotel/ux/ia.json`.
- RBAC pravidla: `docs/rbac.md`.
- Forenzní stav parity: `docs/feature-parity-matrix.csv`, `docs/forensic-audit-2026-03-01.md`.

## 3) Lokální spuštění

Použij `pnpm` workspaces z rootu repozitáře.

```bash
pnpm install
```

API:

```bash
cd apps/kajovo-hotel-api
python -m pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
```

Admin app:

```bash
cd apps/kajovo-hotel-admin
pnpm dev
```

Portal web app:

```bash
cd apps/kajovo-hotel-web
pnpm dev
```

## 4) Povinné kontroly před push

```bash
pnpm lint
pnpm typecheck
pnpm unit
pnpm ci:gates
```

## 5) GitHub pipelines

Při push do `main` běží:

- `CI Gates - KájovoHotel`
- `CI Full - Kájovo Hotel`
- po úspěchu CI Full: `Deploy - hotel.hcasc.cz`

## 6) GitHub Secrets / Variables (produkční deploy)

Workflow `deploy-production.yml` používá tyto klíče (primárně `secrets`, fallback `vars`):

- `HOTEL_DEPLOY_HOST`
- `HOTEL_DEPLOY_PORT`
- `HOTEL_DEPLOY_USER`
- `HOTEL_DEPLOY_KEY` (preferováno) nebo `HOTEL_DEPLOY_PASS` (fallback)
- `HOTEL_ADMIN_EMAIL`
- `HOTEL_ADMIN_PASSWORD`

Poznámka: credentialy se nikdy necommitují do repozitáře ani do dokumentace.

## 7) Provozní smoke-check po deploy

Minimálně:

- `GET https://hotel.hcasc.cz/`
- `GET https://hotel.hcasc.cz/login`
- `GET https://hotel.hcasc.cz/admin/login`
- `GET https://hotel.hcasc.cz/api/health`

Doporučeno navíc ověřit admin login + moduly `Sklad` a `Snídaně`.
