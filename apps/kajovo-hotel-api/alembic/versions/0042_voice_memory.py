"""Hotel-owned voice memory; additive PostgreSQL/SQLite schema."""

import sqlalchemy as sa
from alembic import op

revision = "0042_voice_memory"
down_revision = "0041_voice_smart_deliveries"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "voice_memory_principals",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column(
            "portal_user_id",
            sa.Integer(),
            sa.ForeignKey("portal_users.id", ondelete="CASCADE"),
            primary_key=False,
            nullable=True,
        ),
        sa.Column(
            "admin_profile_id",
            sa.Integer(),
            sa.ForeignKey("admin_profile.id", ondelete="CASCADE"),
            primary_key=False,
            nullable=True,
        ),
        sa.UniqueConstraint("admin_profile_id", name=None),
        sa.UniqueConstraint("portal_user_id", name=None),
        sa.CheckConstraint(
            "(portal_user_id IS NULL) <> (admin_profile_id IS NULL)", name="ck_voice_memory_owner"
        ),
    )
    op.create_table(
        "voice_memory_settings",
        sa.Column(
            "principal_id",
            sa.String(length=36),
            sa.ForeignKey("voice_memory_principals.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("automatic", sa.Boolean(), primary_key=False, nullable=False),
        sa.Column("revision", sa.Integer(), primary_key=False, nullable=False),
        sa.Column("generation", sa.Integer(), primary_key=False, nullable=False),
    )
    op.create_table(
        "voice_memories",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column(
            "principal_id",
            sa.String(length=36),
            sa.ForeignKey("voice_memory_principals.id", ondelete="CASCADE"),
            primary_key=False,
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=24), primary_key=False, nullable=False),
        sa.Column("subject", sa.String(length=160), primary_key=False, nullable=False),
        sa.Column("content", sa.Text(), primary_key=False, nullable=False),
        sa.Column("tags", sa.JSON(), primary_key=False, nullable=False),
        sa.Column("search_text", sa.Text(), primary_key=False, nullable=False),
        sa.Column("status", sa.String(length=16), primary_key=False, nullable=False),
        sa.Column("origin", sa.String(length=16), primary_key=False, nullable=False),
        sa.Column("pinned", sa.Boolean(), primary_key=False, nullable=False),
        sa.Column("importance", sa.Integer(), primary_key=False, nullable=False),
        sa.Column("source_session_id", sa.String(length=128), primary_key=False, nullable=True),
        sa.Column("revision", sa.Integer(), primary_key=False, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), primary_key=False, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), primary_key=False, nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), primary_key=False, nullable=True),
    )
    op.create_index(
        "ix_voice_memory_context",
        "voice_memories",
        ["principal_id", "status", "pinned", "importance", "updated_at"],
    )
    op.create_index("ix_voice_memories_principal_id", "voice_memories", ["principal_id"])
    op.create_index("ix_voice_memories_status", "voice_memories", ["status"])
    op.create_index("ix_voice_memories_updated_at", "voice_memories", ["updated_at"])
    op.create_table(
        "voice_memory_revisions",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column(
            "memory_id",
            sa.String(length=36),
            sa.ForeignKey("voice_memories.id", ondelete="CASCADE"),
            primary_key=False,
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), primary_key=False, nullable=False),
        sa.Column("subject", sa.String(length=160), primary_key=False, nullable=False),
        sa.Column("content", sa.Text(), primary_key=False, nullable=False),
        sa.Column("status", sa.String(length=16), primary_key=False, nullable=False),
        sa.Column("source_session_id", sa.String(length=128), primary_key=False, nullable=True),
        sa.Column("reason", sa.String(length=24), primary_key=False, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), primary_key=False, nullable=False),
        sa.UniqueConstraint("memory_id", "revision", name="uq_voice_memory_revision"),
    )
    op.create_index("ix_voice_memory_revisions_memory_id", "voice_memory_revisions", ["memory_id"])
    op.create_table(
        "voice_notes",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column(
            "principal_id",
            sa.String(length=36),
            sa.ForeignKey("voice_memory_principals.id", ondelete="CASCADE"),
            primary_key=False,
            nullable=False,
        ),
        sa.Column("title", sa.String(length=160), primary_key=False, nullable=False),
        sa.Column("normalized_title", sa.String(length=320), primary_key=False, nullable=False),
        sa.Column("kind", sa.String(length=8), primary_key=False, nullable=False),
        sa.Column("content", sa.Text(), primary_key=False, nullable=True),
        sa.Column("status", sa.String(length=16), primary_key=False, nullable=False),
        sa.Column("revision", sa.Integer(), primary_key=False, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), primary_key=False, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), primary_key=False, nullable=False),
    )
    op.create_index(
        "ix_voice_note_owner_status", "voice_notes", ["principal_id", "status", "updated_at"]
    )
    op.create_index("ix_voice_notes_normalized_title", "voice_notes", ["normalized_title"])
    op.create_index("ix_voice_notes_principal_id", "voice_notes", ["principal_id"])
    op.create_table(
        "voice_note_items",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column(
            "note_id",
            sa.String(length=36),
            sa.ForeignKey("voice_notes.id", ondelete="CASCADE"),
            primary_key=False,
            nullable=False,
        ),
        sa.Column("content", sa.Text(), primary_key=False, nullable=False),
        sa.Column("position", sa.Integer(), primary_key=False, nullable=False),
        sa.CheckConstraint("position >= 0", name="ck_voice_note_position"),
        sa.UniqueConstraint("note_id", "position", name="uq_voice_note_position"),
    )
    op.create_index("ix_voice_note_items_note_id", "voice_note_items", ["note_id"])
    op.create_table(
        "voice_conversation_summaries",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column(
            "principal_id",
            sa.String(length=36),
            sa.ForeignKey("voice_memory_principals.id", ondelete="CASCADE"),
            primary_key=False,
            nullable=False,
        ),
        sa.Column("session_id", sa.String(length=128), primary_key=False, nullable=False),
        sa.Column("topics", sa.JSON(), primary_key=False, nullable=False),
        sa.Column("content", sa.Text(), primary_key=False, nullable=False),
        sa.Column("decisions", sa.JSON(), primary_key=False, nullable=False),
        sa.Column("open_points", sa.JSON(), primary_key=False, nullable=False),
        sa.Column("continuation", sa.String(length=400), primary_key=False, nullable=False),
        sa.Column("memory_ids", sa.JSON(), primary_key=False, nullable=False),
        sa.Column("source_note_ids", sa.JSON(), nullable=False),
        sa.Column("search_text", sa.Text(), primary_key=False, nullable=False),
        sa.Column("revision", sa.Integer(), primary_key=False, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), primary_key=False, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), primary_key=False, nullable=False),
        sa.UniqueConstraint("principal_id", "session_id", name="uq_voice_summary_session"),
    )
    op.create_index(
        "ix_voice_conversation_summaries_created_at", "voice_conversation_summaries", ["created_at"]
    )
    op.create_index(
        "ix_voice_conversation_summaries_principal_id",
        "voice_conversation_summaries",
        ["principal_id"],
    )
    op.create_index(
        "ix_voice_summary_owner_recency",
        "voice_conversation_summaries",
        ["principal_id", "updated_at"],
    )
    op.create_table(
        "voice_memory_operations",
        sa.Column("id", sa.String(length=64), primary_key=True, nullable=False),
        sa.Column(
            "principal_id",
            sa.String(length=36),
            sa.ForeignKey("voice_memory_principals.id", ondelete="CASCADE"),
            primary_key=False,
            nullable=False,
        ),
        sa.Column("session_id", sa.String(length=128), primary_key=False, nullable=False),
        sa.Column("call_id", sa.String(length=128), primary_key=False, nullable=False),
        sa.Column("operation", sa.String(length=32), primary_key=False, nullable=False),
        sa.Column("arguments_digest", sa.String(length=64), primary_key=False, nullable=False),
        sa.Column("result_code", sa.String(length=24), primary_key=False, nullable=False),
        sa.Column("entity_id", sa.String(length=36), primary_key=False, nullable=True),
        sa.Column("entity_revision", sa.Integer(), primary_key=False, nullable=True),
        sa.Column("delivered", sa.Boolean(), primary_key=False, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), primary_key=False, nullable=False),
        sa.UniqueConstraint("principal_id", "session_id", "call_id", name="uq_voice_memory_call"),
    )
    op.create_index(
        "ix_voice_memory_operations_principal_id", "voice_memory_operations", ["principal_id"]
    )

    op.create_table(
        "voice_memory_dependencies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "memory_id",
            sa.String(36),
            sa.ForeignKey("voice_memories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_memory_id",
            sa.String(36),
            sa.ForeignKey("voice_memories.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "source_note_id", sa.String(36), sa.ForeignKey("voice_notes.id", ondelete="CASCADE")
        ),
        sa.CheckConstraint(
            "(source_memory_id IS NULL) <> (source_note_id IS NULL)",
            name="ck_voice_memory_dependency_source",
        ),
        sa.UniqueConstraint(
            "memory_id", "source_memory_id", name="uq_voice_memory_dependency_memory"
        ),
        sa.UniqueConstraint("memory_id", "source_note_id", name="uq_voice_memory_dependency_note"),
    )
    for field in ["memory_id", "source_memory_id", "source_note_id"]:
        op.create_index(
            "ix_voice_memory_dependencies_" + field, "voice_memory_dependencies", [field]
        )


def downgrade():
    op.drop_table("voice_memory_dependencies")
    op.drop_table("voice_memory_operations")
    op.drop_table("voice_conversation_summaries")
    op.drop_table("voice_note_items")
    op.drop_table("voice_notes")
    op.drop_table("voice_memory_revisions")
    op.drop_table("voice_memories")
    op.drop_table("voice_memory_settings")
    op.drop_table("voice_memory_principals")
