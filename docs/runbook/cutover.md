# KájovoHotel cutover runbook (primární)

Primární runbook pro produkční cutover. Každý krok obsahuje příkaz, očekávaný výsledek a rollback akci.

## 1) Preflight (GO/NO-GO)

| Krok | Příkaz | Očekávaný výsledek | Rollback |
|---|---|---|---|
| 1.1 Aktualizace workspace | `git pull --ff-only` | Bez konfliktů, pracovní strom čistý | Zastavit cutover; vyřešit drift mimo okno |
| 1.2 Deploy verifikace | `./infra/verify/verify-deploy.sh` | Exit 0, všechny kontroly PASS | Neprovádět switch, opravit chyby a znovu spustit |
| 1.3 UAT smoke | `UAT_ACCOUNTS_CHECK=1 ./infra/uat/run-uat.sh` | Exit 0, klíčové scénáře PASS | NO-GO, ponechat legacy jako primární |

## 2) Backup

| Krok | Příkaz | Očekávaný výsledek | Rollback |
|---|---|---|---|
| 2.1 Export DB snapshotu | `COMPOSE_PROJECT_NAME=kajovo-prod docker compose -f infra/compose.prod.yml --env-file infra/.env exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /tmp/kajovo-prod-backup.sql` | Soubor `/tmp/kajovo-prod-backup.sql` existuje a není prázdný | Bez platného snapshotu nepokračovat |
| 2.2 Kontrola snapshotu | `test -s /tmp/kajovo-prod-backup.sql` | Exit 0 | Zopakovat export, případně eskalace DBA |

## 3) Migrace dat

| Krok | Příkaz | Očekávaný výsledek | Rollback |
|---|---|---|---|
| 3.1 Migrační běh | `python apps/kajovo-hotel-api/tools/migrate_legacy/migrate.py --report-json apps/kajovo-hotel-api/tools/migrate_legacy/report.json --report-csv apps/kajovo-hotel-api/tools/migrate_legacy/report.csv` | Exit 0, reporty vygenerované | Stop cutover; obnovit DB ze snapshotu |
| 3.2 Kontrola reportu | `python -m json.tool apps/kajovo-hotel-api/tools/migrate_legacy/report.json > /dev/null` | Exit 0, validní JSON | Re-run migrace po opravě vstupů |

## 4) Produkční switch

| Krok | Příkaz | Očekávaný výsledek | Rollback |
|---|---|---|---|
| 4.1 Přepnutí reverse proxy | `NGINX_SITE_PATH=/etc/nginx/conf.d/kajovohotel.conf ./infra/reverse-proxy/switch-to-new.sh` | Exit 0, Nginx reload bez chyby | `./infra/reverse-proxy/rollback-to-legacy.sh` |
| 4.2 Health check API/UI | `curl -fsS https://kajovohotel.hcasc.cz/health && curl -fsS https://kajovohotel.hcasc.cz/ready && curl -fsS https://kajovohotel.hcasc.cz/healthz` | HTTP 200 pro všechny endpointy | Okamžitý rollback na legacy |

## 5) Post-switch ověření

| Krok | Příkaz | Očekávaný výsledek | Rollback |
|---|---|---|---|
| 5.1 Produkční smoke | `WEB_BASE_URL="https://kajovohotel.hcasc.cz" API_BASE_URL="https://kajovohotel.hcasc.cz" ./infra/smoke/smoke.sh` | Exit 0, smoke scénáře PASS | Rollback na legacy + incident ticket |
| 5.2 Kontrola deploy integrity | `./infra/verify/verify-deploy.sh` | Exit 0 | Rollback při opakovaném FAIL |

## 6) Stabilizační monitoring (30–60 min)

| Krok | Příkaz | Očekávaný výsledek | Rollback |
|---|---|---|---|
| 6.1 Stack logs | `COMPOSE_PROJECT_NAME=kajovo-prod docker compose -f infra/compose.prod.yml --env-file infra/.env logs -f --tail=200` | Bez opakovaných 5xx/traceback | Rollback při systémové degradaci |
| 6.2 Nginx access | `tail -f /var/log/nginx/access.log` | Chybovost v limitu, response times stabilní | Rollback při zvýšené chybovosti |

## 7) Rollback procedura (tvrdý NO-GO)

1. `NGINX_SITE_PATH=/etc/nginx/conf.d/kajovohotel.conf ./infra/reverse-proxy/rollback-to-legacy.sh`
2. `curl -fsS https://kajovohotel.hcasc.cz/health`
3. Incident evidence: uložit časy, příkaz a log výstupy do release ticketu.

