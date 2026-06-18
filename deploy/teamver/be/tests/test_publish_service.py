from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import ANY, AsyncMock, MagicMock

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


def _wire_drive_upload(teamver_client: MagicMock, *, asset_id: str = "AST-123") -> MagicMock:
    ticket = MagicMock()
    ticket.asset_id = asset_id
    ticket.presigned_url = f"https://s3.example.com/upload/{asset_id}"
    asset = MagicMock()
    asset.asset_id = asset_id
    teamver_client.drive.create_upload_request = AsyncMock(return_value=ticket)
    teamver_client.drive._put_presigned_bytes = AsyncMock()
    teamver_client.drive.confirm_upload = AsyncMock(return_value=asset)
    return asset


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

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-123")

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
    daemon.get_export_manifest.assert_awaited_once_with("od1", identity=ANY)
    daemon.get_export_inline.assert_awaited_once_with("od1", "deck/index.html", identity=ANY)
    teamver_client.drive.create_upload_request.assert_awaited_once_with(
        access_token="token",
        filename="Landing Page.html",
        file_size=len(b"<html>ok</html>"),
        content_type="text/html",
        folder_id=None,
        shared_drive_id=None,
    )
    teamver_client.drive._put_presigned_bytes.assert_awaited_once_with(
        "https://s3.example.com/upload/AST-123",
        content=b"<html>ok</html>",
        content_type="text/html",
    )
    teamver_client.drive.confirm_upload.assert_awaited_once_with(
        access_token="token",
        asset_id="AST-123",
    )


@pytest.mark.asyncio
async def test_publish_project_uploads_to_shared_drive_target():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = AsyncMock()
    daemon.get_export_manifest.return_value = {"entryFile": "deck/index.html"}
    daemon.get_export_inline.return_value = b"<html>ok</html>"

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-SHARED")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        formats=["html"],
        artifact_file=None,
        folder_id="FLD-TEAM",
        shared_drive_id="SD-TEAM",
        od_daemon=daemon,
    )

    assert result.outputs[0].drive_asset_id == "AST-SHARED"
    assert result.outputs[0].drive_folder_id == "FLD-TEAM"
    assert result.outputs[0].drive_shared_drive_id == "SD-TEAM"
    teamver_client.drive.create_upload_request.assert_awaited_once_with(
        access_token="token",
        filename="Landing Page.html",
        file_size=len(b"<html>ok</html>"),
        content_type="text/html",
        folder_id="FLD-TEAM",
        shared_drive_id="SD-TEAM",
    )


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

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-123")

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

    upload_exc = TeamverAPIError("drive upload failed")
    upload_exc.code = "drive_upload_failed"
    upload_exc.status_code = 502

    teamver_client = MagicMock()
    ticket_html = MagicMock()
    ticket_html.asset_id = "AST-HTML"
    ticket_html.presigned_url = "https://s3.example.com/upload/AST-HTML"
    ticket_zip = MagicMock()
    ticket_zip.asset_id = "AST-ZIP"
    ticket_zip.presigned_url = "https://s3.example.com/upload/AST-ZIP"
    asset_html = MagicMock()
    asset_html.asset_id = "AST-HTML"
    teamver_client.drive.create_upload_request = AsyncMock(
        side_effect=[ticket_html, ticket_zip],
    )
    teamver_client.drive._put_presigned_bytes = AsyncMock()
    teamver_client.drive.confirm_upload = AsyncMock(
        side_effect=[asset_html, upload_exc],
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
