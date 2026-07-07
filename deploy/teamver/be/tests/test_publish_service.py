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
from app.services.od_daemon_client import OdDaemonPresignedPutError, OdExportTicket
from app.services.publish_service import publish_project


HTML_PAGE_MANIFEST = {
    "entryFile": "pages/landing.html",
    "artifacts": [{"file": "pages/landing.html", "kind": "html"}],
}
DECK_MANIFEST = {
    "entryFile": "deck/index.html",
    "artifacts": [{"file": "deck/index.html", "kind": "deck", "renderer": "deck-html"}],
}


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


def _export_ticket(
    *,
    filename: str = "Landing Page.pdf",
    mime: str = "application/pdf",
    size_bytes: int = 13,
) -> OdExportTicket:
    return OdExportTicket(
        download_url="/api/projects/od1/export/downloads/ticket-token",
        filename=filename,
        mime=mime,
        size_bytes=size_bytes,
    )


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
    daemon.stream_export_ticket_to_presigned_put = AsyncMock()
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
            formats=["pptx"],
            artifact_file=None,
            folder_id=None,
            od_daemon=_daemon_mock(),
        )


@pytest.mark.asyncio
async def test_publish_project_slide_pdf_uploads_and_persists():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = DECK_MANIFEST
    export_ticket = _export_ticket(size_bytes=len(b"%PDF-1.4 test"))
    daemon.request_export_pdf_ticket.return_value = export_ticket

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-PDF")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        formats=["pdf"],
        artifact_file="deck/index.html",
        folder_id=None,
        deck=True,
        export_title="Q4 Deck",
        od_daemon=daemon,
    )

    assert result.http_status == 201
    assert result.outputs[0].kind == "pdf"
    assert result.outputs[0].publish_status == "ready"
    assert result.outputs[0].filename == "Landing Page.pdf"
    assert result.outputs[0].mime_type == "application/pdf"
    daemon.request_export_pdf_ticket.assert_awaited_once_with(
        "od1",
        "deck/index.html",
        identity=ANY,
        deck=True,
        title="Q4 Deck",
    )
    teamver_client.drive.create_upload_request.assert_awaited_once()
    assert (
        teamver_client.drive.create_upload_request.await_args.kwargs["content_type"]
        == "application/pdf"
    )


@pytest.mark.asyncio
async def test_publish_project_pdf_uploads_via_manifest_entry():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = DECK_MANIFEST
    pdf_bytes = b"%PDF-1.4 test"
    export_ticket = _export_ticket(size_bytes=len(pdf_bytes))
    daemon.request_export_pdf_ticket.return_value = export_ticket

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-123")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        formats=["pdf"],
        artifact_file=None,
        folder_id=None,
        deck=True,
        od_daemon=daemon,
    )

    assert result.project_id == "DPRJ-TEST"
    assert result.http_status == 201
    assert len(result.outputs) == 1
    assert result.outputs[0].kind == "pdf"
    assert result.outputs[0].publish_status == "ready"
    assert result.outputs[0].drive_asset_id == "AST-123"
    daemon.get_export_manifest.assert_awaited_once_with("od1", identity=ANY)
    daemon.request_export_pdf_ticket.assert_awaited_once_with(
        "od1",
        "deck/index.html",
        identity=ANY,
        deck=True,
        title=None,
    )
    teamver_client.drive.create_upload_request.assert_awaited_once_with(
        access_token="token",
        filename="Landing Page.pdf",
        file_size=len(pdf_bytes),
        content_type="application/pdf",
        folder_id=None,
        shared_drive_id=None,
        kind="ai_generated",
    )
    daemon.stream_export_ticket_to_presigned_put.assert_awaited_once_with(
        export_ticket,
        presigned_url="https://s3.example.com/upload/AST-123",
        content_type="application/pdf",
        identity=ANY,
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
    daemon.get_export_manifest.return_value = DECK_MANIFEST
    pdf_bytes = b"%PDF-1.4 test"
    daemon.request_export_pdf_ticket.return_value = _export_ticket(size_bytes=len(pdf_bytes))

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-SHARED")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        formats=["pdf"],
        artifact_file=None,
        folder_id="FLD-TEAM",
        shared_drive_id="SD-TEAM",
        deck=True,
        od_daemon=daemon,
    )

    assert result.outputs[0].drive_asset_id == "AST-SHARED"
    assert result.outputs[0].drive_folder_id == "FLD-TEAM"
    assert result.outputs[0].drive_shared_drive_id == "SD-TEAM"
    teamver_client.drive.create_upload_request.assert_awaited_once_with(
        access_token="token",
        filename="Landing Page.pdf",
        file_size=len(pdf_bytes),
        content_type="application/pdf",
        folder_id="FLD-TEAM",
        shared_drive_id="SD-TEAM",
        kind="ai_generated",
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
        "artifacts": [{
            "file": "exports/this-is-a-very-long-generated-slide-deck-name-that-should-not-become-an-overlong-drive-file.html",
            "kind": "html",
        }],
    }
    daemon.request_export_pdf_ticket.return_value = _export_ticket(size_bytes=len(b"%PDF-1.4 test"))

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-FILENAME")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=project,
        formats=["pdf"],
        artifact_file=None,
        folder_id=None,
        od_daemon=daemon,
    )

    filename = result.outputs[0].filename
    assert filename is not None
    assert filename.endswith(".pdf")
    assert filename != "design.pdf"
    assert len(filename) <= 80
    assert filename.startswith("this-is-a-very-long-generated-slide-deck-name")
    teamver_client.drive.create_upload_request.assert_awaited_once()
    assert teamver_client.drive.create_upload_request.await_args.kwargs["filename"] == filename


@pytest.mark.asyncio
async def test_publish_project_rejects_zip_format():
    db = AsyncMock()
    client = MagicMock()
    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = DECK_MANIFEST

    with pytest.raises(BadRequestError, match="unsupported_formats:zip"):
        await publish_project(
            db,
            teamver_client=client,
            access_token="token",
            project=_project(),
            formats=["zip"],
            artifact_file="pages/landing.html",
            folder_id=None,
            od_daemon=daemon,
        )


@pytest.mark.asyncio
async def test_publish_project_accepts_html_for_slides():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = DECK_MANIFEST
    export_ticket = _export_ticket(
        filename="Landing Page.html",
        mime="text/html",
        size_bytes=len(b"<html>deck</html>"),
    )
    daemon.request_export_html_ticket.return_value = export_ticket

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-HTML")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        formats=["html"],
        artifact_file="deck/index.html",
        folder_id=None,
        od_daemon=daemon,
    )

    assert result.http_status == 201
    assert result.outputs[0].kind == "html"
    assert result.outputs[0].publish_status == "ready"
    daemon.request_export_html_ticket.assert_awaited_once_with(
        "od1",
        "deck/index.html",
        identity=ANY,
        deck=True,
        title=None,
    )
    daemon.stream_export_ticket_to_presigned_put.assert_awaited_once_with(
        export_ticket,
        presigned_url="https://s3.example.com/upload/AST-HTML",
        content_type="text/html",
        identity=ANY,
    )


@pytest.mark.asyncio
async def test_publish_project_all_formats_fail_raises_bad_gateway():
    db = AsyncMock()

    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = DECK_MANIFEST
    daemon.request_export_pdf_ticket.side_effect = BadGatewayError("od_daemon_export_failed")

    teamver_client = MagicMock()

    with pytest.raises(BadGatewayError, match="publish_all_failed"):
        await publish_project(
            db,
            teamver_client=teamver_client,
            access_token="token",
            project=_project(),
            formats=["pdf"],
            artifact_file=None,
            folder_id=None,
            od_daemon=daemon,
        )


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
    daemon.get_export_manifest.return_value = DECK_MANIFEST
    daemon.request_export_pdf_ticket.return_value = _export_ticket(size_bytes=len(b"%PDF-1.4 test"))

    teamver_client = MagicMock()
    upload_request_exc = TeamverAPIError("drive upload request rejected")
    upload_request_exc.code = None
    upload_request_exc.status_code = 403
    teamver_client.drive.create_upload_request = AsyncMock(side_effect=upload_request_exc)
    teamver_client.drive._put_presigned_bytes = AsyncMock()
    teamver_client.drive.confirm_upload = AsyncMock()

    with pytest.raises(BadGatewayError, match="publish_all_failed"):
        await publish_project(
            db,
            teamver_client=teamver_client,
            access_token="token",
            project=_project(),
            formats=["pdf"],
            artifact_file=None,
            folder_id=None,
            od_daemon=daemon,
        )

    daemon.stream_export_ticket_to_presigned_put.assert_not_awaited()
    teamver_client.drive.confirm_upload.assert_not_awaited()


@pytest.mark.asyncio
async def test_publish_project_presigned_put_status_propagates():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = DECK_MANIFEST
    daemon.request_export_pdf_ticket.return_value = _export_ticket(size_bytes=len(b"%PDF-1.4 test"))

    teamver_client = MagicMock()
    ticket_html = MagicMock()
    ticket_html.asset_id = "AST-HTML"
    ticket_html.presigned_url = "https://s3.example.com/upload/AST-HTML"
    teamver_client.drive.create_upload_request = AsyncMock(return_value=ticket_html)
    presigned_exc = DriveUploadError("S3 PUT failed with status 502")
    presigned_exc.status_code = 502
    daemon.stream_export_ticket_to_presigned_put.side_effect = presigned_exc
    teamver_client.drive.confirm_upload = AsyncMock()

    with pytest.raises(BadGatewayError, match="publish_all_failed"):
        await publish_project(
            db,
            teamver_client=teamver_client,
            access_token="token",
            project=_project(),
            formats=["pdf"],
            artifact_file=None,
            folder_id=None,
            od_daemon=daemon,
        )

    teamver_client.drive.confirm_upload.assert_not_awaited()


@pytest.mark.asyncio
async def test_publish_project_stream_put_failure_falls_back_to_bytes_put():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = DECK_MANIFEST
    pdf_bytes = b"%PDF-1.4 fallback"
    daemon.request_export_pdf_ticket.return_value = _export_ticket(size_bytes=len(pdf_bytes))
    daemon.stream_export_ticket_to_presigned_put.side_effect = OdDaemonPresignedPutError(411)
    daemon.get_export_pdf.return_value = pdf_bytes

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-FALLBACK-PUT")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        formats=["pdf"],
        artifact_file=None,
        folder_id=None,
        od_daemon=daemon,
    )

    assert result.http_status == 201
    daemon.get_export_pdf.assert_awaited_once_with(
        "od1",
        "deck/index.html",
        identity=ANY,
        deck=True,
        title=None,
        max_bytes=67_108_864,
    )
    teamver_client.drive._put_presigned_bytes.assert_awaited_once_with(
        "https://s3.example.com/upload/AST-FALLBACK-PUT",
        content=pdf_bytes,
        content_type="application/pdf",
    )
    teamver_client.drive.confirm_upload.assert_awaited_once_with(
        access_token="token",
        asset_id="AST-FALLBACK-PUT",
    )


@pytest.mark.asyncio
async def test_publish_project_ticket_download_failure_falls_back_to_bytes_put():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = DECK_MANIFEST
    pdf_bytes = b"%PDF-1.4 ticket download fallback"
    daemon.request_export_pdf_ticket.return_value = _export_ticket(size_bytes=len(pdf_bytes))
    daemon.stream_export_ticket_to_presigned_put.side_effect = BadGatewayError(
        "od_daemon_export_ticket_download_failed"
    )
    daemon.get_export_pdf.return_value = pdf_bytes

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-DOWNLOAD-FALLBACK")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        formats=["pdf"],
        artifact_file=None,
        folder_id=None,
        od_daemon=daemon,
    )

    assert result.http_status == 201
    daemon.get_export_pdf.assert_awaited_once_with(
        "od1",
        "deck/index.html",
        identity=ANY,
        deck=True,
        title=None,
        max_bytes=67_108_864,
    )
    teamver_client.drive._put_presigned_bytes.assert_awaited_once_with(
        "https://s3.example.com/upload/AST-DOWNLOAD-FALLBACK",
        content=pdf_bytes,
        content_type="application/pdf",
    )
    teamver_client.drive.confirm_upload.assert_awaited_once_with(
        access_token="token",
        asset_id="AST-DOWNLOAD-FALLBACK",
    )


@pytest.mark.asyncio
async def test_publish_project_stream_fallback_too_large_is_classified():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = DECK_MANIFEST
    daemon.request_export_pdf_ticket.return_value = _export_ticket(size_bytes=1024)
    daemon.request_export_html_ticket.return_value = _export_ticket(
        filename="Landing Page.html",
        mime="text/html",
        size_bytes=32,
    )
    daemon.stream_export_ticket_to_presigned_put.side_effect = [
        OdDaemonPresignedPutError(411),
        None,
    ]
    daemon.get_export_pdf.side_effect = BadGatewayError("od_daemon_export_too_large")

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-MIXED")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),
        formats=["pdf", "html"],
        artifact_file="deck/index.html",
        folder_id=None,
        od_daemon=daemon,
    )

    assert result.http_status == 207
    pdf = next(output for output in result.outputs if output.kind == "pdf")
    html = next(output for output in result.outputs if output.kind == "html")
    assert pdf.publish_status == "failed"
    assert pdf.error_code == "drive_presigned_put_fallback_too_large"
    assert html.publish_status == "ready"


@pytest.mark.asyncio
async def test_publish_project_confirm_failure_uses_confirm_code():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    daemon = _daemon_mock()
    daemon.get_export_manifest.return_value = DECK_MANIFEST
    daemon.request_export_pdf_ticket.return_value = _export_ticket(size_bytes=len(b"%PDF-1.4 test"))

    teamver_client = MagicMock()
    ticket_html = MagicMock()
    ticket_html.asset_id = "AST-HTML"
    ticket_html.presigned_url = "https://s3.example.com/upload/AST-HTML"
    asset_html = MagicMock()
    asset_html.asset_id = "AST-HTML"
    teamver_client.drive.create_upload_request = AsyncMock(return_value=ticket_html)
    confirm_exc = DriveConfirmError("drive confirm failed")
    confirm_exc.status_code = 504
    confirm_exc.code = "drive.confirm_timeout"
    teamver_client.drive.confirm_upload = AsyncMock(side_effect=confirm_exc)

    with pytest.raises(BadGatewayError, match="publish_all_failed"):
        await publish_project(
            db,
            teamver_client=teamver_client,
            access_token="token",
            project=_project(),
            formats=["pdf"],
            artifact_file=None,
            folder_id=None,
            od_daemon=daemon,
        )


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
    daemon.get_export_manifest.return_value = DECK_MANIFEST
    daemon.request_export_pdf_ticket.return_value = _export_ticket(size_bytes=len(b"%PDF-1.4 test"))

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-LIVE")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=project,
        formats=["pdf"],
        artifact_file=None,
        folder_id=None,
        od_daemon=daemon,
    )

    assert result.outputs[0].filename == "Q4 마케팅 전략.pdf"
    daemon.get_project_name.assert_awaited_once_with("od1", identity=ANY)
    teamver_client.drive.create_upload_request.assert_awaited_once()
    assert (
        teamver_client.drive.create_upload_request.await_args.kwargs["filename"]
        == "Q4 마케팅 전략.pdf"
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
    daemon.get_export_manifest.return_value = DECK_MANIFEST
    daemon.request_export_pdf_ticket.return_value = _export_ticket(size_bytes=len(b"%PDF-1.4 test"))

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-FALLBACK")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=_project(),  # title="Landing Page"
        formats=["pdf"],
        artifact_file=None,
        folder_id=None,
        od_daemon=daemon,
    )

    # Stale-title fallback path: filename derived from project.title because
    # the daemon couldn't provide a live name.
    assert result.outputs[0].filename == "Landing Page.pdf"
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
    daemon.get_export_manifest.return_value = {
        "entryFile": "decks/q4-roadmap.html",
        "artifacts": [{"file": "decks/q4-roadmap.html", "kind": "html"}],
    }
    daemon.request_export_pdf_ticket.return_value = _export_ticket(size_bytes=len(b"%PDF-1.4 test"))

    teamver_client = MagicMock()
    _wire_drive_upload(teamver_client, asset_id="AST-GENERIC")

    result = await publish_project(
        db,
        teamver_client=teamver_client,
        access_token="token",
        project=project,
        formats=["pdf"],
        artifact_file=None,
        folder_id=None,
        od_daemon=daemon,
    )

    filename = result.outputs[0].filename
    assert filename is not None
    assert filename.startswith("q4-roadmap")
    assert filename.endswith(".pdf")
    assert filename != "design.pdf"
