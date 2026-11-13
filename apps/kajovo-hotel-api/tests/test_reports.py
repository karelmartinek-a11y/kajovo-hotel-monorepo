"""Retired reports are represented by the issue register after migration."""
import pytest


@pytest.mark.parametrize("method", ["GET", "POST", "PUT", "DELETE"])
def test_retired_report_endpoint_is_not_available(api_request, method):
    status, _ = api_request("/api/v1/reports", method=method, payload={} if method != "GET" else None)
    assert status == 404
