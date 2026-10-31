"""CML management uses verified identity; deferred voice cannot allocate a call."""

def test_signed_cml_reads_original_voice_config_without_native_cookie(cml_api_request):
    status, result = cml_api_request('/api/v1/admin/voice-core/config')
    assert status == 200
    assert isinstance(result['revision'], int)
    assert result['catalog']['models']
    assert 'api_key' not in result


def test_deferred_voice_refuses_before_logical_or_provider_call(cml_api_request, api_db_path):
    from sqlalchemy import create_engine, select, func
    from dagmar_server.models import LogicalCall
    engine = create_engine(f'sqlite:///{api_db_path}')
    with engine.connect() as db:
        before = db.scalar(select(func.count()).select_from(LogicalCall))
    for path, payload in [('/api/v1/admin/voice-core/calls', {}),
                          ('/api/v1/admin/voice-core/sessions', {'sdp': 'v=0\r\nSYNTHETIC_OFFER', 'revision': 0})]:
        status, result = cml_api_request(path, method='POST', payload=payload)
        assert status == 409
        assert result['detail']['code'] == 'voice_cml_activation_deferred'
    with engine.connect() as db:
        assert db.scalar(select(func.count()).select_from(LogicalCall)) == before
    engine.dispose()


def test_voice_management_receipts_require_actual_native_admin():
    import pytest
    from app.security.cml_requests import authorize, mutation_permission, ReceiptFault
    assert mutation_permission('api/v1/admin/voice-memory/operations') == 'voice:write'
    assert mutation_permission('api/v1/admin/voice-core/config') == 'voice:write'
    assert mutation_permission('api/v1/admin/voice-core/sessions') is None
    authorize({'public': {'admin': True, 'active_role': 'admin'}}, 'voice:write')
    for identity in [{'public': {'admin': False, 'active_role': 'admin'}}, {'public': {'admin': True, 'active_role': 'recepce'}}]:
        with pytest.raises(ReceiptFault):
            authorize(identity, 'voice:write')
