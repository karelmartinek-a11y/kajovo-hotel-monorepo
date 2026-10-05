"""Synthetic v1/v2 encryption fixtures; reader cannot reconcile, migrate or write."""
import base64
import hashlib
import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from tools.voice_archive.reader import ArchiveReader, DiagnosticError


class ReaderTests(unittest.TestCase):
    def test_original_formats_checksums_and_readonly_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            objects=root/'objects'
            objects.mkdir()
            key=b'x'*32
            cipher=AESGCM(key)
            dbfile=root/'index.sqlite3'
            with sqlite3.connect(dbfile) as db:
                db.executescript('''
                    CREATE TABLE calls(id TEXT PRIMARY KEY,owner TEXT,created TEXT,closed TEXT,pinned INTEGER,deleted INTEGER,release TEXT,model TEXT,config_revision INTEGER,incomplete INTEGER,producer_final TEXT);
                    CREATE TABLE records(id TEXT,call_id TEXT,object_id TEXT,kind TEXT,checksum TEXT);
                    CREATE TABLE connections(id TEXT,call_id TEXT);
                    CREATE TABLE segments(id TEXT,call_id TEXT);
                ''')
                db.execute("INSERT INTO calls VALUES ('call','owner','then','then',0,0,'historical','model',1,0,'{}')")
                for prefix in ('E','B','J','M'):
                    name='record_'+prefix
                    oid='object_'+prefix
                    payload=json.dumps({'fixture':prefix}).encode()
                    body=json.dumps({name:base64.b64encode(payload).decode()}).encode() if prefix in {'B','J'} else payload
                    if prefix in {'E','B'}:
                        nonce=os.urandom(12)
                        aad=('call:'+ (name if prefix=='E' else oid)).encode()
                        raw=prefix.encode()+nonce+cipher.encrypt(nonce,body,aad)
                    else:
                        raw=prefix.encode()+body
                    (objects/oid).write_bytes(raw)
                    db.execute('INSERT INTO records VALUES (?,?,?,?,?)',(name,'call',oid,'content',hashlib.sha256(payload).hexdigest()))
            before={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
            reader=ArchiveReader(root,base64.b64encode(key).decode())
            assert len(reader.listing())==1
            assert reader.manifest('call')['object_count']==4
            values=list(reader.objects_for_export('call'))
            assert len(values)==4
            for row,payload in values:
                assert json.loads(payload)['fixture']==row['id'][-1]
            with reader.db() as db:
                with self.assertRaises(sqlite3.OperationalError):
                    db.execute("UPDATE calls SET deleted=1")
            after={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
            assert before==after
            bad=ArchiveReader(root,base64.b64encode(b'y'*32).decode())
            with self.assertRaisesRegex(DiagnosticError,'diagnostic_integrity_failed'):
                list(bad.objects_for_export('call'))


if __name__=='__main__':
    unittest.main()
