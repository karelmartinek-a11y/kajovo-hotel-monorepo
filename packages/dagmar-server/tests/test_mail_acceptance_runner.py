"""Unpaid guard tests. They never invoke the real provider entry point."""
import importlib.util
from pathlib import Path
import pytest
import subprocess
from dagmar_server.paid_budget import BudgetError


def test_authorized_final_costs_are_separate_and_pending_usage_does_not_block(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).parent/'live_mail'))
    from costs import FinalRunCosts
    history = tmp_path/'historical.sqlite'
    history.write_bytes(b'unchanged historical artifact')
    path = tmp_path/'COSTS.json'
    book = FinalRunCosts(path)
    book.reserve('first', '20', 'gpt-realtime-2.1', 'current')
    book.reconcile('first', None, complete=False)
    book.reserve('second', '20', 'gpt-realtime-2.1', 'current')
    book.reconcile('second', '.15', complete=True)
    snapshot = FinalRunCosts(path).snapshot()
    assert snapshot['pending_entries'] == 1
    assert snapshot['cumulative_accounted_USD'] == '0.15'
    assert snapshot['fixed_limit_USD'] is None
    assert snapshot['historical_ledger_replaced'] is False
    assert history.read_bytes() == b'unchanged historical artifact'
    assert path.stat().st_mode & 0o777 == 0o600


def test_missing_ledger_blocks_before_manifest_key_or_network(tmp_path):
    source = Path(__file__).parent/'live_mail/host.py'
    spec = importlib.util.spec_from_file_location('isolated_mail_probe', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with pytest.raises(BudgetError, match='original_paid_ledger_missing'):
        module.preflight(tmp_path/'absent.sqlite', tmp_path/'absent-manifest.json', tmp_path/'evidence.json')
    assert list(tmp_path.iterdir()) == []


def test_browser_observer_and_result_guards_without_provider():
    result = subprocess.run(['node', '--test', str(Path(__file__).parent/'live_mail/browser.test.mjs')], capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr


def test_isolated_host_uses_existing_routes_and_never_exposes_bootstrap_secrets(tmp_path, monkeypatch):
    from dagmar_server import mail, mail_contract
    from dagmar_server.paid_budget import PaidBudget
    from fastapi.testclient import TestClient
    import httpx
    import json
    for target, name in ((mail, 'URL'), (mail_contract, 'URL'), (mail, 'httpx')):
        monkeypatch.setattr(target, name, getattr(target, name))
    async def forbidden(*args, **kwargs):
        pytest.fail('unit guard must not request a provider or MCP')
    monkeypatch.setattr(httpx.AsyncClient, 'request', forbidden)
    source = Path(__file__).parent/'live_mail/host.py'
    spec = importlib.util.spec_from_file_location('isolated_mail_host_guard', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    fixture = {'server_url':'https://synthetic.example.invalid/mcp', 'mcp_token':'dagmar-canary-unit-mcp', 'approval_token':'dagmar-canary-unit-control'}
    key = 'isolated-unit-provider-key'
    report = tmp_path/'metadata.json'
    app = module.build_host(PaidBudget(tmp_path/'unit-only.sqlite'), fixture, 'unit-only-not-acceptance', report, key)
    with TestClient(app) as client:
        assert client.get('/dagmar/config').status_code == 401
        response = client.get('/dagmar/config', headers={'x-test-admin':'test-admin-a'})
        assert response.status_code == 200 and response.json()['configured']
        assert all(secret not in response.text for secret in (key, fixture['mcp_token'], fixture['approval_token']))
        assert client.post('/dagmar/calls').status_code == 403
    assert all(secret not in report.read_text() for secret in (key, fixture['mcp_token'], fixture['approval_token']))
    assert json.loads(report.read_text())['full_scenario_acceptance'] == 'NOT_RUN'
