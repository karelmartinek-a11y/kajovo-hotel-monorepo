from concurrent.futures import ThreadPoolExecutor
import pytest
from dagmar_server.paid_budget import PaidBudget, BudgetError
import hashlib
import json
from pathlib import Path
import sqlite3


def test_atomic_shared_budget_unknown_does_not_unlock(tmp_path):
    ledger=PaidBudget(tmp_path/'paid.sqlite3')
    def reserve(n):
        try:
            ledger.reserve(str(n),3,'actual-model','official-pricing-2026-10-04')
            return True
        except BudgetError:
            return False
    with ThreadPoolExecutor(max_workers=8) as executor:
        assert sum(executor.map(reserve,range(8)))==3
    snapshot=ledger.snapshot()
    identity=snapshot['entries'][0]['id']
    ledger.reconcile(identity,None,complete=False)
    assert ledger.snapshot()['available_micro_usd']==1_000_000
    ledger.reconcile(identity,1,complete=True)
    ledger.reserve('next',3,'actual-model','official-pricing-2026-10-04')
    assert ledger.snapshot()['available_micro_usd']==0
    with pytest.raises(BudgetError,match='exhausted'):
        ledger.reserve('over',0.000001,'actual-model','official-pricing-2026-10-04')
    with pytest.raises(BudgetError,match='identity_conflict'):
        ledger.reconcile(identity,0.5,complete=True)


def test_live_budget_never_creates_missing_original(tmp_path):
    path = tmp_path/'missing.sqlite'
    with pytest.raises(BudgetError, match='original_paid_ledger_missing'):
        PaidBudget.open_original(path)
    assert not path.exists()


def test_live_budget_rejects_empty_or_foreign_ledger(tmp_path):
    path = tmp_path/'foreign.sqlite'
    PaidBudget(path).reserve('other-test', 1, 'model', 'revision')
    before = path.read_bytes()
    with pytest.raises(BudgetError, match='identity_mismatch'):
        PaidBudget.open_original(path)
    assert path.read_bytes() == before


def test_live_budget_opens_original_without_releasing_unknown_usage(tmp_path):
    # This unit fixture is NOT an authorization ledger for a provider test.
    path = tmp_path/'unit-only-original-shape.sqlite'
    snapshot = json.loads((Path(__file__).parent/'fixtures/paid-original-unit.json').read_text())
    PaidBudget(path)
    with sqlite3.connect(path) as db:
        db.executemany('INSERT INTO entries VALUES(?,?,?,?,?,?)', [(r['id'], r['reserved_micro_usd'], r['charged_micro_usd'], r['state'], r['model'], r['pricing_revision']) for r in snapshot['entries']])
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    ledger = PaidBudget.open_original(path)
    assert ledger.snapshot() == snapshot
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest
    with pytest.raises(BudgetError, match='exhausted'):
        ledger.reserve('probe-unit-only', '3.80', 'gpt-realtime-2.1', 'openai-2026-10-04-v1')
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest
    path.unlink()
    with pytest.raises(BudgetError, match='unreadable'):
        ledger.reserve('lost-original-unit-only', '0.01', 'gpt-realtime-2.1', 'openai-2026-10-04-v1')
    assert not path.exists()


def test_live_budget_rejects_removed_accounted_charge(tmp_path):
    path = tmp_path/'unit-only-removed-charge.sqlite'
    snapshot = json.loads((Path(__file__).parent/'fixtures/paid-original-unit.json').read_text())
    PaidBudget(path)
    with sqlite3.connect(path) as db:
        db.executemany('INSERT INTO entries VALUES(?,?,?,?,?,?)', [(r['id'], r['reserved_micro_usd'], r['charged_micro_usd'], r['state'], r['model'], r['pricing_revision']) for r in snapshot['entries']])
        db.execute("UPDATE entries SET charged=NULL,state='usage_unknown' WHERE id='native-ba868ee50c8c4573a4ffa921d6934d92'")
    with pytest.raises(BudgetError, match='reconciliation_missing'):
        PaidBudget.open_original(path)
