"""Own schema v1 and transactional, non-destructive host-table import.

No hotel model import. Legacy tables remain intact for rollback inspection.
The returned evidence contains only counts and digests, never row content.
"""
import hashlib
import json
from datetime import date, datetime
from uuid import uuid5, NAMESPACE_URL
from sqlalchemy import Column, Integer, MetaData, Table, inspect, select
from .models import DagmarBase
from .memory import SHARED_SPACE

SHARED_ID = str(uuid5(NAMESPACE_URL, SHARED_SPACE))
VERSION = 1

def canonical(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError("unsupported migration value")

def digest_rows(rows):
    encoded = sorted(json.dumps(row, sort_keys=True, default=canonical, ensure_ascii=False, separators=(',', ':')) for row in rows)
    return hashlib.sha256(('[' + ','.join(encoded) + ']').encode()).hexdigest()

def upgrade(engine, *, import_legacy=False):
    with engine.begin() as connection:
        # PostgreSQL advisory lock serializes fresh schema creation/import across workers.
        if connection.dialect.name == 'postgresql':
            connection.exec_driver_sql('SELECT pg_advisory_xact_lock(6767465201)')
        marker = Table('dagmar_schema_version', MetaData(), Column('version', Integer, primary_key=True))
        marker.create(connection, checkfirst=True)
        existing = connection.scalar(select(marker.c.version))
        from .mail_storage import migrate as migrate_mail
        if existing is not None:
            if existing != VERSION:
                raise RuntimeError('unsupported_dagmar_schema')
            migrate_mail(connection)
            return {'version': VERSION, 'already_applied': True}
        DagmarBase.metadata.create_all(connection)
        evidence = {}
        shared = DagmarBase.metadata.tables['dagmar_voice_memory_principals']
        connection.execute(shared.insert().values(id=SHARED_ID, namespace=SHARED_SPACE))
        available = set(inspect(connection).get_table_names())
        shared_tables = {'voice_memories', 'voice_notes', 'voice_conversation_summaries', 'voice_memory_operations'}
        authors = {}
        if import_legacy and "voice_memory_principals" in available:
            legacy_principals = Table("voice_memory_principals", MetaData(), autoload_with=connection)
            for row in connection.execute(select(legacy_principals)).mappings():
                authors[row["id"]] = "portal:" + str(row["portal_user_id"]) if row.get("portal_user_id") else "admin-profile:" + str(row.get("admin_profile_id"))
        if import_legacy:
            for target in DagmarBase.metadata.sorted_tables:
                legacy_name = target.name.removeprefix('dagmar_')
                if legacy_name not in available:
                    continue
                source = Table(legacy_name, MetaData(), autoload_with=connection)
                originals = [dict(row) for row in connection.execute(select(source)).mappings()]
                transformed = []
                for row in originals:
                    value = {key: item for key, item in row.items() if key in target.c}
                    if legacy_name == 'voice_memory_principals':
                        value['namespace'] = 'legacy:' + row['id']
                    if legacy_name in shared_tables:
                        value['origin_principal_id'] = row['principal_id']
                        value['creator_namespace'] = 'legacy:' + row['principal_id']
                        value['principal_id'] = SHARED_ID
                    if legacy_name == 'voice_memory_operations':
                        value['receipt_namespace'] = authors.get(row['principal_id'], 'legacy:' + row['principal_id'])
                    transformed.append(value)
                if transformed:
                    connection.execute(target.insert(), transformed)
                actual = [dict(r) for r in connection.execute(select(target)).mappings()]
                # Compare the exact projected columns, including every legacy field.
                primary_keys = tuple(column.name for column in target.primary_key)
                actual_by_key = {tuple(row[key] for key in primary_keys): row for row in actual}
                projected = [{key: actual_by_key[tuple(expected[column] for column in primary_keys)][key] for key in expected}
                             for expected in transformed if tuple(expected[column] for column in primary_keys) in actual_by_key]
                if len(projected) != len(transformed) or digest_rows(projected) != digest_rows(transformed):
                    raise RuntimeError('migration_verification_failed:' + legacy_name)
                evidence[legacy_name] = {'count_before': len(originals), 'count_after': len(projected), 'before_sha256': digest_rows(originals), 'mapped_sha256': digest_rows(projected)}
        settings = DagmarBase.metadata.tables['dagmar_voice_memory_settings']
        # Preserve original settings; the shared space starts conservatively disabled if any author disabled it.
        legacy_settings = Table('voice_memory_settings', MetaData(), autoload_with=connection) if import_legacy and 'voice_memory_settings' in available else None
        rows = list(connection.execute(select(legacy_settings)).mappings()) if legacy_settings is not None else []
        connection.execute(settings.insert().values(principal_id=SHARED_ID, automatic=all(r['automatic'] for r in rows), revision=max([r['revision'] for r in rows], default=0), generation=max([r['generation'] for r in rows], default=0)))
        connection.execute(marker.insert().values(version=VERSION))
        migrate_mail(connection)
        return {'version': VERSION, 'already_applied': False, 'tables': evidence}
