from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import DesignProject
from ..newid import new_design_project_id

_S3_SEGMENT_RE = re.compile(r"[^a-zA-Z0-9._-]+")


def sanitize_s3_path_segment(value: str) -> str:
    cleaned = _S3_SEGMENT_RE.sub("_", value.strip())
    return (cleaned[:128] or "unknown")


def build_project_s3_prefix(
    *,
    workspace_id: str,
    owner_user_id: str,
    od_project_id: str,
) -> str:
    ws = sanitize_s3_path_segment(workspace_id)
    user = sanitize_s3_path_segment(owner_user_id)
    proj = sanitize_s3_path_segment(od_project_id)
    return f"design/ws_{ws}/user_{user}/proj_{proj}/"


async def acreate_project(
    db: AsyncSession,
    *,
    workspace_id: str,
    owner_user_id: str,
    od_project_id: str | None = None,
    title: str | None = None,
) -> DesignProject:
    project_id = new_design_project_id()
    od_id = (od_project_id or project_id).strip()
    row = DesignProject(
        id=project_id,
        workspace_id=workspace_id,
        owner_user_id=owner_user_id,
        od_project_id=od_id,
        s3_prefix=build_project_s3_prefix(
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
            od_project_id=od_id,
        ),
        title=(title or "").strip() or None,
        status="active",
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def alist_active_projects(
    db: AsyncSession,
    *,
    workspace_id: str,
    owner_user_id: str | None = None,
) -> list[DesignProject]:
    stmt = (
        select(DesignProject)
        .where(
            DesignProject.workspace_id == workspace_id,
            DesignProject.status == "active",
        )
        .order_by(DesignProject.updated_at.desc())
    )
    if owner_user_id:
        stmt = stmt.where(DesignProject.owner_user_id == owner_user_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def aget_project_by_od_id(
    db: AsyncSession,
    *,
    od_project_id: str,
) -> DesignProject | None:
    stmt = select(DesignProject).where(DesignProject.od_project_id == od_project_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def aget_project_by_id(
    db: AsyncSession,
    *,
    project_id: str,
) -> DesignProject | None:
    stmt = select(DesignProject).where(DesignProject.id == project_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def aget_project_by_ref(
    db: AsyncSession,
    *,
    project_ref: str,
) -> DesignProject | None:
    ref = project_ref.strip()
    if not ref:
        return None
    row = await aget_project_by_id(db, project_id=ref)
    if row is not None:
        return row
    return await aget_project_by_od_id(db, od_project_id=ref)


async def asoft_delete_by_od_id(
    db: AsyncSession,
    *,
    od_project_id: str,
) -> DesignProject | None:
    row = await aget_project_by_od_id(db, od_project_id=od_project_id)
    if row is None:
        return None
    row.status = "deleted"
    await db.flush()
    await db.refresh(row)
    return row
