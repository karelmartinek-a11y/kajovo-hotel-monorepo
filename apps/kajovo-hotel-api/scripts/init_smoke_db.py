from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import create_engine

from app.db.models import Base


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: init_smoke_db.py <sqlite-file>")

    db_path = Path(sys.argv[1]).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    main()
