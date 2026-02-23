"""placeholder for legacy portal users + smtp baseline

Revision ID: 0008_portal_users_smtp
Revises: 0008_add_actor_identity_to_audit_trail
Create Date: 2026-02-23 23:20:00.000000
"""

from alembic import op

revision = "0008_portal_users_smtp"
down_revision = "0008_add_actor_identity_to_audit_trail"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Legacy databáze již obsahuje tabulky portal_users a smtp; pouze nastavujeme baseline.
    pass


def downgrade() -> None:
    # Bezpečně neodstraňujeme stávající schéma.
    pass
