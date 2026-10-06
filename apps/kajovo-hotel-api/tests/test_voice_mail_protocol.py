"""Actual host reader/worker with deterministic native MCP frames, no paid IO."""
import asyncio
import json

import pytest

from .test_voice_memory_protocol import FakeRealtime, bridge_for, wait_for
from .test_voice_memory_protocol import host as _host
from .test_voice_memory_protocol import voice_host as _voice_host

host = _host
voice_host = _voice_host


@pytest.mark.parametrize('order', [('done','transport','output'), ('output','done','transport'), ('transport','output','done')])
def test_native_result_continues_once_only_after_all_provider_evidence(host, monkeypatch, order):
    provider = FakeRealtime('Kolik mám nepřečtených?', {})
    # The fake's speech response requires a confirmed result; it never executes MCP.
    provider.answers.append({'source':'native-protocol-fixture'})
    async def scenario():
        bridge = await bridge_for(host,monkeypatch,provider)
        bridge.mail.status = 'ready'
        try:
            await provider.events.put({'type':'input_audio_buffer.speech_started','item_id':'native-human'})
            await provider.events.put({'type':'input_audio_buffer.committed','item_id':'native-human'})
            await provider.events.put({'type':'response.created','response':{'id':'native-response'}})
            item = {'id':'native-call','type':'mcp_call','server_label':'hotel_mail','name':'mail_search',
                    'arguments':json.dumps({'request':{'scope':{'accounts':['recepce']},'mode':'count'}}),
                    'output':json.dumps({'total_count':12,'returned_count':0,'count_kind':'exact','coverage_complete':True,'query_id':'native-query','items':[],'errors':[]})}
            await provider.events.put({'type':'response.output_item.added','response_id':'native-response','item':{**item,'output':None}})
            frames = {'done':{'type':'response.done','response':{'id':'native-response','status':'completed','output':[]}},
                      'transport':{'type':'response.mcp_call.completed','item_id':'native-call'},
                      'output':{'type':'response.output_item.done','response_id':'native-response','item':item}}
            for stage in order[:-1]:
                await provider.events.put(frames[stage])
                await asyncio.sleep(.02)
                assert provider.continuation_ids == []
            await provider.events.put(frames[order[-1]])
            await wait_for(lambda:len(provider.continuation_ids)==1)
            await provider.events.put(frames['transport'])
            await provider.events.put(frames['output'])
            await asyncio.sleep(.03)
            assert len(provider.continuation_ids)==1 and not bridge.renew
            assert not any(e.get('item',{}).get('type')=='function_call_output' for e in provider.sent)
            assert bridge.mail.status == 'ready'
        finally:
            await bridge.close()
    asyncio.run(scenario())
