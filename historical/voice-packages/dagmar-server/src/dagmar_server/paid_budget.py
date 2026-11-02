"""Shared durable hard USD 10 ledger for opt-in tests, never normal CI."""
from decimal import Decimal
import sqlite3
from pathlib import Path


class BudgetError(Exception):
    pass


class PaidBudget:
    LIMIT_MICRO_USD = 10_000_000

    @classmethod
    def open_original(cls, path):
        """Open the existing shared implementation-test ledger without creating it.

        The four original calls and their ASR reservations establish identity.
        Reconciliation may change charges, never remove these reservations.
        Missing usage is still held by reserve/snapshot; this does not reconcile.
        """
        originals = {
            "native-1bcbfca504f4414d8cf9e0fef48e63a9": 9_400_000,
            "native-ba868ee50c8c4573a4ffa921d6934d92": 470_000,
            "native-c4b2eb24816c4c59b7411a00313cb0f1": 430_000,
            "native-1b222c27609c4e7a9567ba5e491b8dc9": 300_000,
        }
        resolved = Path(path).resolve()
        if not resolved.is_file():
            raise BudgetError("original_paid_ledger_missing")
        try:
            with sqlite3.connect(resolved.as_uri() + "?mode=ro", uri=True) as db:
                db.execute("PRAGMA query_only=ON")
                rows = {r[0]: r[1:] for r in db.execute("SELECT id,reserved,charged,state,model,pricing_revision FROM entries")}
                for identity, maximum in originals.items():
                    for suffix, amount, model in (("", maximum, "gpt-realtime-2.1"),
                        ("-transcription", 100_000 if maximum == 9_400_000 else 20_000, "gpt-4o-mini-transcribe")):
                        row = rows.get(identity + suffix)
                        if not row or row[0] != amount or row[3:] != (model, "openai-2026-10-04-v1"):
                            raise BudgetError("original_paid_ledger_identity_mismatch")
                for row in rows.values():
                    reserved, charged, state, _, _ = row
                    if reserved <= 0 or state not in {"reserved", "usage_unknown", "reconciled"} or ((state == "reconciled") != (charged is not None)) or (charged is not None and not 0 <= charged <= reserved):
                        raise BudgetError("original_paid_ledger_invalid")
                for identity, charged in (("native-ba868ee50c8c4573a4ffa921d6934d92", 26_832),
                    ("native-c4b2eb24816c4c59b7411a00313cb0f1", 27_798)):
                    if rows[identity][1] != charged or rows[identity][2] != "reconciled":
                        raise BudgetError("original_paid_ledger_reconciliation_missing")
        except sqlite3.Error:
            raise BudgetError("original_paid_ledger_unreadable") from None
        result = cls.__new__(cls)
        result.path = str(resolved)
        result.existing_only = True
        return result

    def __init__(self, path):
        self.path = str(Path(path).resolve())
        self.existing_only = False
        with sqlite3.connect(self.path) as db:
            db.execute("PRAGMA synchronous=FULL")
            db.execute("CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,reserved INTEGER NOT NULL,charged INTEGER,state TEXT NOT NULL,model TEXT NOT NULL,pricing_revision TEXT NOT NULL)")

    def _connect(self):
        if self.existing_only:
            try:
                return sqlite3.connect(Path(self.path).as_uri() + "?mode=rw", uri=True, timeout=10)
            except sqlite3.Error:
                raise BudgetError("original_paid_ledger_unreadable") from None
        return sqlite3.connect(self.path, timeout=10)

    def reserve(self, identity, maximum_usd, model, pricing_revision):
        maximum = int((Decimal(str(maximum_usd))*1_000_000).to_integral_value(rounding="ROUND_CEILING"))
        if maximum <= 0 or not model or not pricing_revision:
            raise BudgetError("conservative_maximum_and_pricing_required")
        with self._connect() as db:
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
        with self._connect() as db:
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
        with self._connect() as db:
            rows = [{"id":r[0],"reserved_micro_usd":r[1],"charged_micro_usd":r[2],"state":r[3],"model":r[4],"pricing_revision":r[5]} for r in db.execute("SELECT * FROM entries")]
        committed = sum(r["charged_micro_usd"] if r["charged_micro_usd"] is not None else r["reserved_micro_usd"] for r in rows)
        return {"limit_micro_usd":self.LIMIT_MICRO_USD,"committed_micro_usd":committed,"available_micro_usd":self.LIMIT_MICRO_USD-committed,"entries":rows}
