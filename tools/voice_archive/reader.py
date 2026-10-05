"""Offline read-only reader for historical Dagmar v1/v2 objects. Never imported by API."""
from contextlib import contextmanager
from pathlib import Path
import base64
import hashlib
import json
import re
import sqlite3
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

class DiagnosticError(Exception):
    def __init__(self, code, status=409):
        self.code, self.status = code, status
        super().__init__(code)

class ArchiveReader:
    def __init__(self, root, key):
        self.root = Path(root).resolve(strict=True)
        self.objects = self.root / 'objects'
        self.dbfile = self.root / 'index.sqlite3'
        decoded = base64.b64decode(key, validate=True)
        self.cipher = AESGCM(decoded)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.dbfile.as_uri()+'?mode=ro', uri=True)
        try:
            db.row_factory = sqlite3.Row
            db.execute('PRAGMA query_only=ON')
            db.execute('BEGIN')
            yield db
        finally:
            db.close()

    def read_record(self, call_id, row):
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,160}', row['object_id']):
            raise DiagnosticError('diagnostic_integrity_failed')
        path = (self.objects / row['object_id']).resolve(strict=True)
        if path.parent != self.objects.resolve() or path.stat().st_size > 64 * 1024 * 1024:
            raise DiagnosticError('diagnostic_integrity_failed')
        value = path.read_bytes()
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

    def listing(self):
        with self.db() as db:
            return [
                dict(r)
                for r in db.execute(
                    "SELECT id,created,closed,pinned,release,model,config_revision,incomplete FROM calls WHERE deleted=0 ORDER BY created DESC LIMIT 100"
                )
            ]

    def manifest(self, call_id):
        with self.db() as db:
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
            finals = json.loads(call["producer_final"] or "{}") if "producer_final" in call.keys() else {}
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
        with self.db() as db:
            watermark = db.execute(
                "SELECT coalesce(max(rowid),0) FROM records WHERE call_id=?", (call_id,)
            ).fetchone()[0]
        cursor = 0
        while True:
            with self.db() as db:
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
