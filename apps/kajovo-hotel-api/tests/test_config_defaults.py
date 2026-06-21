from app.config import Settings


def test_production_host_is_in_trusted_hosts() -> None:
    settings = Settings()
    assert 'hotel.hcasc.cz' in settings.trusted_hosts


def test_production_origin_is_in_cors_allow_origins() -> None:
    settings = Settings()
    assert 'https://hotel.hcasc.cz' in settings.cors_allow_origins


def test_deprecated_cutover_aliases_are_not_active_defaults() -> None:
    settings = Settings()
    assert 'kajovohotel.hcasc.cz' not in settings.trusted_hosts
    assert 'https://kajovohotel.hcasc.cz' not in settings.cors_allow_origins
