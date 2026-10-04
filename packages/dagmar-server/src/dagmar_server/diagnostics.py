"""Isolated bounded diagnostic storage. SQLite metadata, encrypted object files.

All writers take an inter-process lock. Reservations cover peak DB journal/growth
and object ciphertext before IO, not just rows committed afterwards. SQLite uses
DELETE journal (no WAL); its worst-case full journal is reserved on each write.
"""
from contextlib import contextmanager
from pathlib import Path
import base64
import hashlib
import json
import os
import sqlite3
import fcntl

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .diagnostic_contract import LIMITS, MAX_CHUNK, Event, metadata, redact, utc, uid


class DiagnosticError(Exception):
    def __init__(self, code, status=409):
        self.code, self.status = code, status
        super().__init__(code)


class Diagnostics:
    def __init__(self, root: str | Path, key: str, *, limits=None, release="unknown"):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.objects = self.root / "objects"
        self.objects.mkdir(exist_ok=True, mode=0o700)
        self.dbfile = self.root / "index.sqlite3"
        self.limits = dict(limits or LIMITS)
        self.release = release
        try:
            decoded = base64.b64decode(key, validate=True)
            self.cipher = AESGCM(decoded) if len(decoded) == 32 else None
        except (ValueError, TypeError):
            self.cipher = None
        with self.lock(), self.db() as db:
            db.executescript('''
            PRAGMA auto_vacuum=INCREMENTAL;
            PRAGMA user_version=1;
            CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY, owner TEXT NOT NULL, created TEXT NOT NULL, closed TEXT, deleted INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, release TEXT NOT NULL, model TEXT, config_revision INTEGER, incomplete INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY, call_id TEXT NOT NULL REFERENCES calls(id), epoch INTEGER NOT NULL, model TEXT NOT NULL, UNIQUE(call_id,epoch));
            CREATE TABLE IF NOT EXISTS segments(id TEXT PRIMARY KEY, call_id TEXT NOT NULL REFERENCES calls(id), generation INTEGER NOT NULL, started TEXT NOT NULL, stopped TEXT, capture_start REAL NOT NULL, capture_end REAL, state TEXT NOT NULL, complete INTEGER NOT NULL DEFAULT 0, UNIQUE(call_id,generation));
            CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, call_id TEXT NOT NULL REFERENCES calls(id), category TEXT NOT NULL, kind TEXT NOT NULL, segment_id TEXT, connection_id TEXT, sequence INTEGER, source TEXT, captured REAL, received TEXT NOT NULL, object_id TEXT NOT NULL, bytes INTEGER NOT NULL, checksum TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS records_call ON records(call_id,received);
            CREATE TABLE IF NOT EXISTS usage(response_id TEXT PRIMARY KEY,call_id TEXT NOT NULL, record_id TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS access(id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, call_id TEXT, at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY, category TEXT NOT NULL, bytes INTEGER NOT NULL);
            ''')
            os.chmod(self.dbfile, 0o600)
        self.reconcile()

    @contextmanager
    def lock(self):
        with (self.root / ".lock").open("a+b") as handle:
            os.chmod(handle.name, 0o600)
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.dbfile, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA synchronous=FULL")
        db.execute("PRAGMA journal_mode=DELETE")
        db.execute("PRAGMA temp_store=MEMORY")
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def physical(self, db):
        usage = dict.fromkeys(self.limits, 0)
        for row in db.execute("SELECT category,object_id FROM records"):
            path = self.objects / row["object_id"]
            if path.exists():
                usage[row["category"]] += self.size(path)
        # All shared index, journal, lock and directory overhead is deterministically technical.
        for path in self.root.iterdir():
            if path != self.objects:
                usage["technical"] += self.size(path)
        usage["technical"] += self.size(self.root) + self.size(self.objects)
        # Always fund the next full rollback journal, including emergency eviction.
        # Actual journal allocation replaces this reservation rather than adding to it.
        journal = self.root / "index.sqlite3-journal"
        journal_bytes = self.size(journal) if journal.exists() else 0
        usage["technical"] += max(0, self.size(self.dbfile) + 262_144 - journal_bytes)
        known = {r[0] for r in db.execute("SELECT object_id FROM records")}
        for path in self.objects.iterdir():
            if path.name not in known:
                usage["technical"] += self.size(path)
        return usage

    @staticmethod
    def size(path):
        value = path.stat()
        return max(value.st_size, getattr(value, "st_blocks", 0) * 512)

    def owned(self, db, call_id, owner, *, open_required=False):
        row = db.execute("SELECT * FROM calls WHERE id=? AND owner=? AND deleted=0", (call_id, owner)).fetchone()
        if not row:
            raise DiagnosticError("call_not_found", 404)
        if open_required and row["closed"]:
            raise DiagnosticError("call_closed")
        return row

    def _delete(self, db, call_id):
        objects = [r[0] for r in db.execute("SELECT object_id FROM records WHERE call_id=?", (call_id,))]
        db.execute("UPDATE calls SET deleted=1,generation=generation+1,revision=revision+1 WHERE id=?", (call_id,))
        db.execute("DELETE FROM usage WHERE call_id=?", (call_id,))
        db.execute("DELETE FROM records WHERE call_id=?", (call_id,))
        db.execute("DELETE FROM segments WHERE call_id=?", (call_id,))
        db.execute("DELETE FROM connections WHERE call_id=?", (call_id,))
        # DB commits first. Orphans are removed on the next lock/start after a crash.
        db.commit()
        for name in objects:
            (self.objects / name).unlink(missing_ok=True)

    def reserve(self, db, additions, *, protected_call=None):
        # Worst-case existing rollback journal plus bounded index-page splits/growth.
        # Existing journal is already funded by physical(); reserve index growth
        # twice, for the DB pages and their future rollback-journal copy.
        wanted = dict(additions)
        wanted["technical"] = wanted.get("technical", 0) + 524_288
        for category, amount in wanted.items():
            usage = self.physical(db)
            pending = db.execute("SELECT coalesce(sum(bytes),0) FROM reservations WHERE category=?", (category,)).fetchone()[0]
            if usage[category] + pending + amount > self.limits[category]:
                target = self.limits[category] * 9 // 10
                victims = list(db.execute("SELECT DISTINCT c.id FROM calls c JOIN records r ON r.call_id=c.id WHERE c.closed IS NOT NULL AND c.pinned=0 AND c.deleted=0 AND r.category=? AND c.id != ? ORDER BY c.created,c.id", (category, protected_call or "")))
                for victim in victims:
                    self._delete(db, victim[0])
                    usage = self.physical(db)
                    if usage[category] <= target and usage[category] + pending + amount <= self.limits[category]:
                        break
                if usage[category] + pending + amount > self.limits[category]:
                    raise DiagnosticError("capacity_" + category, 507)
        rid = uid()
        for category, amount in wanted.items():
            db.execute("INSERT INTO reservations VALUES(?,?,?)", (rid + category, category, amount))
        db.commit()
        return rid

    def release_reservation(self, db, rid):
        for category in self.limits:
            db.execute("DELETE FROM reservations WHERE id=?", (rid + category,))

    def reconcile(self):
        with self.lock(), self.db() as db:
            # Writers are serialized; reservations left without a writer are crashed operations.
            db.execute("DELETE FROM reservations")
            known = {r[0] for r in db.execute("SELECT object_id FROM records")}
            for path in self.objects.iterdir():
                if path.name not in known:
                    path.unlink()
            missing = list(db.execute("SELECT id,call_id FROM records"))
            for row in missing:
                record = db.execute("SELECT object_id FROM records WHERE id=?", (row["id"],)).fetchone()
                if not (self.objects / record[0]).exists():
                    db.execute("UPDATE calls SET incomplete=1 WHERE id=?", (row["call_id"],))
            db.execute("PRAGMA incremental_vacuum(128)")

    def create_call(self, owner):
        with self.lock(), self.db() as db:
            rid = self.reserve(db, {})
            call_id = uid()
            db.execute("INSERT INTO calls(id,owner,created,release) VALUES(?,?,?,?)", (call_id, owner, utc(), self.release))
            self.release_reservation(db, rid)
            return {"logical_call_id": call_id, "schema_version": 1}

    def connection(self, call_id, owner, connection_id, model, revision):
        with self.lock(), self.db() as db:
            self.owned(db, call_id, owner, open_required=True)
            rid = self.reserve(db, {})
            epoch = db.execute("SELECT count(*) FROM connections WHERE call_id=?", (call_id,)).fetchone()[0] + 1
            db.execute("INSERT INTO connections VALUES(?,?,?,?)", (connection_id, call_id, epoch, model))
            db.execute("UPDATE calls SET model=?,config_revision=? WHERE id=?", (model, revision, call_id))
            self.release_reservation(db, rid)
            return epoch

    def start(self, call_id, owner, capture_ms):
        if not self.cipher:
            raise DiagnosticError("diagnostic_key_unavailable", 503)
        with self.lock(), self.db() as db:
            call = self.owned(db, call_id, owner, open_required=True)
            if db.execute("SELECT 1 FROM segments WHERE call_id=? AND state IN ('recording','stopping')", (call_id,)).fetchone():
                raise DiagnosticError("segment_active")
            rid = self.reserve(db, {})
            generation = call["generation"] + 1
            segment_id = uid()
            db.execute("UPDATE calls SET generation=? WHERE id=?", (generation, call_id))
            db.execute("INSERT INTO segments(id,call_id,generation,started,capture_start,state) VALUES(?,?,?,?,?,'recording')", (segment_id, call_id, generation, utc(), capture_ms))
            self.release_reservation(db, rid)
            return {"segment_id": segment_id, "generation": generation}

    def stop(self, call_id, owner, segment_id, capture_ms, complete=False):
        with self.lock(), self.db() as db:
            self.owned(db, call_id, owner)
            segment = db.execute("SELECT * FROM segments WHERE id=? AND call_id=?", (segment_id, call_id)).fetchone()
            if not segment:
                raise DiagnosticError("segment_not_found", 404)
            rid = self.reserve(db, {})
            # The first off boundary is immutable; a later finalization cannot widen it.
            db.execute("UPDATE segments SET stopped=coalesce(stopped,?),capture_end=coalesce(capture_end,?),state=?,complete=? WHERE id=?", (utc(), capture_ms, "off" if complete else "stopping", int(complete), segment_id))
            self.release_reservation(db, rid)
            return {"state": "off" if complete else "stopping"}

    def write(self, call_id, owner, record_id, category, kind, payload: bytes, *, segment_id=None, generation=None, capture_start=None, capture_end=None, connection_id=None, sequence=None, source=None):
        if len(payload) > MAX_CHUNK:
            raise DiagnosticError("chunk_too_large", 413)
        if category != "technical" and not self.cipher:
            raise DiagnosticError("diagnostic_key_unavailable", 503)
        digest = hashlib.sha256(payload).hexdigest()
        with self.lock(), self.db() as db:
            call = self.owned(db, call_id, owner)
            existing = db.execute("SELECT call_id,checksum FROM records WHERE id=?", (record_id,)).fetchone()
            if existing:
                if existing["call_id"] != call_id or existing["checksum"] != digest:
                    raise DiagnosticError("chunk_identity_conflict")
                return {"stored": True, "replayed": True}
            if call["closed"]:
                raise DiagnosticError("call_closed")
            if connection_id and not db.execute("SELECT 1 FROM connections WHERE id=? AND call_id=?", (connection_id, call_id)).fetchone():
                raise DiagnosticError("connection_not_found", 404)
            if category != "technical":
                segment = db.execute("SELECT * FROM segments WHERE id=? AND call_id=? AND generation=?", (segment_id, call_id, generation)).fetchone()
                if not segment or generation != call["generation"] or segment["state"] == "off":
                    raise DiagnosticError("generation_invalid")
                if capture_start is None or capture_end is None or capture_end < capture_start or capture_start < segment["capture_start"]:
                    raise DiagnosticError("capture_boundary_invalid")
                if segment["capture_end"] is not None and capture_end > segment["capture_end"]:
                    raise DiagnosticError("capture_boundary_invalid")
            stored_category = "incident" if call["pinned"] else category
            object_id = uid()
            # All content is authenticated encryption. Metadata may remain plaintext without the key.
            nonce = os.urandom(12)
            envelope = b"E" + nonce + self.cipher.encrypt(nonce, payload, (call_id + ":" + record_id).encode()) if self.cipher else b"M" + payload
            allocated = ((len(envelope) + 4095) // 4096) * 4096
            rid = self.reserve(db, {stored_category: allocated})
            path = self.objects / object_id
            try:
                with path.open("xb") as handle:
                    os.chmod(path, 0o600)
                    handle.write(envelope)
                    handle.flush()
                    os.fsync(handle.fileno())
                fd = os.open(self.objects, os.O_RDONLY)
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
                db.execute("INSERT INTO records VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", (record_id, call_id, stored_category, kind, segment_id, connection_id, sequence, source, capture_end, utc(), object_id, len(envelope), digest))
                self.release_reservation(db, rid)
                db.commit()
            except BaseException:
                path.unlink(missing_ok=True)
                self.release_reservation(db, rid)
                db.commit()
                raise
            return {"stored": True, "replayed": False, "checksum": digest}

    def read_record(self, call_id, row):
        value = (self.objects / row["object_id"]).read_bytes()
        if value[:1] == b"E":
            if not self.cipher:
                raise DiagnosticError("diagnostic_key_unavailable", 503)
            try:
                value = self.cipher.decrypt(value[1:13], value[13:], (call_id + ":" + row["id"]).encode())
            except Exception:
                raise DiagnosticError("diagnostic_integrity_failed", 503) from None
        else:
            value = value[1:]
        if hashlib.sha256(value).hexdigest() != row["checksum"]:
            raise DiagnosticError("diagnostic_integrity_failed", 503)
        return value

    def event(self, call_id, owner, event: Event):
        value = event.model_dump(mode="json", exclude={"content"})
        value["attributes"] = metadata(event.attributes)
        value["release"] = self.release
        value["logical_call_id"] = call_id
        result = self.write(call_id, owner, event.event_id, "technical", "event", json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode(), connection_id=event.connection_id, sequence=event.sequence, source=event.source)
        if event.content is not None:
            self.write(call_id, owner, event.event_id + "_content", "text", "content", json.dumps(redact(event.content), ensure_ascii=False).encode(), segment_id=event.segment_id, generation=event.generation, capture_start=event.attributes.get("capture_start_ms"), capture_end=event.attributes.get("capture_end_ms"), connection_id=event.connection_id)
        return result

    def close(self, call_id, owner):
        with self.lock(), self.db() as db:
            self.owned(db, call_id, owner)
            rid = self.reserve(db, {})
            db.execute("UPDATE calls SET closed=coalesce(closed,?),incomplete=CASE WHEN EXISTS(SELECT 1 FROM segments WHERE call_id=? AND complete=0) THEN 1 ELSE incomplete END WHERE id=?", (utc(), call_id, call_id))
            db.execute("UPDATE segments SET state='off',stopped=coalesce(stopped,?) WHERE call_id=?", (utc(), call_id))
            self.release_reservation(db, rid)
            return {"closed": True}

    def listing(self):
        with self.lock(), self.db() as db:
            return [dict(r) for r in db.execute("SELECT id,created,closed,pinned,release,model,config_revision,incomplete FROM calls WHERE deleted=0 ORDER BY created DESC LIMIT 100")]

    def manifest(self, call_id):
        with self.lock(), self.db() as db:
            call = db.execute("SELECT * FROM calls WHERE id=? AND deleted=0", (call_id,)).fetchone()
            if not call:
                raise DiagnosticError("call_not_found", 404)
            total = db.execute("SELECT count(*) FROM records WHERE call_id=?", (call_id,)).fetchone()[0]
            records = [dict(r) for r in db.execute("SELECT * FROM records WHERE call_id=? ORDER BY received,id LIMIT 1000", (call_id,))]
            events, gaps, seen, duplicates = [], [], {}, []
            for row in records:
                if row["kind"] == "event":
                    value = json.loads(self.read_record(call_id, row))
                    events.append(value)
                    source = (value["source"], value.get("connection_id"))
                    seq = value["sequence"]
                    if seq in seen.setdefault(source,set()):
                        duplicates.append({"source":source[0], "connection_id":source[1], "sequence":seq})
                    seen[source].add(seq)
            for source, values in seen.items():
                ordered = sorted(values)
                for left, right in zip(ordered, ordered[1:]):
                    if right > left + 1:
                        gaps.append({"source": source[0], "connection_id": source[1], "after": left, "before": right})
            return {"schema_version": 1, "object_count":total, "timeline_partial":total>1000, "object_manifest_pattern":"objects/<record_id>.manifest.json", "call": {k: call[k] for k in call.keys() if k != "owner"}, "connections": [dict(r) for r in db.execute("SELECT * FROM connections WHERE call_id=?", (call_id,))], "segments": [dict(r) for r in db.execute("SELECT * FROM segments WHERE call_id=?", (call_id,))], "objects": [{k: r[k] for k in r if k != "object_id"} for r in records], "events": events, "gaps": gaps, "duplicates":duplicates, "missing_final": not bool(call["closed"]), "usage": [json.loads(self.read_record(call_id, r)) for r in records if r["kind"] == "usage"]}

    def objects_for_export(self, call_id):
        with self.lock(), self.db() as db:
            watermark = db.execute("SELECT coalesce(max(rowid),0) FROM records WHERE call_id=?", (call_id,)).fetchone()[0]
        cursor = 0
        while True:
            with self.lock(), self.db() as db:
                if not db.execute("SELECT 1 FROM calls WHERE id=? AND deleted=0", (call_id,)).fetchone():
                    raise DiagnosticError("call_not_found", 404)
                row = db.execute("SELECT rowid AS position,* FROM records WHERE call_id=? AND rowid>? AND rowid<=? ORDER BY rowid LIMIT 1", (call_id,cursor,watermark)).fetchone()
                if row is None:
                    return
                payload = self.read_record(call_id, row)
                row = dict(row)
                cursor = row.pop("position")
            yield row, payload

    def audit(self, actor, action, call_id=None):
        with self.lock(), self.db() as db:
            rid = self.reserve(db, {})
            db.execute("INSERT INTO access VALUES(?,?,?,?,?)", (uid(), actor, action, call_id, utc()))
            self.release_reservation(db, rid)

    def delete(self, call_id, actor):
        self.audit(actor, "delete", call_id)
        with self.lock(), self.db() as db:
            if not db.execute("SELECT 1 FROM calls WHERE id=? AND deleted=0", (call_id,)).fetchone():
                raise DiagnosticError("call_not_found", 404)
            self._delete(db, call_id)
            db.execute("PRAGMA incremental_vacuum(128)")
        return {"deleted": True}

    def pin(self, call_id, actor):
        with self.lock(), self.db() as db:
            call = db.execute("SELECT * FROM calls WHERE id=? AND deleted=0", (call_id,)).fetchone()
            if not call or not call["closed"]:
                raise DiagnosticError("pin_requires_closed_call")
            if call["pinned"]:
                return {"pinned": True}
            size = sum(self.size(self.objects / r[0]) for r in db.execute("SELECT object_id FROM records WHERE call_id=?", (call_id,)))
            usage = self.physical(db)
            if usage["incident"] + size > self.limits["incident"]:
                raise DiagnosticError("incident_full_export_or_delete_required", 507)
            rid = self.reserve(db, {"incident": size}, protected_call=call_id)
            db.execute("UPDATE records SET category='incident' WHERE call_id=?", (call_id,))
            db.execute("UPDATE calls SET pinned=1 WHERE id=?", (call_id,))
            db.execute("INSERT INTO access VALUES(?,?,?,?,?)", (uid(), actor, "pin", call_id, utc()))
            self.release_reservation(db, rid)
        return {"pinned": True}

    def capacity(self):
        with self.lock(), self.db() as db:
            values = self.physical(db)
            return {k: {"used_bytes": values[k], "maximum_bytes": cap, "warning": values[k] >= cap * 8 // 10, "target_bytes": cap * 9 // 10} for k, cap in self.limits.items()}

    def record_usage(self, call_id, owner, response, model):
        from .usage import usage_record
        response_id = response.get("id")
        if not isinstance(response_id, str) or len(response_id) > 128:
            return
        # Identity is deterministic across browser/sideband observers.
        record_id = "usage_" + hashlib.sha256((call_id + ":" + response_id).encode()).hexdigest()
        result = self.write(call_id, owner, record_id, "technical", "usage", json.dumps(usage_record(response, model), separators=(",", ":")).encode())
        return result
