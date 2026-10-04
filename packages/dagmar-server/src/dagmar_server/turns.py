"""One coordinator per connection: generation fencing and provider response identity."""
class TurnCoordinator:
    def __init__(self):
        self.generation = 0
        self.active = None
        self.responses = {}
        self.seen = set()
        self.continuations = set()

    def event(self, event):
        eid = event.get('event_id')
        if eid and eid in self.seen:
            return False
        if eid:
            self.seen.add(eid)
            if len(self.seen) > 512:
                self.seen.pop()
        typ = event.get('type')
        response = event.get('response', {})
        rid = response.get('id') or event.get('response_id')
        if typ == 'input_audio_buffer.speech_started':
            self.generation += 1
            self.active = None
        elif typ == 'response.created' and rid:
            self.responses.setdefault(rid, self.generation)
            self.active = rid
            if len(self.responses) > 128:
                self.responses.pop(next(iter(self.responses)))
        elif typ == 'response.done' and self.active == rid:
            self.active = None
        return True

    def current(self, generation):
        return generation == self.generation

    def continuation(self, generation, key):
        if not self.current(generation) or self.active or (generation, key) in self.continuations:
            return False
        self.continuations.add((generation, key))
        if len(self.continuations) > 256:
            self.continuations.pop()
        return True
