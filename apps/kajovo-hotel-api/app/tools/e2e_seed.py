from __future__ import annotations

import hashlib
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Base, PortalSmtpSettings


def _hash_password(password: str, salt: bytes) -> str:
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def main() -> None:
    settings = get_settings()
    if not settings.database_url.startswith("sqlite:///"):
        raise RuntimeError("E2E smoke seed currently supports sqlite database URLs only.")

    db_path = settings.database_url.removeprefix("sqlite:///")
    db_file = Path(db_path)
    db_file.parent.mkdir(parents=True, exist_ok=True)
    if db_file.exists():
        db_file.unlink()

    engine = create_engine(settings.database_url, future=True)
    Base.metadata.create_all(bind=engine)

    with Session(bind=engine) as session:
        smtp = PortalSmtpSettings(
            id=1,
            host="mock.smtp.local",
            port=1025,
            username="mock-user",
            password_encrypted=_hash_password("mock-password", b"smtp-seed-salt-01"),
            use_tls=False,
            use_ssl=False,
        )
        session.add(smtp)
        session.commit()


if __name__ == "__main__":
    main()
