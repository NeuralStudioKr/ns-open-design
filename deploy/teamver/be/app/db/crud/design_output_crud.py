from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import DesignOutput
from ..newid import new_design_output_id
from ..models.base import utcnow


async def acreate_output(
    db: AsyncSession,
    *,
    project_id: str,
    workspace_id: str,
    owner_user_id: str,
    od_project_id: str,
    drive_asset_id: str,
    drive_folder_id: str | None,
    kind: str,
    mime_type: str,
    filename: str,
    size_bytes: int,
    drive_shared_drive_id: str | None = None,
    source_path: str | None = None,
    manifest_entry_file: str | None = None,
    artifact_file: str | None = None,
    publish_status: str = "ready",
) -> DesignOutput:
    now = utcnow()
    row = DesignOutput(
        id=new_design_output_id(),
        project_id=project_id,
        workspace_id=workspace_id,
        owner_user_id=owner_user_id,
        od_project_id=od_project_id,
        drive_asset_id=drive_asset_id,
        drive_folder_id=drive_folder_id,
        drive_shared_drive_id=drive_shared_drive_id,
        kind=kind,
        mime_type=mime_type,
        filename=filename,
        size_bytes=max(0, size_bytes),
        source_path=source_path,
        manifest_entry_file=manifest_entry_file,
        artifact_file=artifact_file,
        publish_status=publish_status,
        published_at=now,
        created_at=now,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def alist_outputs_for_project(
    db: AsyncSession,
    *,
    project_id: str,
) -> list[DesignOutput]:
    stmt = (
        select(DesignOutput)
        .where(DesignOutput.project_id == project_id)
        .order_by(DesignOutput.published_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
