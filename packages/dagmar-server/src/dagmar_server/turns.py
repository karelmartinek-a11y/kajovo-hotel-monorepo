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
        self.work = {}
        self.items = {}
        self.out_of_band = set()

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
        if typ == "response.created" and (response.get("metadata") or {}).get("dagmar_mail_import"):
            self.out_of_band.add(rid)
        if rid in self.out_of_band:
            return True
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
            obsolete = [key for key, value in self.work.items() if value["generation"] != self.generation and value["done"]]
            for key in obsolete:
                state = self.work.pop(key)
                for iid in state["items"]:
                    self.items.pop(iid, None)
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
        if rid:
            state = self.work.setdefault(rid, {"done": False, "items": set(), "generation": self.responses.get(rid, self.generation)})
            if typ == "response.done":
                state["done"] = True
                for item in response.get("output", []):
                    self.observe_item(item, rid, output=True)
            if isinstance(event.get("item"), dict):
                self.observe_item(event["item"], rid, output=typ.endswith(".done"))
        elif isinstance(event.get("item"), dict):
            self.observe_item(event["item"], None, output=typ.endswith(".done"))
        iid = event.get("item_id")
        if typ in {"response.mcp_call.completed", "response.mcp_call.failed"} and iid:
            item = self.items.setdefault(iid, self.new_item("mcp_call"))
            item["transport"] = True
            item["failed"] = typ.endswith(".failed")
        return True

    @staticmethod
    def new_item(kind):
        return {"kind": kind, "response_id": None, "output": False, "transport": False, "failed": False, "approval": False}

    def observe_item(self, item, rid, *, output=False):
        kind = item.get("type")
        if kind not in {"function_call", "mcp_call", "mcp_approval_request"}:
            return
        iid = item.get("id") or item.get("call_id")
        if not iid:
            return
        state = self.items.setdefault(iid, self.new_item(kind))
        state["kind"] = kind
        if rid:
            state["response_id"] = rid
            self.work[rid]["items"].add(iid)
        if kind == "mcp_approval_request":
            state["approval"] = not state["transport"]
        elif kind == "mcp_call" and output and (item.get("output") is not None or item.get("error") is not None):
            state["output"] = True
        if item.get("call_id"):
            state["call_id"] = item["call_id"]

    def function_finished(self, call_id):
        for item in self.items.values():
            if item.get("call_id") == call_id:
                item["output"] = item["transport"] = True

    def approval_finished(self, item_id):
        item = self.items.get(item_id)
        if item:
            item["approval"] = False
            item["output"] = item["transport"] = True

    def ready_responses(self):
        ready = []
        for rid, response in self.work.items():
            items = [self.items[iid] for iid in response["items"]]
            if (response["done"] and items and self.current(response["generation"])
                    and all(not item["approval"] and item["transport"] and item["output"] for item in items)
                    and (response["generation"], "response:" + rid) not in self.continuations):
                ready.append((rid, response["generation"]))
        return ready

    def claim_response(self, rid, generation):
        return (rid, generation) in self.ready_responses() and self.continuation(generation, "response:" + rid)

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
