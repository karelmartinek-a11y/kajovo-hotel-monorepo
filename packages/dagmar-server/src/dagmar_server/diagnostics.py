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
import time

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
        self.capture_views = {}
        self.reconciled_at = 0.0
        try:
            decoded = base64.b64decode(key, validate=True)
            self.cipher = AESGCM(decoded) if len(decoded) == 32 else None
        except (ValueError, TypeError):
            self.cipher = None
        with self.lock(), self.db() as db:
            db.executescript("""
            PRAGMA auto_vacuum=INCREMENTAL;
            PRAGMA user_version=2;
            CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY, owner TEXT NOT NULL, created TEXT NOT NULL, closed TEXT, deleted INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, release TEXT NOT NULL, model TEXT, config_revision INTEGER, incomplete INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY, call_id TEXT NOT NULL REFERENCES calls(id), epoch INTEGER NOT NULL, model TEXT NOT NULL, UNIQUE(call_id,epoch));
            CREATE TABLE IF NOT EXISTS segments(id TEXT PRIMARY KEY, call_id TEXT NOT NULL REFERENCES calls(id), generation INTEGER NOT NULL, started TEXT NOT NULL, stopped TEXT, capture_start REAL NOT NULL, capture_end REAL, state TEXT NOT NULL, complete INTEGER NOT NULL DEFAULT 0, UNIQUE(call_id,generation));
            CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, call_id TEXT NOT NULL REFERENCES calls(id), category TEXT NOT NULL, kind TEXT NOT NULL, segment_id TEXT, connection_id TEXT, sequence INTEGER, source TEXT, captured REAL, received TEXT NOT NULL, object_id TEXT NOT NULL, bytes INTEGER NOT NULL, checksum TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS records_call ON records(call_id,received);
            CREATE TABLE IF NOT EXISTS usage(response_id TEXT PRIMARY KEY,call_id TEXT NOT NULL, record_id TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS access(id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, call_id TEXT, at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY, category TEXT NOT NULL, bytes INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS allocation(object_id TEXT PRIMARY KEY, category TEXT NOT NULL, bytes INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS totals(category TEXT PRIMARY KEY, bytes INTEGER NOT NULL);
            """)
            columns = {r[1] for r in db.execute("PRAGMA table_info(calls)")}
            if "producer_final" not in columns:
                db.execute("ALTER TABLE calls ADD COLUMN producer_final TEXT")
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
        # Four ledger rows plus a fixed number of stat calls, independent of history.
        usage = dict.fromkeys(self.limits, 0)
        usage.update(
            {r[0]: r[1] for r in db.execute("SELECT category,bytes FROM totals")}
        )
        for path in (self.dbfile, self.root / ".lock", self.root, self.objects):
            if path.exists():
                usage["technical"] += self.size(path)
        journal = self.root / "index.sqlite3-journal"
        # Fund actual journal allocation and the next rollback, not an uncounted copy.
        usage["technical"] += max(
            self.size(journal) if journal.exists() else 0,
            self.size(self.dbfile) + 262_144,
        )
        return usage

    def allocation_change(self, db, category, amount):
        db.execute(
            "INSERT INTO totals VALUES(?,?) ON CONFLICT(category) DO UPDATE SET bytes=max(0,bytes+excluded.bytes)",
            (category, amount),
        )

    @staticmethod
    def size(path):
        value = path.stat()
        return max(value.st_size, getattr(value, "st_blocks", 0) * 512)

    def owned(self, db, call_id, owner, *, open_required=False):
        row = db.execute(
            "SELECT * FROM calls WHERE id=? AND owner=? AND deleted=0", (call_id, owner)
        ).fetchone()
        if not row:
            raise DiagnosticError("call_not_found", 404)
        if open_required and row["closed"]:
            raise DiagnosticError("call_closed")
        return row

    def _delete(self, db, call_id):
        objects = [
            r[0]
            for r in db.execute(
                "SELECT DISTINCT object_id FROM records WHERE call_id=?", (call_id,)
            )
        ]
        for name in objects:
            allocated = db.execute(
                "SELECT category,bytes FROM allocation WHERE object_id=?", (name,)
            ).fetchone()
            if allocated:
                self.allocation_change(db, allocated[0], -allocated[1])
                db.execute("DELETE FROM allocation WHERE object_id=?", (name,))
        db.execute(
            "UPDATE calls SET deleted=1,generation=generation+1,revision=revision+1 WHERE id=?",
            (call_id,),
        )
        db.execute("DELETE FROM usage WHERE call_id=?", (call_id,))
        db.execute("DELETE FROM records WHERE call_id=?", (call_id,))
        db.execute("DELETE FROM segments WHERE call_id=?", (call_id,))
        db.execute("DELETE FROM connections WHERE call_id=?", (call_id,))
        self.capture_views.pop(call_id, None)
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
            pending = db.execute(
                "SELECT coalesce(sum(bytes),0) FROM reservations WHERE category=?",
                (category,),
            ).fetchone()[0]
            if usage[category] + pending + amount > self.limits[category]:
                target = self.limits[category] * 9 // 10
                victims = list(
                    db.execute(
                        "SELECT DISTINCT c.id FROM calls c JOIN records r ON r.call_id=c.id WHERE c.closed IS NOT NULL AND c.pinned=0 AND c.deleted=0 AND r.category=? AND c.id != ? ORDER BY c.created,c.id",
                        (category, protected_call or ""),
                    )
                )
                for victim in victims:
                    self._delete(db, victim[0])
                    usage = self.physical(db)
                    if (
                        usage[category] <= target
                        and usage[category] + pending + amount <= self.limits[category]
                    ):
                        break
                if usage[category] + pending + amount > self.limits[category]:
                    raise DiagnosticError("capacity_" + category, 507)
        rid = uid()
        for category, amount in wanted.items():
            db.execute(
                "INSERT INTO reservations VALUES(?,?,?)",
                (rid + category, category, amount),
            )
        db.commit()
        return rid

    def release_reservation(self, db, rid):
        for category in self.limits:
            db.execute("DELETE FROM reservations WHERE id=?", (rid + category,))

    def reconcile(self):
        # Startup/crash and periodic maintenance only; never on each event/reservation.
        with self.lock(), self.db() as db:
            db.execute("DELETE FROM reservations")
            known = {
                r[0]: r[1]
                for r in db.execute("SELECT DISTINCT object_id,category FROM records")
            }
            db.execute("DELETE FROM allocation")
            db.execute("DELETE FROM totals")
            for path in self.objects.iterdir():
                category = known.get(path.name)
                if category is None:
                    path.unlink()
                else:
                    amount = self.size(path)
                    db.execute(
                        "INSERT INTO allocation VALUES(?,?,?)",
                        (path.name, category, amount),
                    )
                    self.allocation_change(db, category, amount)
            for row in db.execute("SELECT DISTINCT call_id,object_id FROM records"):
                if not (self.objects / row["object_id"]).exists():
                    db.execute(
                        "UPDATE calls SET incomplete=1 WHERE id=?", (row["call_id"],)
                    )
            db.execute("PRAGMA incremental_vacuum(128)")
        self.reconciled_at = time.monotonic()

    def capture_view(self, call_id):
        # Immutable snapshots published by segment transitions; no IO in Realtime.
        return self.capture_views.get(call_id)

    def producer_final(self, call_id, owner, source, status):
        with self.lock(), self.db() as db:
            call = self.owned(db, call_id, owner)
            rid = self.reserve(db, {}, protected_call=call_id)
            values = json.loads(call["producer_final"] or "{}")
            values[source] = metadata(status)
            incomplete = bool(
                status.get("dropped_bytes")
                or status.get("missing_events")
                or not status.get("complete", False)
            )
            db.execute(
                "UPDATE calls SET producer_final=?,incomplete=max(incomplete,?) WHERE id=?",
                (json.dumps(values, separators=(",", ":")), int(incomplete), call_id),
            )
            self.release_reservation(db, rid)

    def create_call(self, owner, *, call_id=None):
        with self.lock(), self.db() as db:
            rid = self.reserve(db, {})
            call_id = call_id or uid()
            db.execute(
                "INSERT INTO calls(id,owner,created,release) VALUES(?,?,?,?)",
                (call_id, owner, utc(), self.release),
            )
            self.release_reservation(db, rid)
            return {"logical_call_id": call_id, "schema_version": 1}

    def connection(self, call_id, owner, connection_id, model, revision):
        with self.lock(), self.db() as db:
            self.owned(db, call_id, owner, open_required=True)
            rid = self.reserve(db, {})
            epoch = (
                db.execute(
                    "SELECT count(*) FROM connections WHERE call_id=?", (call_id,)
                ).fetchone()[0]
                + 1
            )
            db.execute(
                "INSERT INTO connections VALUES(?,?,?,?)",
                (connection_id, call_id, epoch, model),
            )
            db.execute(
                "UPDATE calls SET model=?,config_revision=? WHERE id=?",
                (model, revision, call_id),
            )
            self.release_reservation(db, rid)
            return epoch

    def start(self, call_id, owner, capture_ms):
        if not self.cipher:
            raise DiagnosticError("diagnostic_key_unavailable", 503)
        with self.lock(), self.db() as db:
            call = self.owned(db, call_id, owner, open_required=True)
            if db.execute(
                "SELECT 1 FROM segments WHERE call_id=? AND state IN ('recording','stopping')",
                (call_id,),
            ).fetchone():
                raise DiagnosticError("segment_active")
            rid = self.reserve(db, {})
            generation = call["generation"] + 1
            segment_id = uid()
            db.execute(
                "UPDATE calls SET generation=? WHERE id=?", (generation, call_id)
            )
            db.execute(
                "INSERT INTO segments(id,call_id,generation,started,capture_start,state) VALUES(?,?,?,?,?,'recording')",
                (segment_id, call_id, generation, utc(), capture_ms),
            )
            self.release_reservation(db, rid)
            db.commit()
            self.capture_views[call_id] = {
                "id": segment_id,
                "generation": generation,
                "started": db.execute(
                    "SELECT started FROM segments WHERE id=?", (segment_id,)
                ).fetchone()[0],
                "capture_start": capture_ms,
                "recording": True,
            }
            return {"segment_id": segment_id, "generation": generation}

    def stop(self, call_id, owner, segment_id, capture_ms, complete=False):
        with self.lock(), self.db() as db:
            self.owned(db, call_id, owner)
            segment = db.execute(
                "SELECT * FROM segments WHERE id=? AND call_id=?", (segment_id, call_id)
            ).fetchone()
            if not segment:
                raise DiagnosticError("segment_not_found", 404)
            rid = self.reserve(db, {})
            # The first off boundary is immutable; a later finalization cannot widen it.
            db.execute(
                "UPDATE segments SET stopped=coalesce(stopped,?),capture_end=coalesce(capture_end,?),state=?,complete=? WHERE id=?",
                (
                    utc(),
                    capture_ms,
                    "off" if complete else "stopping",
                    int(complete),
                    segment_id,
                ),
            )
            self.release_reservation(db, rid)
            db.commit()
            view = self.capture_views.get(call_id)
            if view and view["id"] == segment_id:
                self.capture_views[call_id] = {**view, "recording": False}
            return {"state": "off" if complete else "stopping"}

    def write(
        self, call_id, owner, record_id, category, kind, payload: bytes, **details
    ):
        return self.write_many(
            call_id,
            owner,
            [
                dict(
                    id=record_id,
                    category=category,
                    kind=kind,
                    payload=payload,
                    **details,
                )
            ],
        )[0]

    def write_many(self, call_id, owner, entries, *, captured=False):
        """One atomic index commit and one encrypted segment per category in a bounded batch.

        Files reach disk before the index transaction commits. A crash leaves only
        unindexed objects, removed by reconciliation; retries retain record identities.
        Audio+decoder manifest use the same transaction. Old E/M objects remain readable.
        """
        if (
            len(entries) > 128
            or sum(len(v["payload"]) for v in entries) > 4 * MAX_CHUNK
        ):
            raise DiagnosticError("batch_too_large", 413)
        with self.lock(), self.db() as db:
            call = self.owned(db, call_id, owner)
            results, fresh = [], []
            for entry in entries:
                value = dict(entry)
                payload = value["payload"]
                if len(payload) > MAX_CHUNK:
                    raise DiagnosticError("chunk_too_large", 413)
                if value["category"] != "technical" and not self.cipher:
                    raise DiagnosticError("diagnostic_key_unavailable", 503)
                digest = hashlib.sha256(payload).hexdigest()
                existing = db.execute(
                    "SELECT * FROM records WHERE id=?", (value["id"],)
                ).fetchone()
                if existing:
                    if (
                        value["kind"] == "audio_manifest"
                        and existing["checksum"] != digest
                    ):
                        old = json.loads(self.read_record(call_id, existing))
                        if old.get("legacy_repair_capture_start_unknown"):
                            candidate = json.loads(payload)
                            candidate["legacy_repair_capture_start_unknown"] = True
                            payload = json.dumps(
                                candidate, separators=(",", ":")
                            ).encode()
                            value["payload"] = payload
                            digest = hashlib.sha256(payload).hexdigest()
                    if (
                        existing["call_id"] != call_id
                        or existing["kind"] != value["kind"]
                        or (existing["checksum"] != digest and value["kind"] != "usage")
                    ):
                        raise DiagnosticError("chunk_identity_conflict")
                    if value["kind"] == "usage" and existing["checksum"] != digest:
                        old = json.loads(self.read_record(call_id, existing))
                        new = json.loads(payload)
                        # Upgrade a missing observation, never count the same response twice.
                        if old.get("response_id") != new.get("response_id"):
                            raise DiagnosticError("chunk_identity_conflict")
                        if new.get("usage") and (
                            not old.get("usage")
                            or (
                                old.get("observation_source") == "browser"
                                and new.get("observation_source") != "browser"
                            )
                        ):
                            value["replace_usage"] = True
                        else:
                            results.append(
                                {
                                    "stored": True,
                                    "replayed": True,
                                    "checksum": existing["checksum"],
                                }
                            )
                            continue
                    else:
                        results.append(
                            {
                                "stored": True,
                                "replayed": True,
                                "checksum": existing["checksum"],
                            }
                        )
                        continue
                repair = False
                if value["kind"] == "audio_manifest" and value["id"].endswith(
                    "_manifest"
                ):
                    audio_id = value["id"].removesuffix("_manifest")
                    paired = db.execute(
                        "SELECT * FROM records WHERE id=? AND call_id=? AND kind='audio'",
                        (audio_id, call_id),
                    ).fetchone()
                    supplied = next(
                        (
                            v
                            for v in entries
                            if v["id"] == audio_id and v["kind"] == "audio"
                        ),
                        None,
                    )
                    if (
                        paired
                        and supplied
                        and hashlib.sha256(supplied["payload"]).hexdigest()
                        == paired["checksum"]
                    ):
                        info = json.loads(payload)
                        repair = (
                            paired["segment_id"] == value.get("segment_id")
                            and paired["captured"] == value.get("capture_end")
                            and paired["sequence"] == info.get("sequence")
                            and paired["source"] == info.get("source_id")
                        )
                        if not repair:
                            raise DiagnosticError("chunk_identity_conflict")
                        # The old missing decoder header cannot prove its original start/init.
                        # Repair only the identical stored audio; preserve this uncertainty.
                        info["legacy_repair_capture_start_unknown"] = True
                        payload = json.dumps(info, separators=(",", ":")).encode()
                        value["payload"] = payload
                        digest = hashlib.sha256(payload).hexdigest()
                if call["closed"] and not value.get("replace_usage") and not repair:
                    raise DiagnosticError("call_closed")
                connection = value.get("connection_id")
                if (
                    connection
                    and not db.execute(
                        "SELECT 1 FROM connections WHERE id=? AND call_id=?",
                        (connection, call_id),
                    ).fetchone()
                ):
                    raise DiagnosticError("connection_not_found", 404)
                if value["category"] != "technical":
                    segment = db.execute(
                        "SELECT * FROM segments WHERE id=? AND call_id=? AND generation=?",
                        (value.get("segment_id"), call_id, value.get("generation")),
                    ).fetchone()
                    if not segment or (
                        not captured
                        and not repair
                        and (
                            value.get("generation") != call["generation"]
                            or segment["state"] == "off"
                        )
                    ):
                        raise DiagnosticError("generation_invalid")
                    start, end = value.get("capture_start"), value.get("capture_end")
                    if (
                        start is None
                        or end is None
                        or end < start
                        or start < segment["capture_start"]
                        or (
                            segment["capture_end"] is not None
                            and end > segment["capture_end"]
                        )
                    ):
                        raise DiagnosticError("capture_boundary_invalid")
                value.update(
                    category="incident" if call["pinned"] else value["category"],
                    checksum=digest,
                )
                fresh.append(value)
                results.append({"stored": True, "replayed": False, "checksum": digest})
            if not fresh:
                return results
            groups = {}
            for entry in fresh:
                groups.setdefault(entry["category"], []).append(entry)
            objects = []
            for category, values in groups.items():
                oid = uid()
                body = json.dumps(
                    {v["id"]: base64.b64encode(v["payload"]).decode() for v in values},
                    separators=(",", ":"),
                ).encode()
                nonce = os.urandom(12)
                envelope = (
                    b"B"
                    + nonce
                    + self.cipher.encrypt(nonce, body, (call_id + ":" + oid).encode())
                    if self.cipher
                    else b"J" + body
                )
                objects.append((oid, category, envelope, values))
            additions = {
                category: sum(
                    ((len(body) + 4095) // 4096) * 4096
                    for _, cat, body, _ in objects
                    if cat == category
                )
                for category in groups
            }
            rid = self.reserve(db, additions)
            paths = []
            try:
                for oid, category, envelope, values in objects:
                    path = self.objects / oid
                    paths.append(path)
                    with path.open("xb") as handle:
                        os.chmod(path, 0o600)
                        handle.write(envelope)
                        handle.flush()
                        os.fsync(handle.fileno())
                    amount = self.size(path)
                    db.execute(
                        "INSERT INTO allocation VALUES(?,?,?)", (oid, category, amount)
                    )
                    self.allocation_change(db, category, amount)
                    for index, value in enumerate(values):
                        value["object_id"] = oid
                        value["stored_bytes"] = amount if index == 0 else 0
                fd = os.open(self.objects, os.O_RDONLY)
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
                for value in fresh:
                    if value.get("replace_usage"):
                        db.execute("DELETE FROM records WHERE id=?", (value["id"],))
                    db.execute(
                        "INSERT INTO records VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (
                            value["id"],
                            call_id,
                            value["category"],
                            value["kind"],
                            value.get("segment_id"),
                            value.get("connection_id"),
                            value.get("sequence"),
                            value.get("source"),
                            value.get("capture_end"),
                            utc(),
                            value["object_id"],
                            value["stored_bytes"],
                            value["checksum"],
                        ),
                    )
                # Retired usage objects remain charged until periodic reconciliation.
                # No historical index/file scan or risky unlink after a durable commit.
                self.release_reservation(db, rid)
                db.commit()
            except BaseException:
                db.rollback()
                for path in paths:
                    path.unlink(missing_ok=True)
                self.release_reservation(db, rid)
                db.commit()
                raise
            return results

    def event_entries(self, call_id, event):
        value = event.model_dump(mode="json", exclude={"content"})
        value.update(
            attributes=metadata(event.attributes),
            release=self.release,
            logical_call_id=call_id,
        )
        entries = [
            dict(
                id=event.event_id,
                category="technical",
                kind="event",
                payload=json.dumps(
                    value, separators=(",", ":"), ensure_ascii=False
                ).encode(),
                connection_id=event.connection_id,
                sequence=event.sequence,
                source=event.source,
            )
        ]
        if event.content is not None:
            entries.append(
                dict(
                    id=event.event_id + "_content",
                    category="text",
                    kind="content",
                    payload=json.dumps(
                        redact(event.content), ensure_ascii=False
                    ).encode(),
                    segment_id=event.segment_id,
                    generation=event.generation,
                    capture_start=event.attributes.get("capture_start_ms"),
                    capture_end=event.attributes.get("capture_end_ms"),
                    connection_id=event.connection_id,
                )
            )
        return entries

    def event_batch(self, call_id, owner, events, *, extra=(), captured=False):
        entries = [
            entry for event in events for entry in self.event_entries(call_id, event)
        ]
        for event in events:
            if (
                event.source == "browser"
                and event.event_type == "provider.response.done"
                and event.response_id
            ):
                from .usage import usage_record

                with self.db() as db:
                    connection = db.execute(
                        "SELECT model FROM connections WHERE id=? AND call_id=?",
                        (event.connection_id, call_id),
                    ).fetchone()
                model = connection[0] if connection else "unknown"
                response = {
                    "id": event.response_id,
                    "status": event.attributes.get("status", "unknown"),
                    "usage": event.attributes.get("usage"),
                }
                payload = {
                    **usage_record(response, model),
                    "observation_source": "browser",
                }
                identity = (
                    "usage_"
                    + hashlib.sha256(
                        (call_id + ":" + event.response_id).encode()
                    ).hexdigest()
                )
                entries.append(
                    dict(
                        id=identity,
                        category="technical",
                        kind="usage",
                        payload=json.dumps(payload, separators=(",", ":")).encode(),
                    )
                )
        # Optional content quota/boundary failure cannot discard critical final/usage metadata.
        critical = [
            entry for entry in [*entries, *extra] if entry["category"] == "technical"
        ]
        content = [
            entry for entry in [*entries, *extra] if entry["category"] != "technical"
        ]
        deduplicated = {}
        for entry in critical:
            old = deduplicated.get(entry["id"])
            if (
                old
                and entry["kind"] == "usage"
                and json.loads(old["payload"]).get("usage")
                and not json.loads(entry["payload"]).get("usage")
            ):
                continue
            deduplicated[entry["id"]] = entry
        results = self.write_many(
            call_id, owner, list(deduplicated.values()), captured=captured
        )
        if content:
            try:
                self.write_many(call_id, owner, content, captured=captured)
            except DiagnosticError as exc:
                dropped = sum(len(entry["payload"]) for entry in content)
                self.producer_final(
                    call_id,
                    owner,
                    "content",
                    {"complete": False, "code": exc.code, "dropped_bytes": dropped},
                )
                results.append(
                    {"content_error": exc.code, "content_dropped_bytes": dropped}
                )
        return results

    def read_record(self, call_id, row):
        value = (self.objects / row["object_id"]).read_bytes()
        if value[:1] in {b"B", b"J"}:
            if value[:1] == b"B":
                if not self.cipher:
                    raise DiagnosticError("diagnostic_key_unavailable", 503)
                try:
                    value = self.cipher.decrypt(
                        value[1:13],
                        value[13:],
                        (call_id + ":" + row["object_id"]).encode(),
                    )
                except Exception:
                    raise DiagnosticError("diagnostic_integrity_failed", 503) from None
            else:
                value = value[1:]
            try:
                value = base64.b64decode(json.loads(value)[row["id"]], validate=True)
            except Exception:
                raise DiagnosticError("diagnostic_integrity_failed", 503) from None
        elif value[:1] == b"E":
            if not self.cipher:
                raise DiagnosticError("diagnostic_key_unavailable", 503)
            try:
                value = self.cipher.decrypt(
                    value[1:13], value[13:], (call_id + ":" + row["id"]).encode()
                )
            except Exception:
                raise DiagnosticError("diagnostic_integrity_failed", 503) from None
        else:
            value = value[1:]
        if hashlib.sha256(value).hexdigest() != row["checksum"]:
            raise DiagnosticError("diagnostic_integrity_failed", 503)
        return value

    def event(self, call_id, owner, event: Event):
        return self.event_batch(call_id, owner, [event])[0]

    def close(self, call_id, owner):
        with self.lock(), self.db() as db:
            self.owned(db, call_id, owner)
            rid = self.reserve(db, {})
            db.execute(
                "UPDATE calls SET closed=coalesce(closed,?),incomplete=CASE WHEN EXISTS(SELECT 1 FROM segments WHERE call_id=? AND complete=0) THEN 1 ELSE incomplete END WHERE id=?",
                (utc(), call_id, call_id),
            )
            db.execute(
                "UPDATE segments SET state='off',stopped=coalesce(stopped,?) WHERE call_id=?",
                (utc(), call_id),
            )
            self.release_reservation(db, rid)
            self.capture_views.pop(call_id, None)
            return {"closed": True}

    def listing(self):
        with self.lock(), self.db() as db:
            return [
                dict(r)
                for r in db.execute(
                    "SELECT id,created,closed,pinned,release,model,config_revision,incomplete FROM calls WHERE deleted=0 ORDER BY created DESC LIMIT 100"
                )
            ]

    def manifest(self, call_id):
        with self.lock(), self.db() as db:
            call = db.execute(
                "SELECT * FROM calls WHERE id=? AND deleted=0", (call_id,)
            ).fetchone()
            if not call:
                raise DiagnosticError("call_not_found", 404)
            total = db.execute(
                "SELECT count(*) FROM records WHERE call_id=?", (call_id,)
            ).fetchone()[0]
            records = [
                dict(r)
                for r in db.execute(
                    "SELECT * FROM records WHERE call_id=? ORDER BY rowid LIMIT 1000",
                    (call_id,),
                )
            ]
            events, gaps, seen, duplicates = [], [], {}, []
            audio, decoder = {}, {}
            for row in records:
                if row["kind"] == "event":
                    value = json.loads(self.read_record(call_id, row))
                    events.append(value)
                    source = (
                        value["source"],
                        value.get("connection_id")
                        if value["source"] != "browser"
                        else None,
                    )
                    first = value["sequence"]
                    last = value.get("attributes", {}).get("sequence_end", first)
                    # Validate bounded aggregate ranges without allocating an untrusted range.
                    if not isinstance(last, int) or not first <= last <= first + 64:
                        last = first
                    seen.setdefault(source, []).append((first, last))
                elif row["kind"] == "audio":
                    audio[row["id"]] = row
                elif row["kind"] == "audio_manifest":
                    decoder[row["id"].removesuffix("_manifest")] = json.loads(
                        self.read_record(call_id, row)
                    )
            for source, ranges in seen.items():
                previous = 0
                for first, last in sorted(ranges):
                    if first <= previous:
                        duplicates.append(
                            {
                                "source": source[0],
                                "connection_id": source[1],
                                "sequence": first,
                            }
                        )
                    elif first > previous + 1:
                        gaps.append(
                            {
                                "source": source[0],
                                "connection_id": source[1],
                                "after": previous,
                                "before": first,
                            }
                        )
                    previous = max(previous, last)
            tracks = {}
            for identity, info in decoder.items():
                key = (
                    info.get("segment_id"),
                    info.get("source_id"),
                    info.get("recording_id") or info.get("track_id"),
                )
                track = tracks.setdefault(
                    key,
                    {
                        "segment_id": key[0],
                        "source_id": key[1],
                        "recording_id": key[2],
                        "sequences": [],
                        "final": False,
                        "paired": True,
                    },
                )
                track["sequences"].append(info["sequence"])
                track["final"] |= bool(info.get("final"))
                track["paired"] &= identity in audio
                track["legacy_unknown"] = track.get(
                    "legacy_unknown", False
                ) or info.get("legacy_repair_capture_start_unknown", False)
            for track in tracks.values():
                ordered = sorted(track.pop("sequences"))
                track["init_present"] = bool(ordered and ordered[0] == 0)
                track["sequence_gaps"] = any(
                    right != left + 1 for left, right in zip(ordered, ordered[1:])
                )
                track["chunks"] = len(ordered)
                track["complete"] = (
                    track["init_present"]
                    and track["final"]
                    and track["paired"]
                    and not track["sequence_gaps"]
                    and not track.get("legacy_unknown", False)
                )
            finals = json.loads(call["producer_final"] or "{}")
            expected = [
                "browser",
                *(
                    "server_" + r[0]
                    for r in db.execute(
                        "SELECT id FROM connections WHERE call_id=?", (call_id,)
                    )
                ),
            ]
            missing_final = not bool(call["closed"]) or any(
                source not in finals or not finals[source].get("complete")
                for source in expected
            )
            return {
                "schema_version": 1,
                "object_count": total,
                "timeline_partial": total > 1000,
                "object_manifest_pattern": "objects/<record_id>.manifest.json",
                "call": {
                    k: (finals if k == "producer_final" else call[k])
                    for k in call.keys()
                    if k != "owner"
                },
                "connections": [
                    dict(r)
                    for r in db.execute(
                        "SELECT * FROM connections WHERE call_id=?", (call_id,)
                    )
                ],
                "segments": [
                    dict(r)
                    for r in db.execute(
                        "SELECT * FROM segments WHERE call_id=?", (call_id,)
                    )
                ],
                "objects": [{k: r[k] for k in r if k != "object_id"} for r in records],
                "events": events,
                "gaps": gaps,
                "duplicates": duplicates,
                "missing_final": missing_final,
                "audio": {
                    "tracks": list(tracks.values()),
                    "unpaired_audio": len(audio.keys() - decoder.keys()),
                    "unpaired_manifests": len(decoder.keys() - audio.keys()),
                    "partial": total > 1000,
                },
                "usage": [
                    json.loads(self.read_record(call_id, r))
                    for r in records
                    if r["kind"] == "usage"
                ],
            }

    def objects_for_export(self, call_id):
        with self.lock(), self.db() as db:
            watermark = db.execute(
                "SELECT coalesce(max(rowid),0) FROM records WHERE call_id=?", (call_id,)
            ).fetchone()[0]
        cursor = 0
        while True:
            with self.lock(), self.db() as db:
                if not db.execute(
                    "SELECT 1 FROM calls WHERE id=? AND deleted=0", (call_id,)
                ).fetchone():
                    raise DiagnosticError("call_not_found", 404)
                row = db.execute(
                    "SELECT rowid AS position,* FROM records WHERE call_id=? AND rowid>? AND rowid<=? ORDER BY rowid LIMIT 1",
                    (call_id, cursor, watermark),
                ).fetchone()
                if row is None:
                    return
                payload = self.read_record(call_id, row)
                row = dict(row)
                cursor = row.pop("position")
            yield row, payload

    def audit(self, actor, action, call_id=None):
        with self.lock(), self.db() as db:
            rid = self.reserve(db, {})
            db.execute(
                "INSERT INTO access VALUES(?,?,?,?,?)",
                (uid(), actor, action, call_id, utc()),
            )
            self.release_reservation(db, rid)

    def delete(self, call_id, actor):
        self.audit(actor, "delete", call_id)
        with self.lock(), self.db() as db:
            if not db.execute(
                "SELECT 1 FROM calls WHERE id=? AND deleted=0", (call_id,)
            ).fetchone():
                raise DiagnosticError("call_not_found", 404)
            self._delete(db, call_id)
            db.execute("PRAGMA incremental_vacuum(128)")
        self.reconcile()  # Also remove retired/unindexed objects; never in event ingress.
        return {"deleted": True}

    def pin(self, call_id, actor):
        with self.lock(), self.db() as db:
            call = db.execute(
                "SELECT * FROM calls WHERE id=? AND deleted=0", (call_id,)
            ).fetchone()
            if not call or not call["closed"]:
                raise DiagnosticError("pin_requires_closed_call")
            if call["pinned"]:
                return {"pinned": True}
            size = sum(
                r[0]
                for r in db.execute(
                    "SELECT a.bytes FROM allocation a WHERE a.object_id IN (SELECT object_id FROM records WHERE call_id=?)",
                    (call_id,),
                )
            )
            usage = self.physical(db)
            if usage["incident"] + size > self.limits["incident"]:
                raise DiagnosticError("incident_full_export_or_delete_required", 507)
            rid = self.reserve(db, {"incident": size}, protected_call=call_id)
            for category, amount in db.execute(
                "SELECT category,sum(bytes) FROM allocation WHERE object_id IN (SELECT object_id FROM records WHERE call_id=?) GROUP BY category",
                (call_id,),
            ).fetchall():
                self.allocation_change(db, category, -amount)
                self.allocation_change(db, "incident", amount)
            db.execute(
                "UPDATE allocation SET category='incident' WHERE object_id IN (SELECT object_id FROM records WHERE call_id=?)",
                (call_id,),
            )
            db.execute(
                "UPDATE records SET category='incident' WHERE call_id=?", (call_id,)
            )
            db.execute("UPDATE calls SET pinned=1 WHERE id=?", (call_id,))
            db.execute(
                "INSERT INTO access VALUES(?,?,?,?,?)",
                (uid(), actor, "pin", call_id, utc()),
            )
            self.release_reservation(db, rid)
        return {"pinned": True}

    def capacity(self):
        with self.lock(), self.db() as db:
            values = self.physical(db)
            return {
                k: {
                    "used_bytes": values[k],
                    "maximum_bytes": cap,
                    "warning": values[k] >= cap * 8 // 10,
                    "target_bytes": cap * 9 // 10,
                }
                for k, cap in self.limits.items()
            }

    def record_usage(self, call_id, owner, response, model):
        from .usage import usage_record

        response_id = response.get("id")
        if not isinstance(response_id, str) or len(response_id) > 128:
            return
        # Identity is deterministic across browser/sideband observers.
        record_id = (
            "usage_"
            + hashlib.sha256((call_id + ":" + response_id).encode()).hexdigest()
        )
        result = self.write(
            call_id,
            owner,
            record_id,
            "technical",
            "usage",
            json.dumps(usage_record(response, model), separators=(",", ":")).encode(),
        )
        return result
