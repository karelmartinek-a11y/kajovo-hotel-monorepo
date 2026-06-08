"""add breakfast manual refresh jobs

Revision ID: 0027_add_breakfast_manual_refresh_jobs
Revises: 0026_breakfast_mail_autoimport
Create Date: 2026-06-08 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0027_add_breakfast_manual_refresh_jobs"
down_revision = "0026_breakfast_mail_autoimport"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "breakfast_manual_refresh_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("job_key", sa.String(length=64), nullable=False),
        sa.Column("service_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("progress_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("imported_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        op.f("ix_breakfast_manual_refresh_jobs_id"),
        "breakfast_manual_refresh_jobs",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_breakfast_manual_refresh_jobs_job_key"),
        "breakfast_manual_refresh_jobs",
        ["job_key"],
        unique=True,
    )
    op.create_index(
        op.f("ix_breakfast_manual_refresh_jobs_service_date"),
        "breakfast_manual_refresh_jobs",
        ["service_date"],
        unique=False,
    )
    op.create_index(
        op.f("ix_breakfast_manual_refresh_jobs_status"),
        "breakfast_manual_refresh_jobs",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_breakfast_manual_refresh_jobs_status"),
        table_name="breakfast_manual_refresh_jobs",
    )
    op.drop_index(
        op.f("ix_breakfast_manual_refresh_jobs_service_date"),
        table_name="breakfast_manual_refresh_jobs",
    )
    op.drop_index(
        op.f("ix_breakfast_manual_refresh_jobs_job_key"),
        table_name="breakfast_manual_refresh_jobs",
    )
    op.drop_index(
        op.f("ix_breakfast_manual_refresh_jobs_id"),
        table_name="breakfast_manual_refresh_jobs",
    )
    op.drop_table("breakfast_manual_refresh_jobs")
