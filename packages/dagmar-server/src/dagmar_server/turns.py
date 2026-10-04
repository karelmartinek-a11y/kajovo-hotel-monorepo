"""Response intent reservations; native VAD wins without duplicate cancel/clear."""


class TurnCoordinator:
    def __init__(self):
        self.generation = 0
        self.active = None
        self.responses = {}
        self.seen = set()
        self.continuations = set()
        self.pending = None
        self.intents = {}
        self.automatic = False
        self.native_pending = False
        self.native_generation = None

    def event(self, event):
        eid = event.get("event_id")
        if eid and eid in self.seen:
            return False
        if eid:
            self.seen.add(eid)
            if len(self.seen) > 512:
                self.seen.pop()
        typ = event.get("type")
        response = event.get("response", {})
        rid = response.get("id") or event.get("response_id")
        if typ == "input_audio_buffer.speech_started":
            self.generation += 1
            self.active = None
            self.pending = None
            self.native_pending = self.automatic
            self.native_generation = None
        elif (
            typ in {"input_audio_buffer.speech_stopped", "input_audio_buffer.committed"}
            and self.automatic
        ):
            self.native_pending = self.native_generation != self.generation
        elif typ == "response.created" and rid:
            intent = (response.get("metadata") or {}).get("dagmar_intent")
            generation = self.intents.get(intent, self.generation)
            self.responses.setdefault(rid, generation)
            if generation == self.generation:
                self.active = rid
                self.native_pending = False
                if not intent:
                    self.native_generation = self.generation
            if self.pending and self.pending["id"] == intent:
                self.pending = None
            if len(self.responses) > 128:
                self.responses.pop(next(iter(self.responses)))
        elif typ == "response.done" and self.active == rid:
            self.active = None
        return True

    def current(self, generation):
        return generation == self.generation

    def reserve(self, generation, intent):
        if (
            not self.current(generation)
            or self.active
            or self.native_pending
            or self.pending
        ):
            return False
        self.pending = {"id": intent, "generation": generation}
        self.intents[intent] = generation
        if len(self.intents) > 256:
            self.intents.pop(next(iter(self.intents)))
        return True

    def writable(self, generation, intent):
        return (
            self.current(generation)
            and not self.active
            and not self.native_pending
            and self.pending == {"id": intent, "generation": generation}
        )

    def release(self, intent):
        if self.pending and self.pending["id"] == intent:
            self.pending = None

    def continuation(self, generation, key):
        if (
            not self.current(generation)
            or self.active
            or self.native_pending
            or self.pending
            or (generation, key) in self.continuations
        ):
            return False
        self.continuations.add((generation, key))
        if len(self.continuations) > 256:
            self.continuations.pop()
        return True
