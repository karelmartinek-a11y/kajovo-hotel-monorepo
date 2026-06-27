"""Add breakfast mailbox autoimport tables.

Revision ID: 0026_breakfast_mail_autoimport
Revises: 0025_add_smtp_from_email
Create Date: 2026-05-05
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0026_breakfast_mail_autoimport"
down_revision: str | None = "0025_add_smtp_from_email"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "breakfast_import_mailbox_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("host", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("port", sa.Integer(), nullable=False, server_default="993"),
        sa.Column("use_ssl", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("mailbox", sa.String(length=128), nullable=False, server_default="INBOX"),
        sa.Column("username", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("password_encrypted", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "from_contains",
            sa.String(length=255),
            nullable=False,
            server_default="noreply=better-hotel.com@mg2.better-hotel.com",
        ),
        sa.Column("subject_contains", sa.String(length=255), nullable=False, server_default=""),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_breakfast_import_mailbox_settings_id"),
        "breakfast_import_mailbox_settings",
        ["id"],
        unique=False,
    )

    op.create_table(
        "breakfast_import_processed_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("message_uid", sa.String(length=128), nullable=False),
        sa.Column("attachment_hash", sa.String(length=128), nullable=False),
        sa.Column("parsed_day", sa.Date(), nullable=False),
        sa.Column(
            "imported_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_breakfast_import_processed_attachments_id"),
        "breakfast_import_processed_attachments",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_breakfast_import_processed_attachments_message_uid"),
        "breakfast_import_processed_attachments",
        ["message_uid"],
        unique=False,
    )
    op.create_index(
        op.f("ix_breakfast_import_processed_attachments_attachment_hash"),
        "breakfast_import_processed_attachments",
        ["attachment_hash"],
        unique=False,
    )
    op.create_index(
        op.f("ix_breakfast_import_processed_attachments_parsed_day"),
        "breakfast_import_processed_attachments",
        ["parsed_day"],
        unique=False,
    )

    op.create_table(
        "breakfast_import_run_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ok", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("trigger", sa.String(length=32), nullable=False, server_default="scheduler"),
        sa.Column("details_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_breakfast_import_run_logs_id"),
        "breakfast_import_run_logs",
        ["id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_breakfast_import_run_logs_id"), table_name="breakfast_import_run_logs")
    op.drop_table("breakfast_import_run_logs")
    op.drop_index(
        op.f("ix_breakfast_import_processed_attachments_parsed_day"),
        table_name="breakfast_import_processed_attachments",
    )
    op.drop_index(
        op.f("ix_breakfast_import_processed_attachments_attachment_hash"),
        table_name="breakfast_import_processed_attachments",
    )
    op.drop_index(
        op.f("ix_breakfast_import_processed_attachments_message_uid"),
        table_name="breakfast_import_processed_attachments",
    )
    op.drop_index(
        op.f("ix_breakfast_import_processed_attachments_id"),
        table_name="breakfast_import_processed_attachments",
    )
    op.drop_table("breakfast_import_processed_attachments")
    op.drop_index(
        op.f("ix_breakfast_import_mailbox_settings_id"),
        table_name="breakfast_import_mailbox_settings",
    )
    op.drop_table("breakfast_import_mailbox_settings")
