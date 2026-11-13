"""Merge legacy reports and photos into the issue register without losing provenance."""

import sqlalchemy as sa

from alembic import op

revision = "0054_merge_reports_into_issues"
down_revision = "0053_inventory_egg_orders"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "legacy_report_issue",
        sa.Column("report_id", sa.Integer(), primary_key=True),
        sa.Column("issue_id", sa.Integer(), nullable=False, unique=True),
        sa.Column("source_status", sa.String(32), nullable=False),
    )
    connection = op.get_bind()
    metadata = sa.MetaData()
    reports = sa.Table("reports", metadata, autoload_with=connection)
    issues = sa.Table("issues", metadata, autoload_with=connection)
    photos = sa.Table("report_photos", metadata, autoload_with=connection)
    issue_photos = sa.Table("issue_photos", metadata, autoload_with=connection)
    mapping = sa.Table("legacy_report_issue", metadata, autoload_with=connection)
    statuses = {"open": "new", "in_progress": "in_progress", "closed": "closed"}
    for row in connection.execute(sa.select(reports).order_by(reports.c.id)).mappings():
        issue_id = connection.execute(
            issues.insert()
            .values(
                title=row["title"],
                description=row["description"],
                location="Neuvedeno v původním hlášení",
                priority="medium",
                status=statuses.get(row["status"], "new"),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            .returning(issues.c.id)
        ).scalar_one()
        connection.execute(
            mapping.insert().values(
                report_id=row["id"], issue_id=issue_id, source_status=row["status"]
            )
        )
        for photo in connection.execute(
            sa.select(photos).where(photos.c.report_id == row["id"])
        ).mappings():
            values = {
                key: photo[key]
                for key in (
                    "sort_order",
                    "file_path",
                    "thumb_path",
                    "mime_type",
                    "size_bytes",
                    "created_at",
                )
            }
            connection.execute(issue_photos.insert().values(issue_id=issue_id, **values))


def downgrade():
    raise RuntimeError("Merged issue history must survive code rollback")
