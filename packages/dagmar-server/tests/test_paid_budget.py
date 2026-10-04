from concurrent.futures import ThreadPoolExecutor
import pytest
from dagmar_server.paid_budget import PaidBudget, BudgetError


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
