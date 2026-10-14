"""Guidance label updates preserve canonical validation and business constraints."""
import copy

import pytest

from dagmar_server.public_contract import contract_from_fixtures, digest
from dagmar_server.smart import HA_CANDIDATE, HA_CORRECTION

KNOWN = [HA_CANDIDATE, HA_CORRECTION]


def revised():
    value = copy.deepcopy(HA_CORRECTION)
    value['guidance_version'] = '2026-10-14.2'
    value['instructions'] += '\nUse the current server-issued intent for native explicit controls.'
    value['tools'][0]['description'] += ' Native explicit controls first prepare their exact intent.'
    value['tools'][0]['outputSchema']['properties']['guidance_version']['const'] = value['guidance_version']
    return seal(value)


def seal(value):
    value['sha256'] = digest({key: item for key, item in value.items() if key not in {'sha256', 'metadata_digest'}})
    return value


def test_guidance_only_revision_uses_current_projection_without_mutating_frozen_fixture():
    before = copy.deepcopy(HA_CORRECTION)
    value = revised()
    contract = contract_from_fixtures(value, KNOWN)
    projection = contract.project()
    assert contract.metadata_digest == value['sha256']
    assert projection['metadata_digest'] == value['sha256']
    assert value['instructions'] in projection['instructions']
    assert projection['guidance_version'] == value['guidance_version']
    assert HA_CORRECTION == before


def test_actual_output_validator_enforces_current_guidance_label():
    value = revised()
    contract = contract_from_fixtures(value, KNOWN)
    result = {'catalog_revision': 'fixture', 'observed_at': '2026-10-14T12:00:00Z',
              'results': [], 'contract_version': 'smart/2', 'guidance_version': value['guidance_version'],
              'contract_sha256': value['sha256']}
    contract.validate_output('smart_technologie', result)
    with pytest.raises(ValueError, match='invalid_contract_output'):
        contract.validate_output('smart_technologie', {**result, 'guidance_version': HA_CORRECTION['guidance_version']})


@pytest.mark.parametrize('change', ['input', 'output', 'inconsistent_label', 'missing_label', 'malformed_label', 'profile', 'version', 'integrity'])
def test_guidance_update_cannot_admit_breaking_or_inconsistent_contract(change):
    value = revised()
    tool = value['tools'][0]
    if change == 'input':
        tool['inputSchema']['allOf'] = [{'not': {}}]
    elif change == 'output':
        tool['outputSchema']['properties']['results'] = {'type': 'string'}
    elif change == 'inconsistent_label':
        tool['outputSchema']['properties']['guidance_version']['const'] = HA_CORRECTION['guidance_version']
    elif change == 'missing_label':
        tool['outputSchema']['properties'].pop('guidance_version')
    elif change == 'malformed_label':
        tool['outputSchema']['properties']['guidance_version'] = None
    elif change == 'profile':
        value['compatibility_profile'] = 'unknown/99'
    elif change == 'version':
        value['contract_version'] = 'smart/99'
    else:
        value['sha256'] = '0' * 64
    if change != 'integrity':
        seal(value)
    with pytest.raises(ValueError):
        contract_from_fixtures(value, KNOWN)


def test_historical_fixture_remains_accepted():
    assert contract_from_fixtures(HA_CORRECTION, KNOWN).metadata_digest == HA_CORRECTION['sha256']
