# Reverse proxy operations notes

## Canonical domains

- Production canonical host is `hotel.hcasc.cz`.
- Aktualni produkcni server po DNS cutoveru je `89.221.222.92`.
- Staging canonical host is `hotel-staging.hcasc.cz`.
- Keep `server_name` in both `production-legacy.conf` and `production-new.conf` set to `hotel.hcasc.cz`.
- Backend runtime validation (`HOTEL_PUBLIC_BASE_URL`) must use host `hotel.hcasc.cz`.
- Aktivni host-level vhost je vedeny v `infra/reverse-proxy/production-host.conf` a deploy ho musi synchronizovat na `/etc/nginx/sites-available/hotel.hcasc.cz.conf`.

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

## Produkcni host-level Nginx

- Pro `hotel.hcasc.cz` musi byt `location ^~ /admin/` smerovana na `http://127.0.0.1:8083/`.
- Pro `hotel.hcasc.cz` musi byt take case-insensitive canonicalizace `location ~* ^/admin(?<admin_suffix>/.*)?$ { return 301 /admin$admin_suffix$is_args$args; }`, aby `/Admin` nikdy nepadal do verejneho webu.
- Port `8081` je mimo produkcni mapovani a vraci `502 Bad Gateway`.
- Po kazde uprave host-level konfigurace proved:

```bash
nginx -t && systemctl reload nginx
curl -k -I -H 'Host: hotel.hcasc.cz' https://127.0.0.1/admin/
```
