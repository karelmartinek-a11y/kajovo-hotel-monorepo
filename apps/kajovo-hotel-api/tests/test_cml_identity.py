"""CML module choices override job-role presentation without granting other modules."""

import itertools
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, PortalUser, PortalUserRole
from app.security.cml_assertion import AssertionDenied
from app.security.web_access import MODULES
from app.services.cml_identity import resolve_identity


def test_every_module_combination_is_exact_and_local_account_must_remain_active():
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
            user = PortalUser(
                id=1,
                first_name="Synthetic",
                last_name="Member",
                email="synthetic@example.invalid",
                password_hash="unused",
                is_active=True,
                preferred_locale="uk",
                roles=[PortalUserRole(role="recepce")],
            )
            db.add(user)
            db.commit()
            for count in range(1, 6):
                for values in itertools.combinations(MODULES, count):
                    claims["grant"] = {
                        "contract": "kajovo-web-grant/1",
                        "permissions": list(values),
                        "dataScope": {"kind": "service"},
                    }
                    result = resolve_identity(db, claims, None)
                    expected = {
                        MODULES[value] + ":" + action
                        for value in values
                        for action in ("read", "write")
                    }
                    assert set(result["public"]["permissions"]) == expected
                    assert set(result["public"]["available_permissions"]) == expected
                    assert result["public"]["admin"] is False
                    assert result["state"]["_kajovo_auth_session"]["portal_user_id"] == 1
            claims.pop("grant")
            with pytest.raises(AssertionDenied):
                resolve_identity(db, claims, None)
            claims["grant"] = {
                "contract": "kajovo-web-grant/1",
                "permissions": ["hotel.rooms"],
                "dataScope": {"kind": "service"},
            }
            user.is_active = False
            db.commit()
            with pytest.raises(AssertionDenied):
                resolve_identity(db, claims, None)
    finally:
        engine.dispose()


def test_explicit_module_manager_can_use_admin_module_actions_only():
    from fastapi import HTTPException
    from starlette.requests import Request

    from app.api.routes.breakfast import _is_breakfast_manager
    from app.api.routes.issues import _guard_issue_update
    from app.security.rbac import require_role

    session = {
        "email": "synthetic@example.invalid",
        "actor_type": "portal",
        "role": "recepce",
        "active_role": "recepce",
        "cml_permissions": [
            "inventory:read",
            "inventory:write",
            "issues:read",
            "issues:write",
            "breakfast:read",
            "breakfast:write",
        ],
    }

    def request(path):
        return Request(
            {
                "type": "http",
                "method": "DELETE",
                "path": path,
                "headers": [],
                "state": {"_kajovo_auth_session": session},
            }
        )

    require_role("admin")(request("/api/v1/inventory/1"))
    _guard_issue_update("recepce", None, {"title": "Allowed"}, request("/api/v1/issues/1"))
    assert _is_breakfast_manager("pokojská", request("/api/v1/breakfast/1"))
    with pytest.raises(HTTPException):
        require_role("admin")(request("/api/v1/admin/settings/smtp"))


def test_report_migration_preserves_source_rows_and_photo_metadata():
    from importlib.util import module_from_spec, spec_from_file_location
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text

    from app.db.models import Issue, IssuePhoto, Report, ReportPhoto

    path = Path(__file__).parents[1] / "alembic/versions/0054_merge_reports_into_issues.py"
    spec = spec_from_file_location("report_migration", path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    try:
        with engine.begin() as connection:
            connection.execute(
                Report.__table__.insert().values(
                    id=7,
                    title="Synthetic report",
                    description="Original description",
                    status="closed",
                )
            )
            connection.execute(
                ReportPhoto.__table__.insert().values(
                    report_id=7,
                    sort_order=2,
                    file_path="synthetic/full.jpg",
                    thumb_path="synthetic/thumb.jpg",
                    mime_type="image/jpeg",
                    size_bytes=123,
                )
            )
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            issue = connection.execute(Issue.__table__.select()).mappings().one()
            photo = connection.execute(IssuePhoto.__table__.select()).mappings().one()
            assert issue["title"] == "Synthetic report" and issue["status"] == "closed"
            assert (
                photo["issue_id"] == issue["id"]
                and photo["file_path"] == "synthetic/full.jpg"
                and photo["sort_order"] == 2
            )
            assert (
                connection.execute(text("SELECT report_id FROM legacy_report_issue")).scalar_one()
                == 7
            )
            assert (
                connection.execute(Report.__table__.select()).mappings().one()["description"]
                == "Original description"
            )
    finally:
        engine.dispose()
