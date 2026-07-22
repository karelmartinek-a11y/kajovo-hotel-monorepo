# Reverse proxy operations notes

## Canonical domains

- Production canonical host is `hotel.hcasc.cz`.
- Aktualni produkcni server po DNS cutoveru je `89.221.222.92`.
- Staging canonical host is `hotel-staging.hcasc.cz`.
- Keep `server_name` in both `production-legacy.conf` and `production-new.conf` set to `hotel.hcasc.cz`.
- Backend runtime validation (`HOTEL_PUBLIC_BASE_URL`) must use host `hotel.hcasc.cz`.
- Aktivni host-level vhost je vedeny v `infra/reverse-proxy/production-host.conf` a deploy ho musi synchronizovat na `/etc/nginx/sites-available/hotel.hcasc.cz.conf`.

## Ověření reverse proxy

- Reverse proxy se validuje proti aktivnímu host-level souboru `infra/reverse-proxy/production-host.conf`.
- Po změně host-level konfigurace ověřte canonical redirect, `/admin/` routování a health endpointy na živé doméně.

## Basic checks

```bash
nginx -t
rg -n "server_name" infra/reverse-proxy/*.conf
curl -k -I -H 'Host: hotel.hcasc.cz' https://127.0.0.1/admin/
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
