# Disaster recovery runbook

Tento dokument popisuje minimální disaster recovery (DR) postup pro produkční stack (`infra/compose.prod.yml`) se zaměřením na Postgres data.

## 1) Předpoklady (RPO/RTO)

- **RPO (Recovery Point Objective): max 24 hodin**.
  - Předpoklad: minimálně 1× denně proběhne SQL backup.
  - Doporučení: navíc backup vždy před releasem nebo před zásahy do DB schématu.
- **RTO (Recovery Time Objective): 60–120 minut**.
  - Zahrnuje: výběr validního backup souboru, restore DB, kontrolu API readiness, základní smoke test.
- **Rozsah obnovy**:
  - Tento runbook řeší primárně aplikační data v Postgres.
  - Obrazy kontejnerů a konfigurace se obnovují standardním deployment postupem v `docs/how-to-deploy.md`.

## 2) Backup/restore nástroje

Windows-friendly skripty jsou v `infra/ops/`:

- `infra/ops/backup.ps1`
- `infra/ops/restore.ps1`

Skripty používají:

- `infra/compose.prod.yml`
- `infra/.env` (pokud existuje)
- `docker compose exec -T postgres ...`

### 2.1 Vytvoření timestamped backupu

Spuštění z repository root:

```powershell
pwsh -File infra/ops/backup.ps1
```

Volitelné parametry (např. custom adresář):

```powershell
pwsh -File infra/ops/backup.ps1 -OutputDir "../backups/prod" -FilePrefix "kajovo-prod"
```

Výstup: SQL dump `kajovo-postgres-YYYYMMDD-HHMMSS.sql` (nebo vlastní prefix).

### 2.2 Restore do cílové DB

Spuštění z repository root:

```powershell
pwsh -File infra/ops/restore.ps1 -BackupFile "infra/backups/kajovo-postgres-20260101-090000.sql"
```

Restore do explicitně zadané DB:

```powershell
pwsh -File infra/ops/restore.ps1 \
  -BackupFile "infra/backups/kajovo-postgres-20260101-090000.sql" \
  -TargetDb "kajovo_hotel" \
  -DbUser "kajovo"
```

> `restore.ps1` používá `psql -v ON_ERROR_STOP=1`, takže se restore zastaví na první SQL chybě.

## 3) Incident restore postup (krok za krokem)

1. **Stabilizace provozu**
   - Zastavte další deploye.
   - Pokud je to nutné, přesměrujte traffic na fallback/maintenance.

2. **Vyberte backup soubor**
   - Preferujte poslední validní backup před incidentem.
   - Ověřte velikost souboru a čas vytvoření.

3. **Ověřte běh Postgres kontejneru**

   ```bash
   docker compose -f infra/compose.prod.yml --env-file infra/.env ps
   ```

4. **Spusťte restore**

   ```powershell
   pwsh -File infra/ops/restore.ps1 -BackupFile "<path-to-backup.sql>"
   ```

5. **Readiness kontrola API**

   ```bash
   curl -i http://localhost:8000/ready
   ```

6. **Smoke test kritických modulů**
   - snídaně
   - ztráty a nálezy
   - závady
   - sklad
   - hlášení

7. **Zápis do incident logu**
   - Čas incidentu, použitý backup, doba obnovy, výsledek smoke testu.

## 4) Chování migrací po obnově

### 4.1 Alembic schema migrace

- Po restore spusťte standardní migrace stejným způsobem jako při běžném deployi.
- Alembic migrace udržujte jako jediný zdroj pravdy pro schéma.

### 4.2 Data migration (`migrate_legacy`)

`apps/kajovo-hotel-api/tools/migrate_legacy/migrate.py` je navržena jako **idempotentní**:

- již importované záznamy jsou evidované v `legacy_migration_audit`,
- opakovaný běh přeskočí již importované source záznamy,
- `--dry-run` provede mapování/report a transakci vrátí rollbackem.

Po DR restore to znamená:

- pokud restore vrátí DB do stavu před migrací, lze migration run provést znovu,
- pokud restore obsahuje již importovaná data i audit trail, rerun nebude duplikovat importované záznamy.

## 5) Doporučený pravidelný DR drill (měsíčně)

- Proveďte test backupu: `pwsh -File infra/ops/backup.ps1`.
- Proveďte test restore do neprodukční cílové DB.
- Ověřte readiness + smoke.
- Zapište skutečné časy a porovnejte vůči RPO/RTO cílům.
