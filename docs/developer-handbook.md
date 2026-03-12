# Developer Handbook (no direct server access)

This document summarizes what a developer needs to work on the portal without SSH access to the production server.

## 1) Source of truth

- Source code: GitHub repository `karelmartinek-a11y/kajovo-hotel-monorepo`, branch `main`.
- Production is deployed automatically from `main` through GitHub Actions workflow `Deploy - hotel.hcasc.cz`.
- The server copy in `/opt/kajovo-hotel-monorepo` is only a deployment workspace, not the source of truth.

## 2) What a developer needs to know

- Design SSOT: `ManifestDesignKájovo.md`.
- Information architecture: `apps/kajovo-hotel/ux/ia.json`.
- RBAC rules: `docs/rbac.md`.
- Authoritative status/scope: `docs/SSOT_SCOPE_STATUS.md`.
- Working finalization record: `docs/forensics/finalization-log.md`.
- Forensic parity matrix: `docs/feature-parity-matrix.csv`.

## 3) Local run

Use `pnpm` workspaces from the repo root.

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

## 4) Required checks before push

```bash
pnpm lint
pnpm typecheck
pnpm unit
pnpm ci:gates
```

## 5) GitHub pipelines

A push to `main` runs:

- `CI Gates - KajovoHotel`
- `CI Full - Kajovo Hotel`
- `CI Release - Kajovo Hotel`
- after successful authoritative CI gate: `Deploy - hotel.hcasc.cz`

## 6) GitHub Secrets / Variables for production deploy

Authoritative checklist: `docs/github-settings-checklist.md`

Deploy and CI workflows use these keys (prefer `Secrets` for secret values and `Variables` for non-secret values):

- `HOTEL_DEPLOY_HOST`
- `HOTEL_DEPLOY_PORT`
- `HOTEL_DEPLOY_USER`
- `HOTEL_DEPLOY_PASS`
- `HOTEL_ADMIN_EMAIL`
- `HOTEL_ADMIN_PASSWORD`

Admin username is the same value as the admin email, so `HOTEL_ADMIN_EMAIL` is both login email and username.

Optional aliases:

- `KAJOVO_API_ADMIN_EMAIL`
- `KAJOVO_API_ADMIN_PASSWORD`

If aliases are present, they must match `HOTEL_ADMIN_EMAIL` / `HOTEL_ADMIN_PASSWORD`. CI, deploy, and post-deploy verify all enforce that rule and no GitHub workflow uses a hardcoded fallback admin account.

Credentials are never committed to the repository or documentation. Production compose blocks API startup if the resolved admin credentials are missing.

## 7) Post-deploy smoke check

The production deploy workflow blocks unless all of these succeed:

- `GET https://hotel.hcasc.cz/`
- `GET https://hotel.hcasc.cz/admin/login`
- `GET https://hotel.hcasc.cz/api/health`
- live admin login using the GitHub admin email/username and password
