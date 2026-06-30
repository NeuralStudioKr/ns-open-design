from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import ANY, AsyncMock, MagicMock

import pytest
from teamver_app_sdk.errors import (
    DriveConfirmError,
    DriveUploadError,
    TeamverAPIError,
)

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


def _daemon_mock(*, live_name: str | None = None) -> AsyncMock:
    """Build a daemon AsyncMock with `get_project_name` pinned.

    publish_project now calls `daemon.get_project_name(...)` so the Drive
    filename can follow in-editor renames. Without an explicit return_value
    AsyncMock would auto-vend a MagicMock that leaks into `_publish_filename`
    and corrupts the filename derivation. Tests that don't care about live
    naming should pass `live_name=None` (the default) to preserve the legacy
    `project.title` → artifact-basename fallback chain.
    """
    daemon = AsyncMock()
    daemon.get_project_name = AsyncMock(return_value=live_name)
    return daemon


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
            od_daemon=_daemon_mock(),
        )


@pytest.mark.asyncio
async def test_publish_project_html_uploads_and_persists():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
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

    daemon = _daemon_mock()
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
async def test_publish_project_uses_artifact_filename_when_title_is_generic_and_caps_length():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    project = _project()
    project.title = "design"
    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = {
        "entryFile": "exports/this-is-a-very-long-generated-slide-deck-name-that-should-not-become-an-overlong-drive-file.html",
    }
    daemon.get_export_inline.return_value = b"<html>ok</html>"

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-FILENAME")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=project,
        formats=["html"],
        artifact_file=None,
        folder_id=None,
        od_daemon=daemon,
    )

    filename = result.outputs[0].filename
    assert filename is not None
    assert filename.endswith(".html")
    assert filename != "design.html"
    assert len(filename) <= 80
    assert filename.startswith("this-is-a-very-long-generated-slide-deck-name")
    teamver_client.drive.create_upload_request.assert_awaited_once()
    assert teamver_client.drive.create_upload_request.await_args.kwargs["filename"] == filename


@pytest.mark.asyncio
async def test_publish_project_partial_html_ok_zip_daemon_fail():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
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

    daemon = _daemon_mock()
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

    daemon = _daemon_mock()
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


def _wire_two_format_drive(
    teamver_client: MagicMock,
    *,
    html_ticket_asset: str = "AST-HTML",
    zip_ticket_asset: str = "AST-ZIP",
):
    """Helper for loop 177 partial-failure tests — html succeeds, zip fails at
    a configurable phase. Returns (mocks, html_asset) so each test can wire its
    own zip-phase exception."""
    ticket_html = MagicMock()
    ticket_html.asset_id = html_ticket_asset
    ticket_html.presigned_url = f"https://s3.example.com/upload/{html_ticket_asset}"
    ticket_zip = MagicMock()
    ticket_zip.asset_id = zip_ticket_asset
    ticket_zip.presigned_url = f"https://s3.example.com/upload/{zip_ticket_asset}"
    asset_html = MagicMock()
    asset_html.asset_id = html_ticket_asset
    create_mock = AsyncMock(side_effect=[ticket_html, ticket_zip])
    put_mock = AsyncMock()
    confirm_mock = AsyncMock(return_value=asset_html)
    teamver_client.drive.create_upload_request = create_mock
    teamver_client.drive._put_presigned_bytes = put_mock
    teamver_client.drive.confirm_upload = confirm_mock
    return create_mock, put_mock, confirm_mock


@pytest.mark.asyncio
async def test_publish_project_upload_request_phase_status_propagates():
    """loop 177 — Drive `upload_request` 4xx surfaces as
    `drive_upload_failed_<status>` instead of the generic `drive_upload_failed`,
    so staging operators can tell stale tokens (403) from rate limits (429)."""
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = {"entryFile": "deck/index.html"}
    daemon.get_export_inline.return_value = b"<html>ok</html>"
    daemon.get_archive.return_value = b"zip-bytes"

    teamver_client = MagicMock()
    ticket_html = MagicMock()
    ticket_html.asset_id = "AST-HTML"
    ticket_html.presigned_url = "https://s3.example.com/upload/AST-HTML"
    asset_html = MagicMock()
    asset_html.asset_id = "AST-HTML"
    upload_request_exc = TeamverAPIError("drive upload request rejected")
    upload_request_exc.code = None
    upload_request_exc.status_code = 403
    create_mock = AsyncMock(side_effect=[ticket_html, upload_request_exc])
    put_mock = AsyncMock()
    confirm_mock = AsyncMock(return_value=asset_html)
    teamver_client.drive.create_upload_request = create_mock
    teamver_client.drive._put_presigned_bytes = put_mock
    teamver_client.drive.confirm_upload = confirm_mock

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
    zip_output = next(out for out in result.outputs if out.kind == "zip")
    assert zip_output.publish_status == "failed"
    assert zip_output.error_code == "drive_upload_failed_403"
    # The presigned PUT must NEVER fire when the upload-request phase fails.
    assert put_mock.await_count == 1, "PUT should only run for the html (succeeding) format"
    assert confirm_mock.await_count == 1, "Confirm should only run for the html (succeeding) format"


@pytest.mark.asyncio
async def test_publish_project_presigned_put_status_propagates():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = {"entryFile": "deck/index.html"}
    daemon.get_export_inline.return_value = b"<html>ok</html>"
    daemon.get_archive.return_value = b"zip-bytes"

    teamver_client = MagicMock()
    create_mock, put_mock, confirm_mock = _wire_two_format_drive(teamver_client)
    presigned_exc = DriveUploadError("S3 PUT failed with status 502")
    presigned_exc.status_code = 502
    # html PUT ok; zip PUT 502.
    put_mock.side_effect = [None, presigned_exc]

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
    zip_output = next(out for out in result.outputs if out.kind == "zip")
    assert zip_output.error_code == "drive_presigned_put_failed_502"
    # Confirm must NEVER fire on a failed PUT — that would hand the user a
    # falsely-finalised asset row.
    assert confirm_mock.await_count == 1, "Confirm runs only for html"


@pytest.mark.asyncio
async def test_publish_project_confirm_failure_uses_confirm_code():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = {"entryFile": "deck/index.html"}
    daemon.get_export_inline.return_value = b"<html>ok</html>"
    daemon.get_archive.return_value = b"zip-bytes"

    teamver_client = MagicMock()
    _create, _put, confirm_mock = _wire_two_format_drive(teamver_client)
    confirm_exc = DriveConfirmError("drive confirm failed")
    confirm_exc.status_code = 504
    confirm_exc.code = "drive.confirm_timeout"
    # html confirm ok; zip confirm raises.
    confirm_mock.side_effect = [confirm_mock.return_value, confirm_exc]

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

    zip_output = next(out for out in result.outputs if out.kind == "zip")
    assert zip_output.error_code == "drive.confirm_timeout"


# ---------------------------------------------------------------------------
# Publish filename: live daemon project name takes precedence over the stale
# `project.title` cached in the design-api registry. See
# `_publish_filename` in publish_service.py and the matching plan task
# `drive-live-name`.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_publish_filename_prefers_live_daemon_name_over_stale_registry_title():
    """The daemon is the source of truth for the user-facing project name.

    Registry rows are stamped with a slug at create time (here:
    "ai-adoption-deck"); when the user later renames the project in the
    editor that change never reaches the registry. The Drive filename must
    follow the live name ("Q4 마케팅 전략") so published files stay aligned
    with what the user sees in the editor sidebar.
    """
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    project = _project()
    project.title = "ai-adoption-deck"  # stale registry slug

    daemon = _daemon_mock(live_name="Q4 마케팅 전략")
    daemon.get_export_manifest.return_value = {"entryFile": "deck/index.html"}
    daemon.get_export_inline.return_value = b"<html>ok</html>"

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-LIVE")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=project,
        formats=["html"],
        artifact_file=None,
        folder_id=None,
        od_daemon=daemon,
    )

    assert result.outputs[0].filename == "Q4 마케팅 전략.html"
    daemon.get_project_name.assert_awaited_once_with("od1", identity=ANY)
    teamver_client.drive.create_upload_request.assert_awaited_once()
    assert (
        teamver_client.drive.create_upload_request.await_args.kwargs["filename"]
        == "Q4 마케팅 전략.html"
    )


@pytest.mark.asyncio
async def test_publish_filename_falls_back_to_registry_title_when_live_lookup_fails():
    """A failed daemon lookup must not block publish or corrupt the filename.

    If `get_project_name` raises (daemon down, transient 5xx, etc.) we keep
    the existing behavior — `project.title` from the registry — instead of
    bubbling the failure or falling all the way back to the od_project_id.
    """
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
    daemon.get_project_name.side_effect = BadGatewayError("od_daemon_export_failed")
    daemon.get_export_manifest.return_value = {"entryFile": "deck/index.html"}
    daemon.get_export_inline.return_value = b"<html>ok</html>"

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-FALLBACK")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),  # title="Landing Page"
        formats=["html"],
        artifact_file=None,
        folder_id=None,
        od_daemon=daemon,
    )

    # Stale-title fallback path: filename derived from project.title because
    # the daemon couldn't provide a live name.
    assert result.outputs[0].filename == "Landing Page.html"
    daemon.get_project_name.assert_awaited_once_with("od1", identity=ANY)


@pytest.mark.asyncio
async def test_publish_filename_skips_live_name_when_it_resolves_to_design():
    """The literal `"design"` is the legacy default everywhere in the stack.

    If the daemon happens to return it (e.g. fresh project never renamed),
    treat it as missing so the artifact / manifest basename fallback can
    surface a meaningful filename instead of `design.html`.
    """
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    project = _project()
    project.title = "design"  # also generic — falls through to manifest basename

    daemon = _daemon_mock(live_name="  design  ")  # whitespace + legacy default
    daemon.get_export_manifest.return_value = {"entryFile": "decks/q4-roadmap.html"}
    daemon.get_export_inline.return_value = b"<html>ok</html>"

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-GENERIC")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=project,
        formats=["html"],
        artifact_file=None,
        folder_id=None,
        od_daemon=daemon,
    )

    filename = result.outputs[0].filename
    assert filename is not None
    assert filename.startswith("q4-roadmap")
    assert filename.endswith(".html")
    assert filename != "design.html"
