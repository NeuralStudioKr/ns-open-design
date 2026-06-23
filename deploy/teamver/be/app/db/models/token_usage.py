from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, utcnow


class AiModelTokenUsage(Base):
    """Per-run model usage ledger — tokens + billing snapshot (Registry Phase 2)."""

    __tablename__ = "ai_model_token_usages"
    __table_args__ = (
        Index("idx_ai_token_usages_used_at", "used_at"),
        Index("idx_ai_token_usages_workspace_id", "workspace_id"),
        Index("idx_ai_token_usages_project_id", "project_id"),
        Index("idx_ai_token_usages_run_id", "run_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    model_name: Mapped[str] = mapped_column(String, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    workspace_id: Mapped[str | None] = mapped_column(String, nullable=True)
    used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    operation: Mapped[str | None] = mapped_column(String, nullable=True)
    project_id: Mapped[str | None] = mapped_column(String, nullable=True)
    run_id: Mapped[str | None] = mapped_column(String, nullable=True)
    run_status: Mapped[str | None] = mapped_column(String, nullable=True)
    token_count_source: Mapped[str] = mapped_column(String, nullable=False, default="unknown")
    registry_usage_id: Mapped[str | None] = mapped_column(String, nullable=True)
    billing_status: Mapped[str] = mapped_column(String, nullable=False, default="not_attempted")
    credits_committed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
