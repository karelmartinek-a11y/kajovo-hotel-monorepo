"""Shared durable hard USD 10 ledger for opt-in tests, never normal CI."""
from decimal import Decimal
import sqlite3
from pathlib import Path


class BudgetError(Exception):
    pass


class PaidBudget:
    LIMIT_MICRO_USD = 10_000_000
    def __init__(self, path):
        self.path = str(Path(path).resolve())
        with sqlite3.connect(self.path) as db:
            db.execute("PRAGMA synchronous=FULL")
            db.execute("CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,reserved INTEGER NOT NULL,charged INTEGER,state TEXT NOT NULL,model TEXT NOT NULL,pricing_revision TEXT NOT NULL)")

    def reserve(self, identity, maximum_usd, model, pricing_revision):
        maximum = int((Decimal(str(maximum_usd))*1_000_000).to_integral_value(rounding="ROUND_CEILING"))
        if maximum <= 0 or not model or not pricing_revision:
            raise BudgetError("conservative_maximum_and_pricing_required")
        with sqlite3.connect(self.path, timeout=10) as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT reserved,model,pricing_revision FROM entries WHERE id=?", (identity,)).fetchone()
            if previous:
                if previous != (maximum, model, pricing_revision):
                    raise BudgetError("reservation_identity_conflict")
                return
            committed = db.execute("SELECT coalesce(sum(coalesce(charged,reserved)),0) FROM entries").fetchone()[0]
            if committed + maximum > self.LIMIT_MICRO_USD:
                raise BudgetError("paid_budget_exhausted")
            db.execute("INSERT INTO entries VALUES(?,?,NULL,'reserved',?,?)", (identity, maximum, model, pricing_revision))

    def reconcile(self, identity, measured_usd, *, complete):
        with sqlite3.connect(self.path, timeout=10) as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT reserved,charged FROM entries WHERE id=?", (identity,)).fetchone()
            if not row:
                raise BudgetError("reservation_required")
            if not complete or measured_usd is None:
                db.execute("UPDATE entries SET state='usage_unknown' WHERE id=? AND charged IS NULL", (identity,))
                return
            measured = int((Decimal(str(measured_usd))*1_000_000).to_integral_value(rounding="ROUND_CEILING"))
            if measured < 0 or measured > row[0]:
                raise BudgetError("usage_exceeds_reserved_maximum")
            if row[1] is not None and row[1] != measured:
                raise BudgetError("usage_identity_conflict")
            db.execute("UPDATE entries SET charged=?,state='reconciled' WHERE id=?", (measured, identity))

    def snapshot(self):
        with sqlite3.connect(self.path) as db:
            rows = [{"id":r[0],"reserved_micro_usd":r[1],"charged_micro_usd":r[2],"state":r[3],"model":r[4],"pricing_revision":r[5]} for r in db.execute("SELECT * FROM entries")]
        committed = sum(r["charged_micro_usd"] if r["charged_micro_usd"] is not None else r["reserved_micro_usd"] for r in rows)
        return {"limit_micro_usd":self.LIMIT_MICRO_USD,"committed_micro_usd":committed,"available_micro_usd":self.LIMIT_MICRO_USD-committed,"entries":rows}
