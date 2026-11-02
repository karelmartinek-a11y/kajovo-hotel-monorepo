"""CML navigation exposes assigned roles; every API request retains a local role."""

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, PortalUser, PortalUserRole
from app.security.cml_assertion import AssertionDenied
from app.services.cml_identity import resolve_identity


def test_native_multirole_navigation_does_not_expand_the_active_api_role():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    claims = {
        "sub": "user:" + str(uuid.uuid4()),
        "nativeId": "1",
        "role": "member",
        "sid": str(uuid.uuid4()),
    }
    try:
        with factory() as db:
            db.add(
                PortalUser(
                    id=1,
                    first_name="Synthetic",
                    last_name="Member",
                    email="synthetic@example.invalid",
                    password_hash="unused",
                    is_active=True,
                    preferred_locale="uk",
                    roles=[PortalUserRole(role="recepce"), PortalUserRole(role="sklad")],
                )
            )
            db.commit()
            reception = resolve_identity(db, claims, "recepce")["public"]
            assert reception["preferred_locale"] == "uk"
            assert reception["languages"] == ["cs", "en", "uk"]
            assert "inventory:read" not in reception["permissions"]
            assert "inventory:read" in reception["available_permissions"]
            assert "inventory:read" in reception["role_permissions"]["sklad"]
            storage = resolve_identity(db, claims, "sklad")["public"]
            assert "inventory:write" in storage["permissions"]
            assert "breakfast:write" not in storage["permissions"]
            with pytest.raises(AssertionDenied):
                resolve_identity(db, claims, "admin")
            user = db.get(PortalUser, 1)
            user.roles = [r for r in user.roles if r.role != "sklad"]
            db.commit()
            with pytest.raises(AssertionDenied):
                resolve_identity(db, claims, "sklad")
            assert (
                "inventory:read"
                not in resolve_identity(db, claims, None)["public"]["available_permissions"]
            )
            user.is_active = False
            db.commit()
            with pytest.raises(AssertionDenied):
                resolve_identity(db, claims, None)
    finally:
        engine.dispose()
