from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, utcnow


class DesignOutput(Base):
    __tablename__ = "design_outputs"
    __table_args__ = (
        Index("idx_design_outputs_project", "project_id", "published_at"),
        Index("idx_design_outputs_drive_asset", "drive_asset_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(String, nullable=False)
    workspace_id: Mapped[str] = mapped_column(String, nullable=False)
    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    od_project_id: Mapped[str] = mapped_column(String, nullable=False)

    drive_asset_id: Mapped[str] = mapped_column(String, nullable=False)
    drive_folder_id: Mapped[str | None] = mapped_column(String, nullable=True)
    drive_shared_drive_id: Mapped[str | None] = mapped_column(String, nullable=True)

    kind: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)

    source_path: Mapped[str | None] = mapped_column(String, nullable=True)
    manifest_entry_file: Mapped[str | None] = mapped_column(String, nullable=True)
    artifact_file: Mapped[str | None] = mapped_column(String, nullable=True)
    publish_status: Mapped[str] = mapped_column(String, nullable=False, default="ready")

    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
