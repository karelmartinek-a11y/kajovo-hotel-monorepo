# Reverse proxy operations notes

## Canonical domains

- Production canonical host is `hotel.hcasc.cz`.
- Staging canonical host is `hotel-staging.hcasc.cz`.
- Keep `server_name` in both `production-legacy.conf` and `production-new.conf` set to `hotel.hcasc.cz`.
- Backend runtime validation (`HOTEL_PUBLIC_BASE_URL`) must use host `hotel.hcasc.cz`.

## Sandbox admin login tests (no embedded credentials)

`legacy/hotel-backend/deploy/sandbox/run-tests.sh` no longer loads secrets from files and does not contain default credentials.
Set these environment variables before running the sandbox test script:

- `HOTEL_ADMIN_USERNAME`
- `HOTEL_ADMIN_PASSWORD`
- `HOTEL_ADMIN_PASSWORD_HASH`
- `HOTEL_SESSION_SECRET`
- `HOTEL_CSRF_SECRET`
- `HOTEL_CRYPTO_SECRET`
- `HOTEL_SANDBOX_POSTGRES_PASSWORD`

## Basic checks

```bash
nginx -t
rg -n "server_name" infra/reverse-proxy/*.conf
rg -n "HOTEL_ADMIN_(USERNAME|PASSWORD)" legacy/hotel-backend/deploy/sandbox/run-tests.sh
```
