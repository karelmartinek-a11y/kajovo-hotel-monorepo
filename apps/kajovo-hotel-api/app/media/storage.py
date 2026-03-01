from __future__ import annotations

import io
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

try:
    from PIL import Image
except Exception:  # pragma: no cover
    Image = None


class MediaStorageError(RuntimeError):
    pass


@dataclass(frozen=True)
class StoredMedia:
    original_relpath: str
    thumb_relpath: str
    bytes: int


class MediaStorage:
    def __init__(self, media_root: str):
        self.root = Path(media_root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _safe_rel(self, relpath: str) -> Path:
        rel = Path(relpath)
        if rel.is_absolute() or '..' in rel.parts:
            raise MediaStorageError('Invalid media path')
        target = (self.root / rel).resolve()
        if not str(target).startswith(str(self.root)):
            raise MediaStorageError('Path escapes media root')
        return target

    def resolve(self, relpath: str) -> Path:
        return self._safe_rel(relpath)

    def store_image(
        self,
        *,
        category: str,
        resource_id: int,
        src_file: BinaryIO,
        src_filename: str,
    ) -> StoredMedia:
        ext = Path(src_filename or '').suffix.lower()
        if ext not in {'.jpg', '.jpeg', '.png', '.webp'}:
            ext = '.jpg'

        token = uuid.uuid4().hex
        base_rel = Path(category) / str(resource_id)
        orig_rel = str((base_rel / f'{token}{ext}').as_posix())
        thumb_rel = str((base_rel / f'{token}_thumb.jpg').as_posix())

        orig_path = self._safe_rel(orig_rel)
        thumb_path = self._safe_rel(thumb_rel)
        orig_path.parent.mkdir(parents=True, exist_ok=True)
        thumb_path.parent.mkdir(parents=True, exist_ok=True)

        src_file.seek(0)
        data = src_file.read()
        if not data:
            raise MediaStorageError('Empty file')

        with orig_path.open('wb') as fh:
            fh.write(data)

        # Thumbnail: prefer PIL. If unavailable, keep a safe copy fallback.
        try:
            if Image is not None:
                with Image.open(io.BytesIO(data)) as img:
                    work = img.convert('RGB')
                    work.thumbnail((480, 480))
                    work.save(thumb_path, format='JPEG', quality=82)
            else:
                shutil.copyfile(orig_path, thumb_path)
        except Exception:
            shutil.copyfile(orig_path, thumb_path)

        return StoredMedia(
            original_relpath=orig_rel,
            thumb_relpath=thumb_rel,
            bytes=len(data),
        )


class InventoryMediaStorage(MediaStorage):
    def store_pictogram(self, *, ingredient_id: int, src_file: BinaryIO, src_filename: str) -> StoredMedia:
        return self.store_image(
            category='inventory/ingredients',
            resource_id=ingredient_id,
            src_file=src_file,
            src_filename=src_filename,
        )
