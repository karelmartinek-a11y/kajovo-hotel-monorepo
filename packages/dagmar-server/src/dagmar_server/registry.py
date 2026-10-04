"""Hotel-owned exact-plan readback and audio confirmation. Never persist content."""
import hashlib
import re
import unicodedata
from datetime import datetime


from .models import VoiceRegistryPlan
from .ports import _as_utc
from .smart import SmartError
from .ports import utc_now


from .registry_contract import PublicPlan, RegistryView


def normalize(text):
    value = unicodedata.normalize("NFKD", text.casefold())
    return " ".join(re.findall(r"[^\W_]+", "".join(c for c in value if not unicodedata.combining(c))))


# Fixed templates cover every manually selectable Voice Core language.
TEMPLATES = {
    "cs": ("Návrh změn.", "Vytvořit místnost {new}.", "Přejmenovat místnost {old} na {new}.", "Smazat místnost {old}. Její zařízení budou bez přiřazené místnosti.", "Přesunout zařízení {old} do místnosti {location}.", "Odebrat zařízení {old} z místnosti.", "Přejmenovat zařízení {old} na {new}.", "Beze změny", "Odmítnuto", "Potvrzujete tento přesný návrh? Odpovězte ano nebo ne.", "{old} v řádku {row}, původní místnost {location}", "bez přiřazené místnosti"),
    "en": ("Proposed changes.", "Create room {new}.", "Rename room {old} to {new}.", "Delete room {old}. Its devices will have no assigned room.", "Move device {old} to room {location}.", "Unassign device {old} from its room.", "Rename device {old} to {new}.", "Unchanged", "Rejected", "Do you confirm this exact proposal? Answer yes or no.", "{old} at row {row}, original room {location}", "no assigned room"),
    "de": ("Vorgeschlagene Änderungen.", "Raum {new} erstellen.", "Raum {old} in {new} umbenennen.", "Raum {old} löschen. Seine Geräte haben danach keinen zugewiesenen Raum.", "Gerät {old} in Raum {location} verschieben.", "Gerät {old} aus seinem Raum entfernen.", "Gerät {old} in {new} umbenennen.", "Unverändert", "Abgelehnt", "Bestätigen Sie genau diesen Vorschlag? Antworten Sie ja oder nein.", "{old} in Zeile {row}, ursprünglicher Raum {location}", "kein zugewiesener Raum"),
    "sk": ("Návrh zmien.", "Vytvoriť miestnosť {new}.", "Premenovať miestnosť {old} na {new}.", "Zmazať miestnosť {old}. Jej zariadenia budú bez priradenej miestnosti.", "Presunúť zariadenie {old} do miestnosti {location}.", "Odobrať zariadenie {old} z miestnosti.", "Premenovať zariadenie {old} na {new}.", "Bez zmeny", "Odmietnuté", "Potvrdzujete tento presný návrh? Odpovedzte áno alebo nie.", "{old} v riadku {row}, pôvodná miestnosť {location}", "bez priradenej miestnosti"),
}
ACTIONS = {a: i + 1 for i, a in enumerate(("create_room", "rename_room", "delete_room", "assign_devices", "remove_devices", "rename_devices"))}
YES = {normalize(v) for v in ("ano", "ano potvrzuji", "potvrzuji", "áno", "potvrdzujem", "yes", "yes I confirm", "I confirm", "ja", "ich bestätige", "так", "підтверджую")}
NO = {normalize(v) for v in ("ne", "nepotvrzuji", "nie", "no", "nein", "ні")}


def script(plan, language):
    t = TEMPLATES[language]
    sentences = [t[0]]
    for index, change in enumerate(plan.changes, 1):
        if change.status != "planned":
            # A rejected target can have no presentation; never invent its name.
            labels = {"cs": "Položka {index}: {status}. Tento požadavek se neprovede.",
                      "sk": "Položka {index}: {status}. Táto požiadavka sa nevykoná.",
                      "en": "Item {index}: {status}. This request will not be performed.",
                      "de": "Eintrag {index}: {status}. Dieser Auftrag wird nicht ausgeführt."}
            sentences.append(labels[language].format(index=index, status=t[7] if change.status == "unchanged" else t[8]))
            continue
        if change.action not in ACTIONS:
            raise SmartError("invalid_registry_plan")
        old, new, location = change.old_name or change.name, change.new_name, change.new_location
        if change.action == "create_room" and not new or change.action != "create_room" and not old:
            raise SmartError("invalid_registry_plan")
        if change.action in {"rename_room", "rename_devices"} and not new:
            raise SmartError("invalid_registry_plan")
        if change.action == "assign_devices" and not location:
            raise SmartError("invalid_registry_plan")
        if change.action in {"assign_devices", "remove_devices", "rename_devices"}:
            if not change.row:
                raise SmartError("invalid_registry_plan")
            old = t[10].format(old=old, row=change.row, location=change.old_location or t[11])
        sentence = t[ACTIONS[change.action]].format(old=old or "", new=new or "", location=location or "")
        if change.action == "delete_room":
            consequence = {
                "cs": "Zruší se přiřazení všech členů. Počet dotčených schválených zařízení: {count}.",
                "sk": "Zruší sa priradenie všetkých členov. Počet dotknutých schválených zariadení: {count}.",
                "en": "All members will be unassigned. Affected approved devices: {count}.",
                "de": "Alle Mitglieder werden vom Raum getrennt. Betroffene genehmigte Geräte: {count}.",
            }
            sentence += " " + consequence[language].format(count=change.detached_devices or 0)
        sentences.append(sentence)
    sentences.append(t[9])
    result = " ".join(sentences)
    # The proposal must be fully audible before its five-minute expiry, with time to answer.
    if len(result) > 4500:
        raise SmartError("plan_too_large_split")
    return result


class RegistryConfirmation:
    def __init__(self, owner, voice_id, factory):
        self.owner, self.voice_id, self.factory = owner, voice_id, factory
        self.plan = None
        self.state = "idle"
        self.attempts = 0
        self.language = "cs"
        self.text = None
        self.response_id = None
        self.completed = False
        self.sequence = 0
        self.armed_at = 0
        self.input_starts = {}
        self.seen_inputs = set()
        self.readback_pending = False
        self.next_audio_id = None
        self.expiry_pending = False
        self.results = []

    @property
    def identity(self):
        return hashlib.sha256(f"{self.owner}:{self.voice_id}:{self.plan.id}".encode()).hexdigest()

    def persist(self, **fields):
        if not self.plan:
            return
        with self.factory() as db:
            row = db.get(VoiceRegistryPlan, self.identity)
            if row:
                if row.request_id and self.state in {"invalidated", "expired", "refused", "ambiguous", "failed"}:
                    return
                row.state = self.state
                for key, value in fields.items():
                    setattr(row, key, value)
                db.commit()

    def valid(self):
        if self.state in {"expired", "invalidated", "refused", "ambiguous", "failed", "applied", "applying", "uncertain", "partially_applied", "rejected", "unchanged"}:
            return False
        if self.plan and datetime.fromisoformat(self.plan.expires_at.replace("Z", "+00:00")) <= utc_now():
            self.invalidate("expired")
            return False
        return bool(self.plan) and self.state not in {"expired", "invalidated", "refused", "ambiguous", "failed", "applied", "applying", "uncertain", "partially_applied", "rejected", "unchanged"}

    def invalidate(self, state="invalidated"):
        self.state = state
        self.expiry_pending = state == "expired"
        self.readback_pending = False
        self.completed = False
        self.persist(confirmation_id=None, input_event_id=None)

    def view(self):
        self.valid()
        return RegistryView(plan=self.plan, state=self.state, attempts=self.attempts, results=self.results)

    def prepare(self, value, language):
        self.invalidate()
        plan = PublicPlan.model_validate(value)
        # The host owns confirmation policy; a tool result cannot relax destructive/bulk consent.
        if any(c.action == "delete_room" and c.status == "planned" for c in plan.changes) or sum(c.action in {"rename_room", "rename_devices"} and c.status == "planned" for c in plan.changes) > 1:
            plan.requires_confirmation = True
        expires = datetime.fromisoformat(plan.expires_at.replace("Z", "+00:00"))
        if not expires.tzinfo or expires <= utc_now() or (expires - utc_now()).total_seconds() > 310:
            raise SmartError("invalid_registry_plan")
        text = script(plan, language) if plan.requires_confirmation else None
        self.results = []
        self.plan, self.language = plan, language
        self.state = "prepared"
        self.expiry_pending = False
        self.attempts, self.response_id, self.completed = 0, None, False
        self.next_audio_id = None
        self.text = text
        with self.factory() as db:
            if db.get(VoiceRegistryPlan, self.identity):
                self.state = "invalidated"
                raise SmartError("plan_already_seen_prepare_again")
            db.add(VoiceRegistryPlan(id=self.identity, owner_session_id=self.owner, voice_session_id=self.voice_id,
                plan_id=plan.id, digest=hashlib.sha256(plan.model_dump_json().encode()).hexdigest(), expires_at=expires,
                requires_confirmation=plan.requires_confirmation, state=self.state))
            db.commit()
        self.readback_pending = plan.requires_confirmation

    def begin_readback(self, response_id):
        self.attempts += 1
        self.state = "reading"
        self.response_id, self.completed = response_id, False
        self.readback_pending = False
        self.persist(response_id=response_id)

    def event(self, event):
        """Only the host's provider sideband reader calls this, never model/tool arguments."""
        self.sequence += 1
        typ = event.get("type")
        if typ == "response.created" and self.readback_pending and event.get("response", {}).get("metadata", {}).get("kvha_readback") == self.identity:
            self.begin_readback(event["response"]["id"])
        if typ == "input_audio_buffer.speech_started":
            iid = event.get("item_id")
            if iid:
                if len(self.input_starts) >= 256:
                    self.input_starts.clear()
                self.input_starts[iid] = self.sequence
            if self.state == "awaiting_confirmation":
                if self.next_audio_id and iid != self.next_audio_id:
                    self.invalidate()
                else:
                    self.next_audio_id = iid
            if self.state in {"reading", "confirmed"}:
                self.invalidate()
        if typ in {"conversation.item.input_audio_transcription.completed", "conversation.item.input_audio_transcription.failed"} and self.state in {"invalidated", "expired", "failed"} and event.get("item_id") in self.input_starts:
            self.input_starts.pop(event["item_id"], None)
            return "generate"
        if not self.plan or not self.valid() or not self.plan.requires_confirmation:
            return None
        if typ == "conversation.item.input_audio_transcription.failed" and self.state == "awaiting_confirmation" and event.get("item_id") == self.next_audio_id and self.input_starts.get(event.get("item_id"), 0) > self.armed_at:
            self.invalidate("ambiguous")
            return "generate"
        if typ == "response.done" and event.get("response", {}).get("id") == self.response_id:
            response = event["response"]
            transcript = " ".join(part.get("transcript", "") for item in response.get("output", []) for part in item.get("content", []) if part.get("type") in {"audio", "output_audio"})
            self.completed = response.get("status") == "completed" and normalize(transcript) == normalize(self.text)
            if not self.completed:
                if self.attempts >= 3:
                    self.invalidate("failed")
                    return "generate"
                else:
                    self.readback_pending = True
                    return "readback"
        if typ == "output_audio_buffer.cleared" and event.get("response_id") == self.response_id:
            self.invalidate()
        if typ == "output_audio_buffer.stopped" and event.get("response_id") == self.response_id and self.completed and self.state == "reading":
            self.state, self.armed_at = "awaiting_confirmation", self.sequence
            self.persist()
        if typ == "conversation.item.input_audio_transcription.completed" and self.state == "awaiting_confirmation":
            iid = event.get("item_id")
            started = self.input_starts.pop(iid, 0)
            if not iid or iid != self.next_audio_id or started <= self.armed_at or iid in self.seen_inputs or not event.get("event_id") or len(event["event_id"] + ":" + iid) > 256:
                return None
            self.seen_inputs.add(iid)
            if len(self.seen_inputs) > 256:
                self.invalidate("failed")
                return "generate"
            answer = normalize(event.get("transcript", ""))
            if answer in YES:
                identity = event["event_id"] + ":" + iid
                confirmation = "confirmed-" + hashlib.sha256(f"{self.voice_id}:{identity}:{self.plan.id}".encode()).hexdigest()
                self.state = "confirmed"
                self.persist(input_event_id=identity, confirmation_id=confirmation)
            else:
                self.invalidate("refused" if answer in NO else "ambiguous")
            return "generate"
        return None

    def check_apply(self, plan_id):
        if not self.valid() or self.plan.id != plan_id:
            raise SmartError("plan_expired_or_invalidated_prepare_again")
        if self.plan.requires_confirmation and self.state != "confirmed":
            raise SmartError("confirmation_required")

    def reserve(self, db, rid):
        self.check_apply(self.plan.id)
        row = db.get(VoiceRegistryPlan, self.identity)
        if not row or row.state != self.state or row.request_id or row.digest != hashlib.sha256(self.plan.model_dump_json().encode()).hexdigest() or (_as_utc(row.expires_at) or utc_now()) <= utc_now():
            raise SmartError("plan_expired_or_invalidated_prepare_again")
        if row.requires_confirmation and not row.confirmation_id:
            raise SmartError("confirmation_required")
        # Conditional UPDATE is the cross-worker single-use gate, in the operation reservation transaction.
        from sqlalchemy import update
        changed = db.execute(update(VoiceRegistryPlan).where(VoiceRegistryPlan.id == row.id,
            VoiceRegistryPlan.state == self.state, VoiceRegistryPlan.request_id.is_(None)).values(state="applying", request_id=rid)).rowcount
        if changed != 1:
            raise SmartError("plan_already_applied")
        return {"confirmed": True, "confirmation_id": row.confirmation_id} if row.requires_confirmation else {}


def registry_outcome(value):
    """Transport certainty and actual per-item changes are independent."""
    statuses = {r.get("status") for r in value.get("results", [])}
    statuses.update(k for k, n in value.get("summary", {}).items() if n)
    if statuses & {"uncertain", "not_found"} or not statuses:
        return "uncertain"
    if statuses & {"queued", "recording", "pending"}:
        return "applying"
    changed = bool(statuses & {"created", "updated", "deleted"})
    rejected = bool(statuses - {"created", "updated", "deleted", "unchanged"})
    if changed:
        return "partially_applied" if rejected else "applied"
    return "rejected" if rejected else "unchanged"


def input_language(text, previous):
    # Whole command words take precedence over an incidental English room name.
    words = set(normalize(text).split())
    for language, terms in (
        ("cs", {"prestehuj", "umisteni", "mistnostem", "mistnost", "mistnosti", "prejmenuj", "vytvor", "smaz", "zarizeni"}),
        ("sk", {"miestnost", "miestnosti", "umiestnenie", "umiestnenia", "umiestneni", "zariadenia", "premiestni", "premenuj", "zmaz", "zariadenie"}),
        ("de", {"raum", "raume", "umbenennen", "loschen"}),
        ("en", {"rename", "create", "delete", "move", "room"}),
    ):
        if words & terms:
            return language
    return previous
