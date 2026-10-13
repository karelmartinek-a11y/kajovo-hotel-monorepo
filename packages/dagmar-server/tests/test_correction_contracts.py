"""Current and frozen correction contracts are independent tested public revisions."""
import copy
import pytest
from mcp.types import Tool
from dagmar_server.public_contract import contract_from_fixtures,digest
from dagmar_server.smart import HA_CANDIDATE,HA_CORRECTION,SmartArguments
from dagmar_server.smartplan import CANDIDATE_CONTRACT,CORRECTION_CONTRACT,RECOMMENDED

@pytest.mark.parametrize('fixture,known',[(HA_CANDIDATE,[HA_CANDIDATE,HA_CORRECTION]),
    (HA_CORRECTION,[HA_CANDIDATE,HA_CORRECTION]),
    (CANDIDATE_CONTRACT,[CANDIDATE_CONTRACT,CORRECTION_CONTRACT]),
    (CORRECTION_CONTRACT,[CANDIDATE_CONTRACT,CORRECTION_CONTRACT])])
def test_current_and_correction_public_wire_and_projection(fixture,known):
    contract=contract_from_fixtures(fixture,known)
    contract.verify_wire([Tool.model_validate(tool) for tool in fixture['tools']])
    projection=contract.project(recommended=RECOMMENDED if fixture['contract_version']=='navigation/1' else None)
    assert projection['metadata_digest']==fixture['sha256']
    assert fixture['instructions'] in projection['instructions']
    if fixture['contract_version']=='smart/2':
        request={'operation':'read','rows':[1],'catalog_revision':'revision',
                 'projection':'compact','readings':[{'row':1,'function':'r01'}]}
        SmartArguments.model_validate(request)
        contract.validate_input('smart_technologie',{'api_version':2,'session_id':'fixture',**request})
    bad=copy.deepcopy(fixture)
    bad['compatibility_profile']='unknown-profile'
    bad['sha256']=digest({k:v for k,v in bad.items() if k!='sha256'})
    with pytest.raises(ValueError):
        contract_from_fixtures(bad,known)
    bad=copy.deepcopy(fixture)
    tool=bad['tools'][0]
    tool['inputSchema']['allOf']=[{'not':{}}]
    bad['sha256']=digest({k:v for k,v in bad.items() if k!='sha256'})
    with pytest.raises(ValueError):
        contract_from_fixtures(bad,known)
