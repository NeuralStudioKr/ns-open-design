from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from teamver_app_sdk.errors import TeamverAPIError

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.db.models import DesignProject
from app.errors import BadGatewayError, BadRequestError, UnauthorizedError
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
    assert result.http_status == 201
    assert len(result.outputs) == 1
    assert result.outputs[0].kind == "html"
    assert result.outputs[0].publish_status == "ready"
    assert result.outputs[0].drive_asset_id == "AST-123"
    daemon.get_export_inline.assert_awaited_once_with("od1", "deck/index.html")
    teamver_client.drive.upload_bytes_to_personal_drive.assert_awaited_once()


@pytest.mark.asyncio
async def test_publish_project_partial_html_ok_zip_daemon_fail():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = AsyncMock()
    daemon.get_export_manifest.return_value = {"entryFile": "deck/index.html"}
    daemon.get_export_inline.return_value = b"<html>ok</html>"
    daemon.get_archive.side_effect = BadGatewayError("od_daemon_export_failed")

    asset = MagicMock()
    asset.asset_id = "AST-123"

    teamver_client = MagicMock()
    teamver_client.drive.upload_bytes_to_personal_drive = AsyncMock(return_value=asset)

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        formats=["html", "zip"],
        artifact_file=None,
        folder_id=None,
        od_daemon=daemon,
    )

    assert result.http_status == 207
    assert result.outputs[0].publish_status == "ready"
    assert result.outputs[0].kind == "html"
    assert result.outputs[1].publish_status == "failed"
    assert result.outputs[1].kind == "zip"
    assert result.outputs[1].error_code == "od_daemon_export_failed"


@pytest.mark.asyncio
async def test_publish_project_all_formats_fail_raises_bad_gateway():
    db = AsyncMock()

    daemon = AsyncMock()
    daemon.get_export_manifest.return_value = {"entryFile": "deck/index.html"}
    daemon.get_export_inline.side_effect = BadGatewayError("od_daemon_export_failed")
    daemon.get_archive.side_effect = BadGatewayError("od_daemon_export_failed")

    teamver_client = MagicMock()

    with pytest.raises(BadGatewayError, match="publish_all_failed"):
        await publish_project(
            db,
            teamver_client=teamver_client,
            access_token="token",
            project=_project(),
            formats=["html", "zip"],
            artifact_file=None,
            folder_id=None,
            od_daemon=daemon,
        )


@pytest.mark.asyncio
async def test_publish_project_partial_zip_upload_fail():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = AsyncMock()
    daemon.get_export_manifest.return_value = {"entryFile": "deck/index.html"}
    daemon.get_export_inline.return_value = b"<html>ok</html>"
    daemon.get_archive.return_value = b"zip-bytes"

    asset = MagicMock()
    asset.asset_id = "AST-HTML"

    upload_exc = TeamverAPIError("drive upload failed")
    upload_exc.code = "drive_upload_failed"
    upload_exc.status_code = 502

    teamver_client = MagicMock()
    teamver_client.drive.upload_bytes_to_personal_drive = AsyncMock(
        side_effect=[asset, upload_exc],
    )

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        formats=["html", "zip"],
        artifact_file=None,
        folder_id=None,
        od_daemon=daemon,
    )

    assert result.http_status == 207
    assert result.outputs[0].publish_status == "ready"
    assert result.outputs[1].publish_status == "failed"
    assert result.outputs[1].error_code == "drive_upload_failed"
