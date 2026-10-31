"""Local central-profile qualification with actual Hotel users API and synthetic DB."""


def build_fixture():
    import os
    from pathlib import Path

    if os.getenv("HOTEL_CML_UI_QUALIFICATION") != "1":
        raise RuntimeError("Explicit isolated qualification required")
    from fastapi import FastAPI
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.api.routes.users import router
    from app.db.models import Base, PortalUser, PortalUserRole
    from app.db.session import get_db
    from app.security.cml_web import CmlWebBoundary
    from app.services.cml_identity import resolve_identity

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add(
            PortalUser(
                id=1,
                first_name="Testovací",
                last_name="Zaměstnanec",
                email="attendance@example.invalid",
                password_hash="synthetic-unused",
                is_active=True,
                roles=[PortalUserRole(role="recepce")],
            )
        )
        db.add(
            PortalUser(
                id=2,
                first_name="Jiný",
                last_name="Účet",
                email="unrelated@example.invalid",
                password_hash="synthetic-unused",
                is_active=False,
                roles=[PortalUserRole(role="sklad")],
            )
        )
        db.commit()
    app = FastAPI()
    app.include_router(router)

    def dependency():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = dependency
    app.add_middleware(
        CmlWebBoundary,
        audience="hotel",
        session_factory=factory,
        resolve_identity=resolve_identity,
        ui_root=Path(__file__).resolve().parents[1] / "app/web_ui",
    )
    return app


app = build_fixture()
