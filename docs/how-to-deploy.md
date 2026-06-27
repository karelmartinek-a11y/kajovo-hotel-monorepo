# Produkční deploy hotel.hcasc.cz

## Cíl

- veřejný portál: `https://hotel.hcasc.cz`
- administrace: `https://hotel.hcasc.cz/admin`
- aktuální temp server: `89.221.222.92`

## Zdroj pravdy

- aktuální commit v repozitáři
- workflow `.github/workflows/deploy-production.yml`
- serverový runtime artifact `artifacts/deploy-runtime/latest.json`
- živé ověření přes browser a SSH

## Postup

1. Ověřit lokální kontroly a čistotu commitu.
2. Pushnout změny na GitHub.
3. Nasadit release archiv na temp server.
4. Spustit `infra/ops/deploy-production.sh`.
5. Ověřit služby, reverse proxy a runtime artifact.
6. Ověřit skutečné chování na živé doméně.

## Důležité

- Webový deploy nesmí být blokován legacy Androidem.
- Historické zmínky o starém serveru nebo Android release chainu nejsou autoritativní.
