from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.db.models import DesignProject
from app.errors import BadRequestError, UnauthorizedError
from app.services.publish_service import publish_project


def _project() -> DesignProject:
    row = DesignProject(
        id="DPRJ-TEST",
        workspace_id="ws1",
        owner_user_id="u1",
        od_project_id="od1",
        s3_prefix="design/ws_ws1/user_u1/proj_od1/",
        title="Landing Page",
        status="active",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    return row


@pytest.mark.asyncio
async def test_publish_project_requires_access_token():
    db = AsyncMock()
    client = MagicMock()

    with pytest.raises(UnauthorizedError):
        await publish_project(
            db,
            teamver_client=client,
            access_token=None,
            project=_project(),
            formats=["html"],
            artifact_file="index.html",
            folder_id=None,
        )


@pytest.mark.asyncio
async def test_publish_project_rejects_unsupported_format():
    db = AsyncMock()
    client = MagicMock()

    with pytest.raises(BadRequestError):
        await publish_project(
            db,
            teamver_client=client,
            access_token="token",
            project=_project(),
            formats=["pdf"],
            artifact_file=None,
            folder_id=None,
            od_daemon=AsyncMock(),
        )


@pytest.mark.asyncio
async def test_publish_project_html_uploads_and_persists():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = AsyncMock()
    daemon.get_export_manifest.return_value = {"entryFile": "deck/index.html"}
    daemon.get_export_inline.return_value = b"<html>ok</html>"

    asset = MagicMock()
    asset.asset_id = "AST-123"

    teamver_client = MagicMock()
    teamver_client.drive.upload_bytes_to_personal_drive = AsyncMock(return_value=asset)

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        formats=["html"],
        artifact_file=None,
        folder_id=None,
        od_daemon=daemon,
    )

    assert result.project_id == "DPRJ-TEST"
    assert len(result.outputs) == 1
    assert result.outputs[0].kind == "html"
    assert result.outputs[0].drive_asset_id == "AST-123"
    daemon.get_export_inline.assert_awaited_once_with("od1", "deck/index.html")
    teamver_client.drive.upload_bytes_to_personal_drive.assert_awaited_once()
