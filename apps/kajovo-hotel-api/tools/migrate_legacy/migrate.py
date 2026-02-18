from __future__ import annotations

import argparse
import csv
import json
import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    UniqueConstraint,
    create_engine,
    func,
    inspect,
)
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import SQLAlchemyError


@dataclass
class DomainStats:
    domain: str
    scanned: int = 0
    imported: int = 0
    skipped: int = 0
    errors: int = 0


@dataclass
class MigrationReport:
    dry_run: bool
    started_at: str
    finished_at: str | None = None
    domains: dict[str, DomainStats] = field(default_factory=dict)
    errors: list[dict[str, Any]] = field(default_factory=list)

    def ensure_domain(self, domain: str) -> DomainStats:
        if domain not in self.domains:
            self.domains[domain] = DomainStats(domain=domain)
        return self.domains[domain]

    def to_dict(self) -> dict[str, Any]:
        return {
            "dry_run": self.dry_run,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "totals": {
                "scanned": sum(v.scanned for v in self.domains.values()),
                "imported": sum(v.imported for v in self.domains.values()),
                "skipped": sum(v.skipped for v in self.domains.values()),
                "errors": sum(v.errors for v in self.domains.values()),
            },
            "domains": {
                name: {
                    "scanned": value.scanned,
                    "imported": value.imported,
                    "skipped": value.skipped,
                    "errors": value.errors,
                }
                for name, value in sorted(self.domains.items())
            },
            "errors": self.errors,
        }


class LegacyMigrator:
    def __init__(self, legacy_engine: Engine, new_engine: Engine, dry_run: bool) -> None:
        self.legacy_engine = legacy_engine
        self.new_engine = new_engine
        self.dry_run = dry_run
        self.new_meta = MetaData()
        self.legacy_meta = MetaData()

        self.breakfast_orders = Table(
            "breakfast_orders", self.new_meta, autoload_with=self.new_engine
        )
        self.lost_found_items = Table(
            "lost_found_items", self.new_meta, autoload_with=self.new_engine
        )
        self.issues = Table("issues", self.new_meta, autoload_with=self.new_engine)
        self.inventory_items = Table(
            "inventory_items", self.new_meta, autoload_with=self.new_engine
        )
        self.inventory_movements = Table(
            "inventory_movements", self.new_meta, autoload_with=self.new_engine
        )
        self.audit_table: Table | None = None

    def _legacy_table(self, name: str) -> Table:
        if name in self.legacy_meta.tables:
            return self.legacy_meta.tables[name]
        return Table(name, self.legacy_meta, autoload_with=self.legacy_engine)

    def _init_audit_table(self, connection: Connection) -> Table:
        if self.audit_table is not None:
            return self.audit_table

        if inspect(connection).has_table("legacy_migration_audit"):
            audit_table = Table(
                "legacy_migration_audit", self.new_meta, autoload_with=self.new_engine
            )
        else:
            audit_table = Table(
                "legacy_migration_audit",
                self.new_meta,
                Column("id", Integer, primary_key=True),
                Column("domain", String(64), nullable=False),
                Column("legacy_table", String(128), nullable=False),
                Column("legacy_pk", String(128), nullable=False),
                Column("target_table", String(128), nullable=False),
                Column("target_pk", String(128), nullable=True),
                Column("import_status", String(32), nullable=False),
                Column("mapping_note", Text, nullable=True),
                Column("raw_record", JSON, nullable=False),
                Column(
                    "created_at", DateTime(timezone=True), nullable=False, server_default=func.now()
                ),
                UniqueConstraint(
                    "domain",
                    "legacy_table",
                    "legacy_pk",
                    "target_table",
                    name="uq_legacy_audit_source",
                ),
                Index("ix_legacy_audit_source", "domain", "legacy_table", "legacy_pk"),
                Index("ix_legacy_audit_target", "target_table", "target_pk"),
            )
        self.new_meta.create_all(connection, tables=[audit_table], checkfirst=True)
        self.audit_table = audit_table
        return audit_table

    def _has_imported(
        self,
        conn: Connection,
        *,
        domain: str,
        legacy_table: str,
        legacy_pk: str,
        target_table: str,
    ) -> bool:
        row = conn.execute(
            self.audit_table.select()  # type: ignore[union-attr]
            .where(self.audit_table.c.domain == domain)  # type: ignore[union-attr]
            .where(self.audit_table.c.legacy_table == legacy_table)  # type: ignore[union-attr]
            .where(self.audit_table.c.legacy_pk == legacy_pk)  # type: ignore[union-attr]
            .where(self.audit_table.c.target_table == target_table)  # type: ignore[union-attr]
            .limit(1)
        ).first()
        return row is not None

    def _write_audit(
        self,
        conn: Connection,
        *,
        domain: str,
        legacy_table: str,
        legacy_pk: str,
        target_table: str,
        target_pk: str | None,
        import_status: str,
        mapping_note: str,
        raw_record: dict[str, Any],
    ) -> None:
        conn.execute(
            self.audit_table.insert().values(  # type: ignore[union-attr]
                domain=domain,
                legacy_table=legacy_table,
                legacy_pk=legacy_pk,
                target_table=target_table,
                target_pk=target_pk,
                import_status=import_status,
                mapping_note=mapping_note,
                raw_record=raw_record,
            )
        )

    def migrate(self) -> MigrationReport:
        report = MigrationReport(dry_run=self.dry_run, started_at=datetime.now(UTC).isoformat())
        legacy_inspector = inspect(self.legacy_engine)

        with self.new_engine.connect() as new_conn, self.legacy_engine.connect() as legacy_conn:
            self._init_audit_table(new_conn)
            trans = new_conn.begin()
            try:
                self._migrate_breakfast(legacy_inspector, legacy_conn, new_conn, report)
                self._migrate_lost_found(legacy_inspector, legacy_conn, new_conn, report)
                self._migrate_issues(legacy_inspector, legacy_conn, new_conn, report)
                self._migrate_inventory(legacy_inspector, legacy_conn, new_conn, report)
                if self.dry_run:
                    trans.rollback()
                else:
                    trans.commit()
            except Exception:
                trans.rollback()
                raise

        report.finished_at = datetime.now(UTC).isoformat()
        return report

    def _migrate_breakfast(
        self,
        legacy_inspector: Any,
        legacy_conn: Connection,
        new_conn: Connection,
        report: MigrationReport,
    ) -> None:
        domain = report.ensure_domain("snidane")
        if not legacy_inspector.has_table("breakfast_entries") or not legacy_inspector.has_table(
            "breakfast_days"
        ):
            return

        entries = self._legacy_table("breakfast_entries")
        days = self._legacy_table("breakfast_days")
        rows = legacy_conn.execute(
            entries.join(days, entries.c.breakfast_day_id == days.c.id)
            .select()
            .order_by(entries.c.id.asc())
        ).mappings()

        for row in rows:
            domain.scanned += 1
            legacy_pk = str(row["breakfast_entries_id"])
            if self._has_imported(
                new_conn,
                domain="snidane",
                legacy_table="breakfast_entries",
                legacy_pk=legacy_pk,
                target_table="breakfast_orders",
            ):
                domain.skipped += 1
                continue
            try:
                status = "served" if row.get("breakfast_entries_checked_at") else "pending"
                insert_result = new_conn.execute(
                    self.breakfast_orders.insert().values(
                        service_date=row["breakfast_days_day"],
                        room_number=row["breakfast_entries_room"],
                        guest_name=row.get("breakfast_entries_guest_name")
                        or f"Legacy room {row['breakfast_entries_room']}",
                        guest_count=max(int(row["breakfast_entries_breakfast_count"]), 1),
                        status=status,
                        note=row.get("breakfast_entries_note"),
                    )
                )
                self._write_audit(
                    new_conn,
                    domain="snidane",
                    legacy_table="breakfast_entries",
                    legacy_pk=legacy_pk,
                    target_table="breakfast_orders",
                    target_pk=str(insert_result.inserted_primary_key[0]),
                    import_status="imported",
                    mapping_note="checked_at -> served/pending status",
                    raw_record=dict(row),
                )
                domain.imported += 1
            except SQLAlchemyError as exc:
                domain.errors += 1
                report.errors.append(
                    {
                        "domain": "snidane",
                        "legacy_table": "breakfast_entries",
                        "legacy_pk": legacy_pk,
                        "error": str(exc),
                    }
                )

    def _migrate_lost_found(
        self,
        legacy_inspector: Any,
        legacy_conn: Connection,
        new_conn: Connection,
        report: MigrationReport,
    ) -> None:
        domain = report.ensure_domain("ztraty-a-nalezy")
        if not legacy_inspector.has_table("reports"):
            return

        legacy_reports = self._legacy_table("reports")
        rows = legacy_conn.execute(
            legacy_reports.select().where(legacy_reports.c.report_type == "FIND")
        ).mappings()

        for row in rows:
            domain.scanned += 1
            legacy_pk = str(row["id"])
            if self._has_imported(
                new_conn,
                domain="ztraty-a-nalezy",
                legacy_table="reports",
                legacy_pk=legacy_pk,
                target_table="lost_found_items",
            ):
                domain.skipped += 1
                continue
            try:
                status = "stored" if str(row.get("status", "OPEN")).upper() == "OPEN" else "claimed"
                insert_result = new_conn.execute(
                    self.lost_found_items.insert().values(
                        item_type="found",
                        description=row.get("description") or "Legacy report without description",
                        category="legacy-report",
                        location=f"room {row.get('room') or 'unknown'}",
                        event_at=row.get("created_at") or datetime.now(UTC),
                        status=status,
                        claimant_name=None,
                        claimant_contact=None,
                        handover_note="Imported from legacy report_type=FIND",
                    )
                )
                self._write_audit(
                    new_conn,
                    domain="ztraty-a-nalezy",
                    legacy_table="reports",
                    legacy_pk=legacy_pk,
                    target_table="lost_found_items",
                    target_pk=str(insert_result.inserted_primary_key[0]),
                    import_status="imported",
                    mapping_note=(
                        "report_type FIND mapped to found item; "
                        "status OPEN/DONE -> stored/claimed"
                    ),
                    raw_record=dict(row),
                )
                domain.imported += 1
            except SQLAlchemyError as exc:
                domain.errors += 1
                report.errors.append(
                    {
                        "domain": "ztraty-a-nalezy",
                        "legacy_table": "reports",
                        "legacy_pk": legacy_pk,
                        "error": str(exc),
                    }
                )

    def _migrate_issues(
        self,
        legacy_inspector: Any,
        legacy_conn: Connection,
        new_conn: Connection,
        report: MigrationReport,
    ) -> None:
        domain = report.ensure_domain("zavady")
        if not legacy_inspector.has_table("reports"):
            return

        legacy_reports = self._legacy_table("reports")
        rows = legacy_conn.execute(
            legacy_reports.select().where(legacy_reports.c.report_type == "ISSUE")
        ).mappings()

        for row in rows:
            domain.scanned += 1
            legacy_pk = str(row["id"])
            if self._has_imported(
                new_conn,
                domain="zavady",
                legacy_table="reports",
                legacy_pk=legacy_pk,
                target_table="issues",
            ):
                domain.skipped += 1
                continue
            try:
                status = "new" if str(row.get("status", "OPEN")).upper() == "OPEN" else "resolved"
                description = row.get("description")
                title = (
                    description[:80]
                    if description
                    else f"Legacy issue room {row.get('room') or 'N/A'}"
                )
                insert_result = new_conn.execute(
                    self.issues.insert().values(
                        title=title,
                        description=description,
                        location=f"room {row.get('room') or 'unknown'}",
                        room_number=row.get("room"),
                        priority="medium",
                        status=status,
                        resolved_at=row.get("done_at") if status == "resolved" else None,
                    )
                )
                self._write_audit(
                    new_conn,
                    domain="zavady",
                    legacy_table="reports",
                    legacy_pk=legacy_pk,
                    target_table="issues",
                    target_pk=str(insert_result.inserted_primary_key[0]),
                    import_status="imported",
                    mapping_note="legacy ISSUE report converted to issue with medium priority",
                    raw_record=dict(row),
                )
                domain.imported += 1
            except SQLAlchemyError as exc:
                domain.errors += 1
                report.errors.append(
                    {
                        "domain": "zavady",
                        "legacy_table": "reports",
                        "legacy_pk": legacy_pk,
                        "error": str(exc),
                    }
                )

    def _migrate_inventory(
        self,
        legacy_inspector: Any,
        legacy_conn: Connection,
        new_conn: Connection,
        report: MigrationReport,
    ) -> None:
        domain = report.ensure_domain("sklad")
        if not legacy_inspector.has_table("inventory_ingredients"):
            return

        ingredient_pk_to_new_pk: dict[int, int] = {}
        ingredients = self._legacy_table("inventory_ingredients")

        ingredient_rows = legacy_conn.execute(
            ingredients.select().order_by(ingredients.c.id.asc())
        ).mappings()
        for row in ingredient_rows:
            domain.scanned += 1
            legacy_pk = str(row["id"])
            if self._has_imported(
                new_conn,
                domain="sklad",
                legacy_table="inventory_ingredients",
                legacy_pk=legacy_pk,
                target_table="inventory_items",
            ):
                domain.skipped += 1
                existing = (
                    new_conn.execute(
                        self.audit_table.select()
                        .where(self.audit_table.c.domain == "sklad")
                        .where(self.audit_table.c.legacy_table == "inventory_ingredients")
                        .where(self.audit_table.c.legacy_pk == legacy_pk)
                        .where(self.audit_table.c.target_table == "inventory_items")
                        .limit(1)
                    )
                    .mappings()
                    .first()
                )
                if existing and existing.get("target_pk"):
                    ingredient_pk_to_new_pk[row["id"]] = int(existing["target_pk"])
                continue
            try:
                insert_result = new_conn.execute(
                    self.inventory_items.insert().values(
                        name=row["name"],
                        unit=row["unit"],
                        min_stock=0,
                        current_stock=max(int(row.get("stock_qty_base", 0)), 0),
                        supplier=None,
                    )
                )
                new_item_pk = int(insert_result.inserted_primary_key[0])
                ingredient_pk_to_new_pk[row["id"]] = new_item_pk
                self._write_audit(
                    new_conn,
                    domain="sklad",
                    legacy_table="inventory_ingredients",
                    legacy_pk=legacy_pk,
                    target_table="inventory_items",
                    target_pk=str(new_item_pk),
                    import_status="imported",
                    mapping_note=(
                        "stock_qty_base imported as current_stock; "
                        "amount_per_piece_base preserved in raw_record"
                    ),
                    raw_record=dict(row),
                )
                domain.imported += 1
            except SQLAlchemyError as exc:
                domain.errors += 1
                report.errors.append(
                    {
                        "domain": "sklad",
                        "legacy_table": "inventory_ingredients",
                        "legacy_pk": legacy_pk,
                        "error": str(exc),
                    }
                )

        if not legacy_inspector.has_table(
            "inventory_stock_cards"
        ) or not legacy_inspector.has_table("inventory_stock_card_lines"):
            return

        cards = Table("inventory_stock_cards", self.legacy_meta, autoload_with=self.legacy_engine)
        lines = Table(
            "inventory_stock_card_lines", self.legacy_meta, autoload_with=self.legacy_engine
        )
        line_rows = legacy_conn.execute(
            lines.join(cards, lines.c.card_id == cards.c.id).select().order_by(lines.c.id.asc())
        ).mappings()

        for row in line_rows:
            domain.scanned += 1
            legacy_pk = str(row["inventory_stock_card_lines_id"])
            if self._has_imported(
                new_conn,
                domain="sklad",
                legacy_table="inventory_stock_card_lines",
                legacy_pk=legacy_pk,
                target_table="inventory_movements",
            ):
                domain.skipped += 1
                continue

            item_id = ingredient_pk_to_new_pk.get(row["inventory_stock_card_lines_ingredient_id"])
            if item_id is None:
                domain.errors += 1
                report.errors.append(
                    {
                        "domain": "sklad",
                        "legacy_table": "inventory_stock_card_lines",
                        "legacy_pk": legacy_pk,
                        "error": "missing migrated ingredient for line",
                    }
                )
                continue
            try:
                card_type = str(row["inventory_stock_cards_card_type"]).upper()
                movement_type = "in" if card_type == "IN" else "out"
                quantity = abs(int(row["inventory_stock_card_lines_qty_delta_base"]))
                insert_result = new_conn.execute(
                    self.inventory_movements.insert().values(
                        item_id=item_id,
                        movement_type=movement_type,
                        quantity=quantity,
                        note=(
                            f"Legacy card {row['inventory_stock_cards_number']} "
                            f"({row['inventory_stock_cards_card_date']}); "
                            f"qty_pieces={row['inventory_stock_card_lines_qty_pieces']}"
                        ),
                    )
                )
                self._write_audit(
                    new_conn,
                    domain="sklad",
                    legacy_table="inventory_stock_card_lines",
                    legacy_pk=legacy_pk,
                    target_table="inventory_movements",
                    target_pk=str(insert_result.inserted_primary_key[0]),
                    import_status="imported",
                    mapping_note="IN/OUT stock card type converted to inventory movement_type",
                    raw_record=dict(row),
                )
                domain.imported += 1
            except SQLAlchemyError as exc:
                domain.errors += 1
                report.errors.append(
                    {
                        "domain": "sklad",
                        "legacy_table": "inventory_stock_card_lines",
                        "legacy_pk": legacy_pk,
                        "error": str(exc),
                    }
                )


def write_report(report: MigrationReport, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report.to_dict(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def write_csv_summary(report: MigrationReport, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["domain", "scanned", "imported", "skipped", "errors"])
        for domain in sorted(report.domains):
            stats = report.domains[domain]
            writer.writerow(
                [stats.domain, stats.scanned, stats.imported, stats.skipped, stats.errors]
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate legacy Kajovo Hotel data into new schema")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Process input and generate report, but rollback writes",
    )
    parser.add_argument(
        "--report-json",
        type=Path,
        default=Path("apps/kajovo-hotel-api/tools/migrate_legacy/report.json"),
        help="Path to JSON report output",
    )
    parser.add_argument(
        "--report-csv",
        type=Path,
        default=Path("apps/kajovo-hotel-api/tools/migrate_legacy/report.csv"),
        help="Path to CSV report output",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    legacy_db_url = os.getenv("LEGACY_DB_URL")
    database_url = os.getenv("DATABASE_URL")

    if not legacy_db_url:
        raise RuntimeError("LEGACY_DB_URL is required")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    legacy_engine = create_engine(legacy_db_url)
    new_engine = create_engine(database_url)

    migrator = LegacyMigrator(
        legacy_engine=legacy_engine, new_engine=new_engine, dry_run=args.dry_run
    )
    report = migrator.migrate()
    write_report(report, args.report_json)
    write_csv_summary(report, args.report_csv)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
