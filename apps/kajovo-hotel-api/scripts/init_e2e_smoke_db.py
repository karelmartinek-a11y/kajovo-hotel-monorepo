from sqlalchemy import create_engine

from app.config import get_settings
from app.db.models import Base


def main() -> None:
    engine = create_engine(get_settings().database_url)
    Base.metadata.create_all(bind=engine)


if __name__ == '__main__':
    main()
