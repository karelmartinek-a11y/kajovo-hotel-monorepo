# Release candidate runbook

Tento runbook shrnuje krokový postup pro release candidate (RC) od preflight kontrol až po rollback. Vychází z existujících provozních dokumentů a používá stejné příkazy.

## 1) Preflight checks (T-24h až T-1h)

### 1.1 CI musí být zelené

Spusťte kompletní gate lokálně (nebo ověřte ekvivalentní průchod v CI):

```bash
pnpm ci:gates
```

Při diagnostice použijte samostatné kroky:

```bash
pnpm ci:tokens
pnpm ci:signage
pnpm ci:view-states
```

Pokud Playwright běží poprvé v prostředí releasu:

```bash
pnpm --filter @kajovo/kajovo-hotel-web exec playwright install --with-deps chromium
```

Doplňkově ověřte lint:

```bash
pnpm lint
```

### 1.2 Build a připravenost deploy prostředí

Připravte produkční env:

```bash
cd infra
cp .env.example .env
# edit .env with real secrets
```

Sestavte obrazy:

```bash
docker compose -f compose.prod.yml --env-file .env build --pull
```

### 1.3 Databázová snapshot/backup před RC

Před releasem proveďte snapshot:

```bash
cd infra
docker compose -f compose.prod.yml --env-file .env exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backup.sql
```

### 1.4 Migrace a datová verifikace

Po aplikaci migrací/importu ověřte konzistenci SQL dotazy (nad `DATABASE_URL`):

```sql
SELECT domain, import_status, COUNT(*)
FROM legacy_migration_audit
GROUP BY domain, import_status
ORDER BY domain, import_status;
```

```sql
SELECT COUNT(*) AS imported_breakfast
FROM breakfast_orders bo
JOIN legacy_migration_audit a
  ON a.target_table = 'breakfast_orders'
 AND a.target_pk = bo.id::text;
```

```sql
SELECT domain, legacy_table, legacy_pk, target_table, mapping_note, raw_record
FROM legacy_migration_audit
ORDER BY id DESC
LIMIT 50;
```

### 1.5 Smoke a readiness před cutover

Ověřte zdraví stacku:

```bash
docker compose -f infra/dev-compose.yml ps
```

```bash
curl -i http://localhost:8000/ready
```

Proveďte smoke test dle checklistu modulů v cutover plánu (včetně `infra/smoke/smoke.sh`).

### 1.6 Backup/restore drill (krátký checklist)

- [ ] Ověřen dostupný poslední backup soubor (`infra/backups/*.sql`).
- [ ] Ověřen test backup příkaz: `pwsh -File infra/ops/backup.ps1`.
- [ ] Ověřen test restore příkaz do cílové DB: `pwsh -File infra/ops/restore.ps1 -BackupFile "<backup.sql>"`.
- [ ] Po restore ověřen `/ready` endpoint a základní smoke kritických modulů.


---

## 2) Go-live steps (cutover okno)

1. **Deploy RC stacku**

   ```bash
   cd infra
   docker compose -f compose.prod.yml --env-file .env up -d
   ```

2. **Rolling-ish update při RC patchi**

   ```bash
   cd infra
   git pull

   docker compose -f compose.prod.yml --env-file .env build --pull api web
   docker compose -f compose.prod.yml --env-file .env up -d --no-deps api
   docker compose -f compose.prod.yml --env-file .env up -d --no-deps web
   docker compose -f compose.prod.yml --env-file .env up -d postgres
   ```

3. **Traffic cutover**
   - Preferovaně nový hostname (např. `kajovohotel-staging.hcasc.cz`) a následně přepnutí DNS/reverse proxy dle GO/NO-GO rozhodnutí.
   - Alternativně path-based routing (`/new-portal/*`) bez zásahu do legacy `/`.

4. **Bezprostřední smoke po cutoveru**
   - Ověřte utility stránky (`/`, `/intro`, `/offline`, `/maintenance`, `/404`).
   - Ověřte klíčové CRUD toky pro moduly: snídaně, ztráty a nálezy, závady, sklad, hlášení.

---

## 3) Post-go-live checks (T+0 až T+60 min)

### 3.1 Error rates a API zdraví

- Kontrola readiness/liveness endpointů:

  ```bash
  curl -i http://localhost:8000/ready
  ```

- Kontrola request logů (statusy, latence, module):

  ```bash
  docker compose logs api --tail=200
  ```

- Sledujte nárůst 5xx a regresi latencí (`latency_ms`) v API JSON logách.

### 3.2 DB a audit trail

- Ověřte poslední write operace:

  ```sql
  SELECT created_at, actor, module, action, resource, status_code
  FROM audit_trail
  ORDER BY id DESC
  LIMIT 50;
  ```

- Ověřte, že nedochází k chybovým nebo chybějícím zápisům v kritických modulech.

### 3.3 User flows

- Manuálně projděte kritické uživatelské flow dle modulového checklistu v cutover plánu:
  - seznam + vytvoření + detail + editace,
  - ověření odpovědí příslušných `/api/v1/*` endpointů 200.

---

## 4) Rollback steps

Rollback spouštějte při opakovaných 5xx, nefunkčním přihlášení/kritickém CRUD nebo neakceptovatelné latenci.

1. **Freeze změn**: zastavte další deploye.
2. **Přepněte traffic zpět na legacy**:
   - hostname varianta: vraťte DNS/reverse proxy na legacy host,
   - path varianta: deaktivujte routování `/new-portal`.
3. **Validujte legacy provoz**: ověřte legacy home + kritické workflow.
4. **Zaznamenejte incident**: čas, příčina, symptomy, release SHA.
5. **Obnova DB (pokud je nutná)** z před-release backupu:

   ```bash
   cd infra
   cat backup.sql | docker compose -f compose.prod.yml --env-file .env exec -T postgres \
     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
   ```

6. **Post-mortem a retest** před dalším cutover pokusem.

---

## 5) RC sign-off checklist

- [ ] CI gates i lint zelené.
- [ ] Build obrazů dokončen.
- [ ] Pre-release DB backup existuje a je ověřen.
- [ ] Migrace/import ověřeny SQL dotazy.
- [ ] Smoke test a modulový checklist prošel.
- [ ] Post-go-live metriky/logy bez kritických odchylek.
- [ ] Rollback plán připraven a owner potvrzen.
