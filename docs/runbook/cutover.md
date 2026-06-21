# Post-cutover runbook pro `hotel.hcasc.cz`

Tento runbook popisuje aktualni produkcni stav po DNS cutoveru.

## Produkcni identita

- Produkcni domena: `https://hotel.hcasc.cz`
- Produkcni admin: `https://hotel.hcasc.cz/admin`
- Produkcni server: `89.221.222.92`
- Produkcni deploy target: GitHub Actions workflow `Deploy - hotel.hcasc.cz`

`oko1` ani jiny legacy host uz neni aktivni produkcni nebo deploy target. Pokud je potreba historicke porovnani, pouziva se pouze read-only.

## Autoritativni zdroje

- `.github/workflows/deploy-production.yml`
- `infra/ops/deploy-production.sh`
- `infra/reverse-proxy/production-host.conf`
- `infra/verify/verify-deploy.sh`

Kdyz je dokumentace v rozporu s temito soubory, plati kod a workflow.

## Produkcni overeni po deployi

```bash
curl -fsS https://hotel.hcasc.cz/health
curl -fsS https://hotel.hcasc.cz/ready
curl -fsS https://hotel.hcasc.cz/healthz
curl -I https://hotel.hcasc.cz/admin
curl -I https://hotel.hcasc.cz/Admin
```

```bash
WEB_BASE_URL="https://hotel.hcasc.cz" API_BASE_URL="https://hotel.hcasc.cz" ./infra/smoke/smoke.sh
```

```bash
./infra/verify/verify-deploy.sh
```

## Post-cutover audit checklist

1. `Resolve-DnsName hotel.hcasc.cz` vraci `89.221.222.92` a produkcni IPv6 noveho serveru.
2. Runtime artifact na serveru sedi s poslednim deploy SHA:

```bash
ssh temp "sudo cat /opt/kajovo-hotel-monorepo/artifacts/deploy-runtime/latest.json"
```

3. Host-level Nginx config je synchronizovany z repa:

```bash
ssh temp "sudo nginx -t && sudo grep -nE 'location = /admin|location ~\\* \\^/admin' /etc/nginx/sites-available/hotel.hcasc.cz.conf"
```

4. Produkcni deploy uzivatel musi mit na serveru povoleny `sudo -n /usr/local/bin/kajovo-sync-hotel-nginx`, jinak workflow nedokaze bezpecne synchronizovat host-level Nginx konfiguraci z repa.

4. Browser smoke na ostre domene pro web i admin probehne bez relevantnich console/network chyb.

## Poznamka k rollbacku

Historicke pre-cutover rollback kroky na legacy stack uz nejsou soucasti aktivniho provozniho navodu. Pokud by bylo potreba obnovit starsi topologii, musi vzniknout novy, explicitne schvaleny incident runbook mimo tento dokument.
