"""Explicit local export to private files; no service, writes or deletion in archive."""
import argparse
import json
import os
from pathlib import Path

from tools.voice_archive.reader import ArchiveReader


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--key-file', type=Path, required=True)
    parser.add_argument('--call', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    reader = ArchiveReader(args.root, args.key_file.read_text().strip())
    args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
    (args.output / 'manifest.json').write_text(json.dumps(reader.manifest(args.call), ensure_ascii=False, indent=2))
    objects = args.output / 'objects'
    objects.mkdir(mode=0o700)
    for row, payload in reader.objects_for_export(args.call):
        name = row['id']
        if not __import__('re').fullmatch(r'[a-zA-Z0-9_-]{1,160}', name):
            raise ValueError('invalid_record_identity')
        (objects / (name + '.manifest.json')).write_text(json.dumps({k: v for k, v in row.items() if k != 'object_id'}))
        (objects / (name + ('.bin' if row['kind'] == 'audio' else '.json'))).write_bytes(payload)
    print('Offline export complete; sensitive files saved with private permissions.')


if __name__ == '__main__':
    main()
