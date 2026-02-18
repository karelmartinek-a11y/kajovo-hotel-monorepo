# Data migration: legacy backend -> kajovo-hotel-api

This document describes the migration utility in `apps/kajovo-hotel-api/tools/migrate_legacy/`.

## Scope

The tool migrates these legacy domains when source tables exist:

- `snidane` (breakfast)
- `ztraty-a-nalezy` (lost & found)
- `zavady` (issues)
- `sklad` (inventory)

Migration is **idempotent**:

- imported records are tracked in `legacy_migration_audit`
- repeated runs skip already imported source records
- `--dry-run` executes full mapping and report generation, then rolls back writes

Unknown or uncertain source fields are always preserved in `legacy_migration_audit.raw_record` to avoid data loss.

## Environment variables

- `LEGACY_DB_URL` = SQLAlchemy URL for source (legacy) DB
- `DATABASE_URL` = SQLAlchemy URL for destination (new) DB

## How to run

From repository root:

```bash
python apps/kajovo-hotel-api/tools/migrate_legacy/migrate.py \
  --report-json apps/kajovo-hotel-api/tools/migrate_legacy/report.json \
  --report-csv apps/kajovo-hotel-api/tools/migrate_legacy/report.csv
```

Dry run:

```bash
python apps/kajovo-hotel-api/tools/migrate_legacy/migrate.py --dry-run
```

## Mapping (legacy -> new)

### 1) `snidane`

| Legacy table.field | New table.field | Notes |
|---|---|---|
| `breakfast_days.day` | `breakfast_orders.service_date` | joined via `breakfast_entries.breakfast_day_id` |
| `breakfast_entries.room` | `breakfast_orders.room_number` | direct mapping |
| `breakfast_entries.guest_name` | `breakfast_orders.guest_name` | fallback: `Legacy room <room>` |
| `breakfast_entries.breakfast_count` | `breakfast_orders.guest_count` | clamped to minimum `1` |
| `breakfast_entries.checked_at` | `breakfast_orders.status` | `served` when set, else `pending` |
| `breakfast_entries.note` | `breakfast_orders.note` | direct mapping |
| full source row | `legacy_migration_audit.raw_record` | preserved JSON payload |

### 2) `ztraty-a-nalezy`

| Legacy table.field | New table.field | Notes |
|---|---|---|
| `reports` where `report_type='FIND'` | `lost_found_items.*` | filtered domain |
| `reports.description` | `lost_found_items.description` | fallback when null |
| `reports.room` | `lost_found_items.location` | normalized as `room <room>` |
| `reports.created_at` | `lost_found_items.event_at` | fallback: current UTC time |
| `reports.status` | `lost_found_items.status` | `OPEN->stored`, otherwise `claimed` |
| constant | `lost_found_items.item_type='found'` | legacy FIND is mapped as found item |
| full source row | `legacy_migration_audit.raw_record` | preserved JSON payload |

### 3) `zavady`

| Legacy table.field | New table.field | Notes |
|---|---|---|
| `reports` where `report_type='ISSUE'` | `issues.*` | filtered domain |
| `reports.description` | `issues.description` | direct mapping |
| `reports.description[:80]` | `issues.title` | fallback title when description is null |
| `reports.room` | `issues.room_number` | direct mapping |
| `reports.room` | `issues.location` | normalized as `room <room>` |
| `reports.status` | `issues.status` | `OPEN->new`, otherwise `resolved` |
| `reports.done_at` | `issues.resolved_at` | populated when resolved |
| constant | `issues.priority='medium'` | legacy lacks equivalent priority |
| full source row | `legacy_migration_audit.raw_record` | preserved JSON payload |

### 4) `sklad`

| Legacy table.field | New table.field | Notes |
|---|---|---|
| `inventory_ingredients.name` | `inventory_items.name` | direct mapping |
| `inventory_ingredients.unit` | `inventory_items.unit` | direct mapping |
| `inventory_ingredients.stock_qty_base` | `inventory_items.current_stock` | non-negative import |
| constant | `inventory_items.min_stock=0` | no exact legacy equivalent |
| `inventory_stock_cards.card_type` | `inventory_movements.movement_type` | `IN->in`, `OUT->out` |
| `inventory_stock_card_lines.qty_delta_base` | `inventory_movements.quantity` | absolute value |
| card metadata | `inventory_movements.note` | card number/date + `qty_pieces` text |
| full source row | `legacy_migration_audit.raw_record` | preserved JSON payload |

## Audit table

`legacy_migration_audit` stores one row per source record mapping, including:

- domain
- source table and source PK
- destination table and destination PK
- mapping note
- full legacy row JSON payload (`raw_record`)

It has a unique constraint on `(domain, legacy_table, legacy_pk, target_table)`.

## Verification queries

Run against `DATABASE_URL`:

```sql
-- imported totals by domain
SELECT domain, import_status, COUNT(*)
FROM legacy_migration_audit
GROUP BY domain, import_status
ORDER BY domain, import_status;
```

```sql
-- compare imported breakfast rows
SELECT COUNT(*) AS imported_breakfast
FROM breakfast_orders bo
JOIN legacy_migration_audit a
  ON a.target_table = 'breakfast_orders'
 AND a.target_pk = bo.id::text;
```

```sql
-- check preserved raw payloads for uncertain mappings
SELECT domain, legacy_table, legacy_pk, target_table, mapping_note, raw_record
FROM legacy_migration_audit
ORDER BY id DESC
LIMIT 50;
```

```sql
-- unresolved migration errors are listed only in generated report files
-- (JSON and CSV) for each run
```
