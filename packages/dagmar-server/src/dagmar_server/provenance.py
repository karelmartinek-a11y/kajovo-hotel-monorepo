"""Bounded genuine human audio turns; tool content cannot manufacture intent."""
from collections import OrderedDict
import re
from .memory import normalize

class HumanTurns:
    def __init__(self):
        self.turns = OrderedDict()
        self.current = None
        self.speech = False
        self.generation = 0
        self.mail_context = False

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
                self.turns.setdefault(iid, {'text': '', 'mail': False, 'generation': self.generation, 'completed': False})
                self.speech = False
                while len(self.turns) > 16:
                    self.turns.popitem(last=False)
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
        value = self.turns.get(iid or self.current)
        if not value or not value['text']:
            return False
        text = normalize(value['text'])
        # A current human imperative, not a quoted mail/tool instruction or arbitrary embedded phrase.
        return bool(re.match(r'^(?:prosim )?(?:dagmar )?(?:zapamatuj si|uloz|zapis|pripis|pridej|vytvor|prejmenuj|presun|archivuj|vycisti|aktualizuj|uprav|zapomen|smaz|vymaz)\b', text))

    def clean_completed(self, iid):
        value = self.turns.get(iid)
        return value and value['text'] and not value['mail']

    def complete(self, generation):
        for value in self.turns.values():
            if value['generation'] == generation:
                value['completed'] = True

    def ready(self):
        return [(iid, value) for iid, value in self.turns.items() if value['completed'] and value['text']]
