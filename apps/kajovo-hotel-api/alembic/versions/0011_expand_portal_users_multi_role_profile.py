"""expand portal users profile and add multi-role table

Revision ID: 0011_expand_portal_users_multi_role_profile
Revises: 0010_create_portal_smtp_settings_table
Create Date: 2026-02-23 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0011_expand_portal_users_multi_role_profile"
down_revision: str | None = "0010_create_portal_smtp_settings_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


ROLE_MAP = {
    "maintenance": "údržba",
    "reception": "recepce",
    "warehouse": "snídaně",
    "manager": "recepce",
    "admin": "recepce",
}


ALLOWED = {"pokojská", "údržba", "recepce", "snídaně"}


def _normalize_role(role: str) -> str:
    value = (role or "").strip().lower()
    mapped = ROLE_MAP.get(value, value)
    if mapped in ALLOWED:
        return mapped
    return "recepce"


def upgrade() -> None:
    op.add_column("portal_users", sa.Column("first_name", sa.String(length=120), nullable=True))
    op.add_column("portal_users", sa.Column("last_name", sa.String(length=120), nullable=True))
    op.add_column("portal_users", sa.Column("phone", sa.String(length=16), nullable=True))
    op.add_column("portal_users", sa.Column("note", sa.Text(), nullable=True))

    bind = op.get_bind()
    users = bind.execute(sa.text("SELECT id, email FROM portal_users")).fetchall()
    for user_id, email in users:
        local = (email or "user").split("@", 1)[0]
        bind.execute(
            sa.text(
                "UPDATE portal_users SET first_name = :first_name, last_name = :last_name WHERE id = :id"
            ),
            {"id": user_id, "first_name": local[:120] or "User", "last_name": "User"},
        )

    op.alter_column("portal_users", "first_name", existing_type=sa.String(length=120), nullable=False)
    op.alter_column("portal_users", "last_name", existing_type=sa.String(length=120), nullable=False)

    op.create_table(
        "portal_user_roles",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["portal_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "role"),
    )
    op.create_index(op.f("ix_portal_user_roles_role"), "portal_user_roles", ["role"], unique=False)

    legacy_roles = bind.execute(sa.text("SELECT id, role FROM portal_users")).fetchall()
    for user_id, role in legacy_roles:
        bind.execute(
            sa.text("INSERT INTO portal_user_roles (user_id, role) VALUES (:user_id, :role)"),
            {"user_id": user_id, "role": _normalize_role(role)},
        )

    op.drop_index(op.f("ix_portal_users_role"), table_name="portal_users")
    op.drop_column("portal_users", "role")


def downgrade() -> None:
    op.add_column("portal_users", sa.Column("role", sa.String(length=64), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT pu.id, COALESCE(MIN(pur.role), 'recepce') AS role
            FROM portal_users pu
            LEFT JOIN portal_user_roles pur ON pur.user_id = pu.id
            GROUP BY pu.id
            """
        )
    ).fetchall()
    for user_id, role in rows:
        bind.execute(
            sa.text("UPDATE portal_users SET role = :role WHERE id = :id"),
            {"id": user_id, "role": role},
        )

    op.alter_column("portal_users", "role", existing_type=sa.String(length=64), nullable=False)
    op.create_index(op.f("ix_portal_users_role"), "portal_users", ["role"], unique=False)

    op.drop_index(op.f("ix_portal_user_roles_role"), table_name="portal_user_roles")
    op.drop_table("portal_user_roles")

    op.drop_column("portal_users", "note")
    op.drop_column("portal_users", "phone")
    op.drop_column("portal_users", "last_name")
    op.drop_column("portal_users", "first_name")
