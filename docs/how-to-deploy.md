# How to deploy (production)

## Automated pipeline

Production `hotel.hcasc.cz` is deployed from `main` through GitHub Actions:

1. Push a commit to `main`.
2. The authoritative blocking gate is `CI Gates - KajovoHotel`. In parallel, `CI Release - Kajovo Hotel` and `CI Full - Kajovo Hotel` also run for broader verification.
3. `CI Gates - KajovoHotel` runs:
   - dependency install (Node/PNPM, Python),
   - unified release gate artifact,
   - guardrails,
   - typecheck,
   - backend unit tests,
   - deterministic smoke checks.
4. After successful `CI Gates - KajovoHotel`, GitHub runs:
   - `Deploy - hotel.hcasc.cz`

Deploy workflow: `.github/workflows/deploy-production.yml`.

Authoritative GitHub settings checklist: `docs/github-settings-checklist.md`.

## Required GitHub configuration

Repository `Secrets` / `Variables` must contain:

- `HOTEL_DEPLOY_HOST`
- `HOTEL_DEPLOY_PORT`
- `HOTEL_DEPLOY_USER`
- `HOTEL_DEPLOY_PASS`
- `HOTEL_ADMIN_EMAIL`
- `HOTEL_ADMIN_PASSWORD`

Admin login uses email as username, so `HOTEL_ADMIN_EMAIL` is also the admin username.

Optional aliases:

- `KAJOVO_API_ADMIN_EMAIL`
- `KAJOVO_API_ADMIN_PASSWORD`

If aliases are set, they must equal `HOTEL_ADMIN_EMAIL` / `HOTEL_ADMIN_PASSWORD`. GitHub workflows validate this and no workflow uses a hardcoded fallback admin account anymore.

Recommended split:

- `Variables`: `HOTEL_DEPLOY_HOST`, `HOTEL_DEPLOY_PORT`, `HOTEL_DEPLOY_USER`, `HOTEL_ADMIN_EMAIL`
- `Secrets`: `HOTEL_DEPLOY_PASS`, `HOTEL_ADMIN_PASSWORD`

## What the deploy workflow does

- checks out the exact SHA that passed CI,
- creates a release archive from that SHA,
- uploads the archive to the production host over password-based SSH,
- extracts the release on the server while preserving `infra/.env`,
- runs `infra/ops/deploy-production.sh` in artifact mode (`SKIP_GIT_SYNC=true`),
- prints compose diagnostics for `api`, `postgres`, `admin`, and `web`,
- blocks the workflow unless public HTTP health checks pass,
- blocks the workflow unless live admin login works with the same GitHub admin credentials.

## Post-deploy verification

The workflow treats these checks as blocking:

- `https://hotel.hcasc.cz/`
- `https://hotel.hcasc.cz/admin/login`
- `https://hotel.hcasc.cz/api/health`
- live admin login against `/api/auth/admin/login` + `/api/auth/me`

## Preview/staging build

If you need a build artifact without deploying to production, use `Preview Build - Kajovo Hotel` (`.github/workflows/preview.yml`). It creates preview artifacts for web and admin.
