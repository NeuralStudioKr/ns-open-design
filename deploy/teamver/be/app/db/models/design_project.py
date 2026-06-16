from __future__ import annotations

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class DesignProject(BaseModel):
    __tablename__ = "design_projects"
    __table_args__ = (
        Index("idx_design_projects_workspace", "workspace_id", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(String, nullable=False)
    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    od_project_id: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    s3_prefix: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
