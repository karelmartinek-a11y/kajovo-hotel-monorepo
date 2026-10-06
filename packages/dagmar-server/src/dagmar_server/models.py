"""Dagmar-owned storage metadata, independent of every host business schema."""
from datetime import datetime
from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class DagmarBase(DeclarativeBase):
    pass

class VoiceCoreSettings(DagmarBase):
    __tablename__ = "dagmar_voice_core_settings"
    __table_args__ = (CheckConstraint("id = 1", name="dagmar_dagmar_voice_core_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    config_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    encrypted_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)


class VoiceSmartOperation(DagmarBase):
    """Idempotency/recovery metadata only: no arguments, device values or transcripts."""
    __tablename__ = "dagmar_voice_smart_operations"
    __table_args__ = (UniqueConstraint("owner_session_id", "call_id", name="dagmar_uq_voice_smart_provider_call"),)

    request_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    owner_session_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    call_id: Mapped[str] = mapped_column(String(128), nullable=False)
    arguments_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VoiceSmartDelivery(DagmarBase):
    """Provider delivery receipt only; no tool output, image or transcript storage."""
    __tablename__ = "dagmar_voice_smart_deliveries"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    owner_session_id: Mapped[str] = mapped_column(String(128), nullable=False)
    arguments_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VoiceRegistryPlan(DagmarBase):
    """Confirmation metadata only. Plan names, transcripts and audio stay transient."""
    __tablename__ = "dagmar_voice_registry_plans"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    owner_session_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    voice_session_id: Mapped[str] = mapped_column(String(32), nullable=False)
    plan_id: Mapped[str] = mapped_column(String(256), nullable=False)
    digest: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    requires_confirmation: Mapped[bool] = mapped_column(Boolean, nullable=False)
    response_id: Mapped[str | None] = mapped_column(String(128))
    input_event_id: Mapped[str | None] = mapped_column(String(256))
    confirmation_id: Mapped[str | None] = mapped_column(String(80))
    request_id: Mapped[str | None] = mapped_column(String(80), unique=True)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VoiceMemoryPrincipal(DagmarBase):
    __tablename__ = "dagmar_voice_memory_principals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # Imported author references are lineage metadata, never foreign keys to a host.
    portal_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    admin_profile_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    namespace: Mapped[str | None] = mapped_column(String(256), unique=True)


class VoiceMemorySettings(DagmarBase):
    __tablename__ = "dagmar_voice_memory_settings"
    principal_id: Mapped[str] = mapped_column(
        ForeignKey("dagmar_voice_memory_principals.id", ondelete="CASCADE"), primary_key=True
    )
    automatic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    generation: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class VoiceMemory(DagmarBase):
    __tablename__ = "dagmar_voice_memories"
    __table_args__ = (
        Index(
            "ix_dagmar_voice_memory_context",
            "principal_id",
            "status",
            "pinned",
            "importance",
            "updated_at",
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    principal_id: Mapped[str] = mapped_column(
        ForeignKey("dagmar_voice_memory_principals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    search_text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", index=True
    )
    origin: Mapped[str] = mapped_column(String(16), nullable=False)
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    importance: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    source_session_id: Mapped[str | None] = mapped_column(String(128))
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    origin_principal_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    creator_namespace: Mapped[str | None] = mapped_column(String(256), nullable=True)


class VoiceMemoryRevision(DagmarBase):
    __tablename__ = "dagmar_voice_memory_revisions"
    __table_args__ = (
        UniqueConstraint("memory_id", "revision", name="dagmar_uq_voice_memory_revision"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    memory_id: Mapped[str] = mapped_column(
        ForeignKey("dagmar_voice_memories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    source_session_id: Mapped[str | None] = mapped_column(String(128))
    reason: Mapped[str] = mapped_column(String(24), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class VoiceNote(DagmarBase):
    __tablename__ = "dagmar_voice_notes"
    __table_args__ = (
        Index("ix_dagmar_voice_note_owner_status", "principal_id", "status", "updated_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    principal_id: Mapped[str] = mapped_column(
        ForeignKey("dagmar_voice_memory_principals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    normalized_title: Mapped[str] = mapped_column(
        String(320), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    origin_principal_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    creator_namespace: Mapped[str | None] = mapped_column(String(256), nullable=True)


class VoiceNoteItem(DagmarBase):
    __tablename__ = "dagmar_voice_note_items"
    __table_args__ = (
        UniqueConstraint("note_id", "position", name="dagmar_uq_voice_note_position"),
        CheckConstraint("position >= 0", name="dagmar_ck_voice_note_position"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    note_id: Mapped[str] = mapped_column(
        ForeignKey("dagmar_voice_notes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)


class VoiceConversationSummary(DagmarBase):
    __tablename__ = "dagmar_voice_conversation_summaries"
    __table_args__ = (
        UniqueConstraint("principal_id", "creator_namespace", "session_id", name="dagmar_uq_voice_summary_session"),
        Index("ix_dagmar_voice_summary_owner_recency", "principal_id", "updated_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    principal_id: Mapped[str] = mapped_column(
        ForeignKey("dagmar_voice_memory_principals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[str] = mapped_column(String(128), nullable=False)
    topics: Mapped[list] = mapped_column(JSON, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    decisions: Mapped[list] = mapped_column(JSON, nullable=False)
    open_points: Mapped[list] = mapped_column(JSON, nullable=False)
    continuation: Mapped[str] = mapped_column(String(400), nullable=False)
    memory_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    source_note_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    search_text: Mapped[str] = mapped_column(Text, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    origin_principal_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    creator_namespace: Mapped[str | None] = mapped_column(String(256), nullable=True)


class VoiceMemoryOperation(DagmarBase):
    __tablename__ = "dagmar_voice_memory_operations"
    __table_args__ = (
        UniqueConstraint(
            "principal_id", "receipt_namespace", "session_id", "call_id", name="dagmar_uq_voice_memory_call"
        ),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    principal_id: Mapped[str] = mapped_column(
        ForeignKey("dagmar_voice_memory_principals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[str] = mapped_column(String(128), nullable=False)
    call_id: Mapped[str] = mapped_column(String(128), nullable=False)
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    arguments_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    result_code: Mapped[str] = mapped_column(String(24), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(36))
    entity_revision: Mapped[int | None] = mapped_column(Integer)
    delivered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    origin_principal_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    creator_namespace: Mapped[str | None] = mapped_column(String(256), nullable=True)

    receipt_namespace: Mapped[str] = mapped_column(String(256), nullable=False, default="legacy-unknown")


class VoiceMemoryDependency(DagmarBase):
    __tablename__ = "dagmar_voice_memory_dependencies"
    __table_args__ = (
        CheckConstraint(
            "(source_memory_id IS NULL) <> (source_note_id IS NULL)",
            name="dagmar_ck_voice_memory_dependency_source",
        ),
        UniqueConstraint(
            "memory_id", "source_memory_id", name="dagmar_uq_voice_memory_dependency_memory"
        ),
        UniqueConstraint(
            "memory_id", "source_note_id", name="dagmar_uq_voice_memory_dependency_note"
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    memory_id: Mapped[str] = mapped_column(
        ForeignKey("dagmar_voice_memories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_memory_id: Mapped[str | None] = mapped_column(
        ForeignKey("dagmar_voice_memories.id", ondelete="CASCADE"), index=True
    )
    source_note_id: Mapped[str | None] = mapped_column(
        ForeignKey("dagmar_voice_notes.id", ondelete="CASCADE"), index=True
    )


class LogicalCall(DagmarBase):
    """Owner-isolated lifecycle and one greeting, independent of provider connections."""
    __tablename__ = "dagmar_logical_calls"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_session_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    open: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    greeting: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    greeting_response_id: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
