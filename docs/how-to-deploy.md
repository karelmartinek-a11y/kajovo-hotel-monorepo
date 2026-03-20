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
   - frontend web/admin builds,
   - backend unit tests,
   - deterministic breakfast IMAP smoke,
   - deterministic breakfast runtime smoke.
4. After successful `CI Gates - KajovoHotel`, GitHub runs:
   - `Deploy - hotel.hcasc.cz`

Deploy workflow: `.github/workflows/deploy-production.yml`.

Authoritative GitHub settings checklist: `docs/github-settings-checklist.md`.
Autoritativní Android release manifest: `android/release/android-release.json`.

Neporušitelné parity pravidlo:

- každá runtime změna webu musí mít adekvátní runtime změnu Android appky,
- každá runtime změna Android appky musí mít adekvátní runtime změnu webu,
- web musí zůstat odladěný pro desktop, tablet a mobil,
- Android musí zůstat plně nativní.

Toto pravidlo blokuje `ci:policy` a tím i produkční deploy.

## Required GitHub configuration

Repository `Secrets` / `Variables` must contain:

- `HOTEL_DEPLOY_HOST`
- `HOTEL_DEPLOY_PORT`
- `HOTEL_DEPLOY_USER`
- `HOTEL_DEPLOY_PASS`
- `HOTEL_ADMIN_EMAIL`
- `HOTEL_ADMIN_PASSWORD`
- `KAJOVO_UPLOAD_STORE_FILE_B64`
- `KAJOVO_UPLOAD_KEY_ALIAS`

Admin login uses email as username, so `HOTEL_ADMIN_EMAIL` is also the admin username.

Optional aliases:

- `KAJOVO_API_ADMIN_EMAIL`
- `KAJOVO_API_ADMIN_PASSWORD`

If aliases are set, they must equal `HOTEL_ADMIN_EMAIL` / `HOTEL_ADMIN_PASSWORD`. GitHub workflows validate this and no workflow uses a hardcoded admin account anymore.

Recommended split:

- `Variables`: `HOTEL_DEPLOY_HOST`, `HOTEL_DEPLOY_PORT`, `HOTEL_DEPLOY_USER`, `HOTEL_ADMIN_EMAIL`
- `Secrets`: `HOTEL_DEPLOY_PASS`, `HOTEL_ADMIN_PASSWORD`, `KAJOVO_UPLOAD_STORE_FILE_B64`, `KAJOVO_UPLOAD_KEY_ALIAS`

Android release signing:

- GitHub Actions obnovi produkcni keystore ze secretu `KAJOVO_UPLOAD_STORE_FILE_B64`.
- Alias se bere ze secretu `KAJOVO_UPLOAD_KEY_ALIAS`.
- `storePassword` i `keyPassword` se berou primo z existujiciho `HOTEL_ADMIN_PASSWORD`, neduplikuji se do dalsich secrets.

## What the deploy workflow does

- checks out the exact SHA that passed CI,
- creates a release archive from that SHA,
- uploads the archive to the production host over password-based SSH,
- extracts the release on the server while preserving `infra/.env`,
- runs `infra/ops/deploy-production.sh` in artifact mode (`SKIP_GIT_SYNC=true`),
- blocks until `postgres`, `api`, `web`, and `admin` report healthy/running state,
- blocks unless server-local health checks pass (`/ready`, `/api/health`, `/healthz`),
- writes server-side runtime evidence to `artifacts/deploy-runtime/latest.json`,
- pulls that artifact back into GitHub Actions and verifies the runtime SHA matches the workflow SHA,
- prints compose diagnostics for `api`, `postgres`, `admin`, and `web`,
- blocks the workflow unless public HTTP health checks pass,
- blocks the workflow unless live admin login works with the same GitHub admin credentials,
- blokuje workflow, pokud live `/api/app/android-release` neodpovídá release manifestu commitnutému v GitHubu,
- zapisuje Android release metadata (`version`, `version_code`, `sha256`) do server-side deploy runtime artifactu.

## Post-deploy verification

The workflow treats these checks as blocking:

- `https://hotel.hcasc.cz/`
- `https://hotel.hcasc.cz/admin/login`
- `https://hotel.hcasc.cz/api/health`
- live admin login against `/api/auth/admin/login` + `/api/auth/me`
- fetched deploy runtime artifact SHA equals deployed workflow SHA

## Deploy evidence artifacts

Two artifact classes matter for a release-ready SHA:

- release gate JSON artifact under `artifacts/release-gate/`
- deploy runtime JSON artifact under `artifacts/deploy-runtime/latest.json` on the server and uploaded in GitHub Actions as `deploy-runtime-artifact`

Pro releasy s Android appkou je deploy evidence neúplná, pokud runtime artifact neobsahuje i `android_release.version`, `android_release.version_code` a `android_release.sha256`.

## Preview/staging build

If you need a build artifact without deploying to production, use `Preview Build - Kajovo Hotel` (`.github/workflows/preview.yml`). It creates preview artifacts for web and admin.
