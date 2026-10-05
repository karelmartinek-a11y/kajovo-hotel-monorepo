"""Bounded genuine human audio turns; tool content cannot manufacture intent."""
from collections import OrderedDict
import re
import time
import uuid
from .memory import normalize

class HumanTurns:
    def __init__(self, clock=time.monotonic):
        self.turns = OrderedDict()
        self.current = None
        self.speech = False
        self.generation = 0
        self.mail_context = False
        self.clock = clock
        self.consumed = set()
        self.bindings = {}

    def event(self, event):
        typ = event.get('type')
        if typ == 'input_audio_buffer.speech_started':
            self.generation += 1
            self.speech = True
            self.current = event.get('item_id')
        elif typ == 'input_audio_buffer.committed':
            iid = event.get('item_id')
            if iid and self.speech:
                self.current = iid
                self.turns.setdefault(iid, {'text': '', 'mail': False, 'generation': self.generation, 'completed': False, 'received': self.clock(), 'intent_id': uuid.uuid4().hex})
                self.speech = False
                while len(self.turns) > 16:
                    self.turns.popitem(last=False)
                retained = {v['intent_id'] for v in self.turns.values()}
                self.consumed.intersection_update(retained)
                self.bindings = {k: v for k, v in self.bindings.items() if k in retained}
        elif typ == 'conversation.item.input_audio_transcription.completed':
            value = self.turns.get(event.get('item_id'))
            text = event.get('transcript', '')
            if value is not None and isinstance(text, str) and len(text) <= 8000:
                value['text'] = text
                normalized = normalize(text)
                if re.search(r'\b(mail\w*|email\w*|posta|zprava|zpravy)\b', normalized) or (self.mail_context and re.search(r'\b(tohle|tento|tuhle|ten|to|toto|z ni|z nej)\b', normalized)):
                    value['mail'] = True

    def contaminate(self, iid=None):
        self.mail_context = True
        value = self.turns.get(iid or self.current)
        if value is not None:
            value['mail'] = True

    def intent(self, iid=None):
        grant, _ = self.authorization(iid=iid)
        return grant is not None and grant['id'] not in self.consumed

    def authorization(self, operation=None, target=None, iid=None):
        """Only matched native audio creates a bounded operation-specific grant.

        Transcripts are evaluated in audio order, not completion arrival order.
        Quoted/tool content cannot supply the imperative. VAD is not acoustic proof.
        """
        current = iid or self.current
        if current not in self.turns:
            return None, 'missing_audio'
        if not self.turns[current]['text']:
            return None, 'transcript_pending'
        active = None
        reason = 'untrusted_context'
        for audio_id, value in self.turns.items():
            text = normalize(value['text']).strip()
            text = re.sub(r'^(?:(?:prosim(?: te)?|dagmar)[, ]+)+', '', text)
            quoted = bool(re.match(r'''(?i)^\s*(?:(?:prosím(?: tě)?|dagmar)[,\s]+)*[„“"'«]''', value['text']))
            if not text:
                continue
            if re.match(r'^(?:zrus|neukladej|nezapisuj|zapomen na (?:to|ten ukol)|to nechci)\b', text):
                active, reason = None, 'revoked'
            else:
                command = None if quoted else re.match(r'^(zapamatuj si|uloz|zapis|napis|pripis|pridej|vytvor|prejmenuj|presun|archivuj|vycisti|aktualizuj|uprav|zapomen|smaz|vymaz)\b', text)
                if command:
                    verb = command[1]
                    if verb in {'zapomen', 'smaz', 'vymaz'}:
                        operations = {'memory_forget', 'note_delete', 'note_clear', 'note_item_remove'}
                    elif verb == 'prejmenuj':
                        operations = {'note_rename'}
                    elif verb == 'archivuj':
                        operations = {'note_archive'}
                    elif verb == 'presun':
                        operations = {'note_item_move'}
                    elif verb == 'vycisti':
                        operations = {'note_clear'}
                    elif verb in {'aktualizuj', 'uprav'}:
                        operations = {'memory_update', 'note_text_update', 'note_item_update'}
                    elif verb in {'pripis', 'pridej'}:
                        operations = {'note_item_add', 'note_create'}
                    elif verb == 'zapamatuj si':
                        operations = {'memory_remember'}
                    else:
                        operations = {'note_create', 'note_text_update'} if re.search(r'\b(?:poznamk\w*|liste\w*|listk\w*)\b', text) else {'memory_remember', 'note_create'}
                    active = {'id': value['intent_id'], 'audio_ids': [audio_id], 'operations': operations,
                              'started': value['received'], 'characters': len(value['text']), 'paused': False}
                    reason = None
                elif active and re.match(r'^(?:(?:prvni|druhy|treti|ctvrty|paty|dalsi)\b|(?:a )?jeste\b|(?:zkus|pokus) to znovu\b|pockej\b|moment\b)', text):
                    active['audio_ids'].append(audio_id)
                    active['characters'] += len(value['text'])
                    active['paused'] = bool(re.match(r'^(pockej|moment)\b', text))
                else:
                    active, reason = None, 'scope_mismatch'
            if audio_id == current:
                break
        if active and (self.clock() - active['started'] > 300 or len(active['audio_ids']) > 8 or active['characters'] > 8000):
            return None, 'expired'
        if not active:
            return None, reason
        if active['paused']:
            return None, 'scope_mismatch'
        if operation and operation not in active['operations']:
            return None, 'scope_mismatch'
        bound = self.bindings.get(active['id'])
        if bound and operation and bound[:2] != (operation, target):
            return None, 'scope_mismatch'
        return active, None

    def bind(self, grant, operation, target, digest):
        value = (operation, target, digest)
        previous = self.bindings.get(grant['id'])
        if previous and previous != value:
            return False
        self.bindings[grant['id']] = value
        return True

    def consume(self, grant):
        self.consumed.add(grant['id'])
        # Keep only identities still represented by the bounded audio history.
        retained = {v['intent_id'] for v in self.turns.values()}
        self.consumed.intersection_update(retained)
        self.bindings = {k: v for k, v in self.bindings.items() if k in retained}

    def clean_completed(self, iid):
        value = self.turns.get(iid)
        return value and value['text'] and not value['mail']

    def complete(self, generation):
        for value in self.turns.values():
            if value['generation'] == generation:
                value['completed'] = True

    def ready(self):
        return [(iid, value) for iid, value in self.turns.items() if value['completed'] and value['text']]
