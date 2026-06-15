from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, utcnow


class AiModelTokenUsage(Base):
    """ns-teamver-startup 동형 ORM. Docs용: ``project_id`` FK 없음 (문서 id 보관용 optional)."""

    __tablename__ = "ai_model_token_usages"
    __table_args__ = (
        Index("idx_ai_token_usages_used_at", "used_at"),
        Index("idx_ai_token_usages_workspace_id", "workspace_id"),
        Index("idx_ai_token_usages_project_id", "project_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    model_name: Mapped[str] = mapped_column(String, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    workspace_id: Mapped[str | None] = mapped_column(String, nullable=True)
    used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    operation: Mapped[str | None] = mapped_column(String, nullable=True)
    project_id: Mapped[str | None] = mapped_column(String, nullable=True)
