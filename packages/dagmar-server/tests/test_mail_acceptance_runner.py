"""Unpaid guard tests. They never invoke the real provider entry point."""
import importlib.util
from pathlib import Path
import pytest
import subprocess
from dagmar_server.paid_budget import BudgetError


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
