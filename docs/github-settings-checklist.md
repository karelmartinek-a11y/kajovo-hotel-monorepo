# GitHub Settings Checklist

Date: 2026-03-12
Purpose: authoritative checklist for repository-level GitHub `Secrets` and `Variables` used by CI, release, and production deploy.

## Admin credentials policy

- Admin username is the same value as the admin email.
- GitHub Actions must source admin credentials only from repository `Secrets` / `Variables`.
- GitHub workflows do not permit a hardcoded fallback admin account anymore.
- If `KAJOVO_API_ADMIN_*` aliases are set, they must match `HOTEL_ADMIN_*`.
- Production API synchronizes the persisted admin profile from the resolved GitHub admin credentials on startup, so the deployed login always follows the repository credential source of truth.
- CI smoke, auth tests, and post-deploy verify use the same admin credentials and fail in CI if they are missing.

## Minimal production-ready setup

### Repository Variables

- `HOTEL_DEPLOY_HOST`
  - Production host for password-based SSH deploy.
- `HOTEL_DEPLOY_PORT`
  - SSH port.
- `HOTEL_DEPLOY_USER`
  - SSH username.
- `HOTEL_ADMIN_EMAIL`
  - Canonical admin login email and username.

### Repository Secrets

- `HOTEL_DEPLOY_PASS`
  - Required password for production deploy.
- `HOTEL_ADMIN_PASSWORD`
  - Canonical admin password for CI smoke, deploy verify, and production runtime.

## Optional alias keys

Use these only if another integration already expects `KAJOVO_API_*` names:

### Optional Variables

- `KAJOVO_API_ADMIN_EMAIL`
  - Must equal `HOTEL_ADMIN_EMAIL`.

### Optional Secrets

- `KAJOVO_API_ADMIN_PASSWORD`
  - Must equal `HOTEL_ADMIN_PASSWORD`.

## Recommended setup

- Keep `HOTEL_ADMIN_EMAIL` in `Variables`.
- Keep `HOTEL_ADMIN_PASSWORD` in `Secrets`.
- Keep deploy transport in `HOTEL_DEPLOY_HOST`, `HOTEL_DEPLOY_PORT`, `HOTEL_DEPLOY_USER`, and `HOTEL_DEPLOY_PASS`.
- Leave `KAJOVO_API_ADMIN_*` unset unless you explicitly need alias compatibility.

## Enforced by repository

- `.github/workflows/ci-gates.yml`
- `.github/workflows/ci-full.yml`
- `.github/workflows/release.yml`
- `.github/workflows/deploy-production.yml`
- `scripts/check_admin_credentials_env.py`
- `scripts/verify_live_admin_login.mjs`
- `infra/compose.prod.yml`
- `infra/ops/deploy-production.sh`

## Failure conditions

CI or deploy must fail when:

- admin email is missing,
- admin password is missing,
- deploy host, port, user, or password is missing,
- `HOTEL_ADMIN_EMAIL` and `KAJOVO_API_ADMIN_EMAIL` differ,
- `HOTEL_ADMIN_PASSWORD` and `KAJOVO_API_ADMIN_PASSWORD` differ,
- production compose starts without `KAJOVO_API_ADMIN_EMAIL` / `KAJOVO_API_ADMIN_PASSWORD`,
- public runtime health endpoints or live admin login fail after deploy.