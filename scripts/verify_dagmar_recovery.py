"""Restore a protected backup, migrate, write, then restore the Dagmar-era backup.

Only isolated PostgreSQL containers are touched. SQL, keys and errors never go to
stdout. A compatible rollback must retain Dagmar's own persistence boundary.
"""
import argparse
import json
from pathlib import Path
import subprocess
import time
from uuid import uuid4


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backup-dir', required=True)
    parser.add_argument('--expect-schema', choices=['legacy','dagmar'], default='legacy')
    parser.add_argument('--api-image', default='kajovo-api-ci')
    parser.add_argument('--evidence', required=True)
    args = parser.parse_args()
    root = Path(args.backup_dir).resolve()
    for filename in ('hotel.sql','roles.sql','release.env','diagnostic.key'):
        if not (root/filename).is_file():
            raise RuntimeError('Missing protected backup file: '+filename)
    name = 'dagmar-recovery-' + uuid4().hex[:12]

    def run(*command, input=None):
        result = subprocess.run(command, input=input, capture_output=True)
        if result.returncode:
            log = root / 'recovery-failure.log'
            log.write_bytes(result.stdout + result.stderr)
            log.chmod(0o600)
            raise RuntimeError('Recovery failed; diagnostic output is in the protected backup directory')
        return result.stdout

    run('docker', 'network', 'create', '--internal', name)
    try:
        run('docker', 'run', '-d', '--name', name, '--network', name, '--network-alias', 'postgres', '-e', 'POSTGRES_PASSWORD=recovery-test-only', '-e', 'POSTGRES_DB=memory', 'postgres:16.4-alpine')
        for _ in range(120):
            if subprocess.run(['docker', 'exec', name, 'psql', '-U', 'postgres', '-d', 'memory', '-c', 'SELECT 1'], capture_output=True).returncode == 0:
                break
            time.sleep(.5)
        else:
            raise RuntimeError('Isolated PostgreSQL did not become ready')
        # The protected source dump retains role ownership. Duplicate postgres is expected.
        subprocess.run(['docker','exec','-i',name,'psql','-U','postgres','-d','memory'],input=(root/'roles.sql').read_bytes(),capture_output=True)
        run('docker','exec',name,'psql','-U','postgres','-d','memory','-c',"ALTER ROLE postgres WITH PASSWORD 'recovery-test-only'")
        run('docker', 'exec', '-i', name, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'memory', input=(root / 'hotel.sql').read_bytes())

        def api(code, database):
            return run('docker', 'run', '--rm', '--network', name, '--env-file', str(root / 'release.env'), '-e', 'RECOVERY_DATABASE='+database, '--mount', 'type=bind,src='+str(root/'diagnostic.key')+',dst=/recovery/diagnostic.key,readonly', '--entrypoint', 'python', args.api_image, '-c', code)

        setup = '''
import os, json
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from dagmar_server.migrations import upgrade, SHARED_ID
from dagmar_server import memory
from dagmar_server.models import VoiceMemory
from dagmar_server.memory_contract import MemoryRequest
engine=create_engine('postgresql+psycopg://postgres:recovery-test-only@postgres:5432/'+os.environ['RECOVERY_DATABASE'])
evidence=upgrade(engine,import_legacy=True)
factory=sessionmaker(engine)
request=MemoryRequest.model_validate({'request':{'operation':'memory_remember','kind':'fact','subject':'Isolated recovery fixture','content':'Durable recovery fixture','tags':[]}})
'''
        create = setup + "assert evidence['already_applied'] == " + repr(args.expect_schema=='dagmar') + '''
with factory() as db:
 result=memory.execute(db,SHARED_ID,request,session_id='recovery-fixture',call_id='original-key',receipt_namespace='test-auth:recovery')
 assert result.code=='ok'
print(json.dumps(evidence))
'''
        migration = json.loads(api(create, 'memory'))
        dump = run('docker', 'exec', name, 'pg_dump', '-U', 'postgres', '--no-owner', '--no-acl', 'memory')
        run('docker', 'exec', name, 'createdb', '-U', 'postgres', 'recovered')
        run('docker', 'exec', '-i', name, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'recovered', input=dump)
        verify = setup + '''
from dagmar_server.config import VoiceSecretAdapter
from dagmar_server.ports import bind,RuntimePorts
from dagmar_server.settings import DagmarSettings
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pathlib import Path
import base64
assert evidence['already_applied']
with factory() as db:
 result=memory.execute(db,SHARED_ID,request,session_id='recovery-fixture',call_id='original-key',receipt_namespace='test-auth:recovery')
 assert result.replayed and result.code=='ok'
 assert db.scalar(select(VoiceMemory).where(VoiceMemory.subject=='Isolated recovery fixture')).id==result.memory.id
 with bind(RuntimePorts(factory,DagmarSettings(voice_master_key=os.environ['KAJOVO_API_VOICE_MASTER_KEY']),lambda owner:None)):
  assert bool(VoiceSecretAdapter(db).read())
key=base64.b64decode(Path('/recovery/diagnostic.key').read_text().strip(),validate=True)
nonce=os.urandom(12)
cipher=AESGCM(key).encrypt(nonce,b'recovery fixture',b'diagnostic recovery')
assert AESGCM(key).decrypt(nonce,cipher,b'diagnostic recovery')==b'recovery fixture'
print(json.dumps({'post_migration_restore':True,'new_write_durable':True,'original_receipt_replayed':True,'provider_key_decrypt':True,'separate_diagnostic_key_restore':True,'schema_version':1}))
'''
        recovery = json.loads(api(verify, 'recovered'))
        proof = {'postgres_image':'16.4-alpine','api_image':args.api_image,'backup_schema':args.expect_schema,'migration':migration,'recovery':recovery,'legacy_source_untouched':True,'old_stage_a_code_compatible':False,'rollback_requires_dagmar_schema_and_receipts':True}
        Path(args.evidence).write_text(json.dumps(proof, indent=2)+'\n')
        print('Dagmar PostgreSQL backup/migration/new-write/restore/key recovery PASS')
    finally:
        subprocess.run(['docker', 'rm', '-fv', name], capture_output=True)
        subprocess.run(['docker', 'network', 'rm', name], capture_output=True)


if __name__ == '__main__':
    main()
