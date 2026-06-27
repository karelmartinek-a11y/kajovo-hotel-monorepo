# Historicky cutover runbook

DNS cutover pro `hotel.hcasc.cz` uz probehl. Tento soubor zustava pouze jako historicka evidence pripravy pred prepnuti domeny.

## Aktivni provozni navod

Pouzivejte pouze:

- `docs/runbook/cutover.md`
- `.github/workflows/deploy-production.yml`
- `infra/ops/deploy-production.sh`
- `infra/reverse-proxy/production-host.conf`

## Historicky kontext

- staging bezel paralelne na `kajovohotel-staging.hcasc.cz`
- produkcni cutover byl dokonceny na server `89.221.222.92`
- `oko1` uz neni aktivni produkcni ani deploy target

## Dulezite omezeni

- tento dokument neni aktualni produkcni runbook
- neobsahuje aktivni rollback navod na legacy stack
- jakykoliv navrat ke starsi topologii by vyzadoval novy incident runbook podle aktualniho stavu infrastruktury
