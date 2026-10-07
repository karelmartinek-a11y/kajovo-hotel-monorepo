"""Existing public technology contract, isolated backend; no provider emulation."""
import json
from pathlib import Path
from mcp.types import CallToolResult, TextContent


class SyntheticTechnologies:
    room_ref_supported = True

    def __init__(self, events):
        self.events = events
        self.catalog = json.loads((Path(__file__).parents[4] / 'examples/dagmar-host/native-test-catalog.json').read_text())

    async def call_tool(self, name, payload):
        assert name == 'smart_technologie' and payload['api_version'] == 2
        operation = payload['operation']
        self.events.append({'type':'synthetic_technology_operation','operation':operation})
        value = {'catalog_revision':'r1','results':[]}
        if operation == 'catalog':
            value['overview'] = {'device_count':1,'locations':['Testovna'],'kinds':['light']}
        elif operation == 'search':
            value.update(total=1,has_more=False,matches=[{'row':8,'name':'Zkušební lampa','location':'Testovna','kind':'light'}])
        elif operation in {'describe','read'}:
            value = self.catalog
        else:
            value['error'] = {'code':'unsupported_test_operation'}
        return CallToolResult(content=[TextContent(type='text',text=json.dumps(value))],isError=False)
