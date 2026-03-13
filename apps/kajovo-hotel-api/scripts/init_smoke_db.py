from __future__ import annotations

import hashlib
import sqlite3
import sys
from pathlib import Path

from sqlalchemy import create_engine

from app.db.models import Base


def _scrypt_hash(password: str, salt: bytes) -> str:
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: init_smoke_db.py <sqlite-file>")

    db_path = Path(sys.argv[1]).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    Base.metadata.create_all(bind=engine)
    with sqlite3.connect(db_path) as connection:
        connection.execute("DELETE FROM portal_user_roles WHERE user_id IN (SELECT id FROM portal_users WHERE email = ?)", ("admin@kajovohotel.local",))
        connection.execute("DELETE FROM portal_users WHERE email = ?", ("admin@kajovohotel.local",))
        connection.execute(
            """
            INSERT INTO portal_users (first_name, last_name, email, password_hash, is_active)
            VALUES (?, ?, ?, ?, 1)
            """,
            (
                "Admin",
                "User",
                "admin@kajovohotel.local",
                _scrypt_hash("admin123", b"smoke-admin-salt"),
            ),
        )
        connection.execute(
            """
            INSERT INTO portal_user_roles (user_id, role)
            VALUES ((SELECT id FROM portal_users WHERE email = ?), ?)
            """,
            ("admin@kajovohotel.local", "admin"),
        )
        connection.commit()


if __name__ == "__main__":
    main()
