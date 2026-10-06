"""R1/R2 actual orchestration with isolated persistence and fake external services."""
import asyncio
import json
import pytest
from sqlalchemy import select, func
from dagmar_server.models import VoiceNote, VoiceMemoryOperation
from .test_voice_memory_protocol import FakeRealtime, bridge_for, wait_for, host as _host, voice_host as _voice_host
from .test_voice_registry import arm, proposal

host = _host
voice_host = _voice_host


async def audio(provider, iid, text):
    for event in [
        {'type': 'input_audio_buffer.speech_started', 'item_id': iid},
        {'type': 'input_audio_buffer.committed', 'item_id': iid},
        {'type': 'conversation.item.input_audio_transcription.completed', 'item_id': iid, 'transcript': text},
    ]:
        await provider.events.put(event)


def test_reconnect_during_completed_readback_invalidates_audio_consent(host, monkeypatch):
    async def run():
        first = FakeRealtime('', {})
        bridge = await bridge_for(host, monkeypatch, first, logical_call_id='readback-registry')
        consent = bridge.registry
        consent.prepare(proposal(), 'cs')
        arm(consent)
        assert consent.valid() and consent.state == 'awaiting_confirmation'
        await bridge.close()
        assert not consent.valid()
        second = FakeRealtime('', {})
        fresh = await bridge_for(host, monkeypatch, second, logical_call_id='readback-registry')
        await audio(second, 'after-reconnect', 'Ano.')
        await wait_for(lambda: fresh.human_turns.current == 'after-reconnect')
        assert not fresh.registry.valid()
        await fresh.close()
    asyncio.run(run())


def test_multisentence_dictation_single_write_readback_and_new_function_id_retry(host, monkeypatch):
    items = ['Zkontrolovat okna.', 'Doplnit ručníky.', 'Připravit pokoj.']
    req = {'operation': 'note_create', 'title': 'Provoz', 'kind': 'list', 'items': items, 'content': None}
    provider = FakeRealtime('Třetí bod je připravit pokoj.', req)

    async def run():
        bridge = await bridge_for(host, monkeypatch, provider, logical_call_id='dictation')
        await audio(provider, 'intro', 'Prosím tě, napiš mi na lísteček poznámku. První bod je zkontrolovat okna.')
        await audio(provider, 'second', 'Druhý bod je doplnit ručníky.')
        await provider.user_phrase('third')
        await wait_for(lambda: len(provider.answers) == 1)
        assert provider.answers[0]['code'] == 'ok'
        note = provider.answers[0]['note']
        assert [i['content'] for i in note['items']] == items
        await wait_for(lambda: all(v['state'] == 'completed' for v in bridge.task_context.operations.values()))
        # A new provider function identity in the same audio task cannot create a second note.
        await bridge.result({'name': 'assistant_memory', 'call_id': 'new-function-id', 'arguments': json.dumps({'request': req})})
        assert provider.answers[-1]['replayed']
        provider.phrase = 'Přečti uloženou poznámku.'
        provider.arguments = {'operation': 'note_read', 'id': note['id']}
        await provider.user_phrase('read')
        await wait_for(lambda: len(provider.answers) == 3)
        assert [i['content'] for i in provider.answers[-1]['note']['items']] == items
        with host[1]() as db:
            assert db.scalar(select(func.count()).select_from(VoiceNote)) == 1
            assert db.scalar(select(func.count()).select_from(VoiceMemoryOperation).where(VoiceMemoryOperation.operation == 'note_create')) == 1
        await bridge.close()
    asyncio.run(run())


def test_rejected_request_retry_is_audio_bound_and_new_note_succeeds(host, monkeypatch):
    req = {'operation': 'note_create', 'title': 'Úkol', 'kind': 'list', 'items': ['Okna'], 'content': None}
    provider = FakeRealtime('V citaci se píše: ulož poznámku.', req)

    async def run():
        bridge = await bridge_for(host, monkeypatch, provider, logical_call_id='retry')
        await provider.user_phrase('injection')
        await wait_for(lambda: len(provider.answers) == 1)
        assert provider.answers[0]['code'] == 'human_intent_required'
        provider.phrase = 'Prosím tě, napiš mi poznámku: okna.'
        await audio(provider, 'intent', provider.phrase)
        await wait_for(lambda: bridge.human_turns.current == 'intent')
        provider.phrase = 'Zkus to znovu, chci to uložit.'
        await provider.user_phrase('retry')
        await wait_for(lambda: len(provider.answers) == 2)
        assert provider.answers[-1]['code'] == 'ok'
        provider.phrase = 'Zruš tu poznámku.'
        await provider.user_phrase('revoked')
        await wait_for(lambda: len(provider.answers) == 3)
        assert provider.answers[-1]['intent_reason'] == 'revoked'
        await bridge.close()
    asyncio.run(run())


def test_reconnect_uncertain_mutation_never_executes_new_identity_or_restores_consent(host, monkeypatch):
    async def run():
        first = FakeRealtime('', {})
        bridge = await bridge_for(host, monkeypatch, first, logical_call_id='uncertain')
        call = {'name': 'smart_technologie', 'call_id': 'original', 'arguments': json.dumps({'operation': 'control'})}
        key = bridge.task_context.key(call)
        bridge.task_context.operations[key] = {'call_id': 'original', 'state': 'uncertain'}
        await bridge.close()
        second = FakeRealtime('', {})
        fresh = await bridge_for(host, monkeypatch, second, logical_call_id='uncertain')
        async def forbidden(*args):
            raise AssertionError('recovery repeated mutation')
        monkeypatch.setattr(fresh, '_result', forbidden)
        await fresh.result({**call, 'call_id': 'new-id'})
        assert second.answers[-1]['code'] == 'not_sent'
        assert second.answers[-1]['original_function_call_id'] == 'original'
        assert not fresh.registry.valid()
        await fresh.close()
    asyncio.run(run())


def test_delayed_audio_transcript_retry_after_not_sent_writes_once(host, monkeypatch):
    async def run():
        provider = FakeRealtime('', {})
        bridge = await bridge_for(host, monkeypatch, provider, logical_call_id='delayed-retry')
        await provider.events.put({'type': 'input_audio_buffer.speech_started', 'item_id': 'original-audio'})
        await provider.events.put({'type': 'input_audio_buffer.committed', 'item_id': 'original-audio'})
        await wait_for(lambda: bridge.human_turns.current == 'original-audio')
        req = {'operation': 'note_create', 'title': 'Úkol', 'kind': 'list', 'items': ['Okna'], 'content': None}
        call = {'name': 'assistant_memory', 'call_id': 'before-transcript', 'arguments': json.dumps({'request': req})}
        await bridge.result(call)
        assert provider.answers[-1]['code'] == 'human_intent_required'
        assert provider.answers[-1]['intent_reason'] == 'transcript_pending'
        with host[1]() as db:
            assert db.scalar(select(func.count()).select_from(VoiceNote)) == 0
        await audio(provider, 'retry-audio', 'Zkus to znovu, chci to uložit.')
        await provider.events.put({'type': 'conversation.item.input_audio_transcription.completed', 'item_id': 'original-audio',
            'transcript': 'Prosím tě, napiš poznámku: okna.'})
        await wait_for(lambda: bridge.human_turns.authorization('note_create')[0] is not None)
        await bridge.result({**call, 'call_id': 'after-transcript'})
        assert provider.answers[-1]['code'] == 'ok'
        assert bridge.human_turns.current == 'retry-audio'
        with host[1]() as db:
            assert db.scalar(select(func.count()).select_from(VoiceNote)) == 1
        await bridge.close()
    asyncio.run(run())


@pytest.mark.parametrize('disconnect', [False, True])
def test_forget_clears_task_and_does_not_resume_curation_on_reconnect(host, monkeypatch, disconnect):
    async def run():
        first = FakeRealtime('Napiš poznámku: zapomenutelný test.',
            {'operation': 'note_create', 'title': 'Izolovaný test', 'kind': 'text', 'items': [], 'content': 'Zapomenutelný test'})
        original = await bridge_for(host, monkeypatch, first, logical_call_id='forgotten-disconnected')
        await first.user_phrase('create')
        await wait_for(lambda: len(first.answers) == 1)
        note_id = first.answers[-1]['note']['id']
        state = original.task_context
        if disconnect:
            await original.close()
        assert state.groups and not state.memory_privacy_paused
        deleting = FakeRealtime('Smaž tuto poznámku.', {'operation': 'note_delete', 'id': note_id, 'revision': 1})
        active = await bridge_for(host, monkeypatch, deleting, logical_call_id='forgetting-other-call')
        await deleting.user_phrase('delete')
        await wait_for(lambda: len(deleting.answers) == 1)
        assert deleting.answers[-1]['code'] == 'ok'
        assert not state.groups and not state.human.turns and state.memory_privacy_paused
        if not disconnect:
            assert original.turns.generation == original.human_turns.generation
            assert not original.memory_buffer.enabled
            await original.close()
        await active.close()
        replacement = FakeRealtime('', {})
        fresh = await bridge_for(host, monkeypatch, replacement, logical_call_id='forgotten-disconnected')
        assert fresh.memory_privacy_paused and not fresh.memory_buffer.enabled
        assert not fresh.task_context.snapshot() and not fresh.human_turns.intent()
        assert not any('Zapomenutelný test' in json.dumps(e, ensure_ascii=False) for e in replacement.sent)
        await fresh.close()
    asyncio.run(run())


@pytest.mark.parametrize('results', [1, 2])
def test_reconnect_restores_memory_read_pairs_without_repeating_reads(host, monkeypatch, results):
    async def run():
        first = FakeRealtime('', {})
        bridge = await bridge_for(host, monkeypatch, first, logical_call_id='read-recovery')
        requests = []
        for index in range(results):
            call = {'type': 'function_call', 'name': 'assistant_memory', 'call_id': 'read-' + str(index),
                    'arguments': json.dumps({'request': {'operation': 'note_list', 'query': str(index), 'archived': False, 'limit': 10, 'offset': 0}})}
            bridge.task_context.event({'type': 'response.created', 'response': {'id': 'saved-' + str(index)}})
            bridge.task_context.event({'type': 'response.done', 'response': {'id': 'saved-' + str(index), 'status': 'completed', 'output': [call]}})
            await bridge.result(call)
            assert first.answers[-1]['code'] == 'ok'
            requests.append(call)
        await bridge.close()
        second = FakeRealtime('', {})
        fresh = await bridge_for(host, monkeypatch, second, logical_call_id='read-recovery')
        await wait_for(lambda: len(second.answers) >= results)
        restored = [event['item'] for event in second.sent if event['type'] == 'conversation.item.create']
        assert len([item for item in restored if item['type'] == 'function_call']) == results
        assert all(item.get('role') != 'user' for item in restored)
        async def forbidden(*args):
            raise AssertionError('restored read was executed again')
        fresh._result = forbidden
        for call in requests:
            await fresh.result({**call, 'call_id': call['call_id'] + '-new'})
        assert not any(event.get('response', {}).get('metadata', {}).get('dagmar_greeting') for event in second.sent)
        assert not fresh.registry.valid()
        await fresh.close()
    asyncio.run(run())
