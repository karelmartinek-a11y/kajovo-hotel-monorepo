# Produkční deploy hotel.hcasc.cz

## Cíl

- veřejný portál: `https://hotel.hcasc.cz`
- administrace: `https://hotel.hcasc.cz/admin`
- produkční server IPv4: `89.221.222.92`

## Zdroj pravdy

- aktuální commit v repozitáři
- workflow `.github/workflows/deploy-production.yml`
- serverový runtime artifact `/home/<deploy-user>/kajovo-deploy-releases/<sha>/artifacts/deploy-runtime/latest.json`
- živé ověření přes browser a SSH

## Postup

1. Ověřit lokální kontroly a čistotu commitu.
2. Pushnout změny na `main`, aby proběhl workflow `CI Gates - Kajovo Hotel`.
3. Po úspěšném CI nechat doběhnout workflow `.github/workflows/deploy-production.yml`.
4. Před uploadem se automaticky odstraní nedokončené release archivy, staré zdrojové stromy kromě nejnovějšího a nepoužívaná Docker build/image cache. Běžící image a pojmenované datové volume se nemažou.
5. Ověřit release archiv `kajovo-deploy-<sha>.tar.gz`, Docker Compose stack a runtime artifact na serveru.
6. Ověřit služby, reverse proxy a logy přes `scripts/github_deploy_via_ssh.py`.
7. Certifikát obnovuje serverový `certbot.timer`; deploy po synchronizaci Nginx konfigurace vyžaduje platnost aktivního certifikátu delší než 30 dní.
8. Ověřit skutečné chování na živé doméně přes live smoke skripty a browser.

## Důležité

- Workflow je navázané jen na úspěšný běh `CI Gates - Kajovo Hotel` pro `main`.
- Retence na serveru zachovává nejnovější dokončený zdrojový strom jako rollback/runtime-artifact referenci; provozní data zůstávají v pojmenovaných Docker volumes.
- HTTP ACME challenge se obsluhuje přímo z `/var/www/hotelapp/letsencrypt` bez předčasného HTTPS redirectu; ostatní HTTP požadavky přesměrovává `location /`.
- Aktivní Nginx certifikát používá Certbot lineage `hotel.hcasc.cz-renewed`; deploy uživateli nepřiděluje obecná root oprávnění a certifikát pouze ověřuje.
- Produkční ověření používá `scripts/verify_live_breakfast_manual_refresh.mjs`, `scripts/verify_live_housekeeping_rooms.mjs`, `scripts/verify_live_admin_login.mjs` a `scripts/verify_live_admin_users_smoke.mjs`. Pokojský gate pouze čte živý přehled; v deployi záměrně nemění provozní stav skutečného pokoje.
