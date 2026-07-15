from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.errors import ApiError, BadRequestError
from app.services import canvas_import_service as svc


def test_safe_filename_adds_html_suffix() -> None:
    assert svc._safe_filename(None, "abc").endswith(".html")
    assert svc._safe_filename("deck", "abc") == "deck.html"
    assert ".." not in svc._safe_filename("../x.html", "abc")


def test_safe_filename_embeds_revision() -> None:
    assert svc._safe_filename("deck", "abc", "2024-01-02T03:04:05Z") == "deck-2024-01-02T03_04_05Z.html"
    assert svc._safe_filename(None, "abc", "rev1") == "canvas-abc-rev1.html"


@pytest.mark.asyncio
async def test_import_canvas_html_uploads_streamed_bytes(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    project = SimpleNamespace(
        id="proj-1",
        od_project_id="od-1",
        owner_user_id="user-1",
        workspace_id="ws-1",
        s3_prefix="prefix",
    )

    class _FakeStreamResponse:
        status_code = 200
        headers = {"content-type": "text/html; charset=utf-8"}

        async def aiter_bytes(self, chunk_size: int = 1024):
            yield b"<html>hi</html>"

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        def stream(self, *args, **kwargs):
            return _FakeStreamResponse()

    monkeypatch.setattr(svc.httpx, "AsyncClient", _FakeClient)
    monkeypatch.setattr(svc.settings, "teamver_api_base_url", "https://main.example")

    daemon = SimpleNamespace(
        upload_project_file_path=AsyncMock(
            return_value={"path": "refs/drive/canvas.html", "name": "canvas.html", "size": 12},
        ),
    )

    result = await svc.import_canvas_html(
        access_token="tok",
        project=project,  # type: ignore[arg-type]
        session_id="sess",
        artifact_id="art",
        filename="canvas.html",
        revision="rev-9",
        od_daemon=daemon,  # type: ignore[arg-type]
    )
    assert result.project_id == "proj-1"
    assert result.imported[0].mime_type == "text/html"
    assert result.imported[0].asset_id == "art"
    daemon.upload_project_file_path.assert_awaited_once()
    assert daemon.upload_project_file_path.await_args.kwargs["filename"] == "canvas-rev-9.html"


@pytest.mark.asyncio
async def test_download_maps_403(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeStreamResponse:
        status_code = 403
        headers = {}

        async def aiter_bytes(self, chunk_size: int = 1024):
            if False:
                yield b""

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        def stream(self, *args, **kwargs):
            return _FakeStreamResponse()

    monkeypatch.setattr(svc.httpx, "AsyncClient", _FakeClient)
    monkeypatch.setattr(svc.settings, "teamver_api_base_url", "https://main.example")

    with pytest.raises(ApiError) as raised:
        await svc._download_canvas_html_to_path(
            access_token="tok",
            session_id="s",
            artifact_id="a",
            destination=Path("/tmp/should-not-matter.html"),
            max_bytes=100,
        )
    assert raised.value.code == "canvas_export_forbidden"
    assert raised.value.status_code == 403


@pytest.mark.asyncio
async def test_download_maps_404(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    class _FakeStreamResponse:
        status_code = 404
        headers = {}

        async def aiter_bytes(self, chunk_size: int = 1024):
            if False:
                yield b""

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        def stream(self, *args, **kwargs):
            return _FakeStreamResponse()

    monkeypatch.setattr(svc.httpx, "AsyncClient", _FakeClient)
    monkeypatch.setattr(svc.settings, "teamver_api_base_url", "https://main.example")

    with pytest.raises(ApiError) as raised:
        await svc._download_canvas_html_to_path(
            access_token="tok",
            session_id="s",
            artifact_id="a",
            destination=tmp_path / "x.html",
            max_bytes=100,
        )
    assert raised.value.code == "canvas_export_not_found"
    assert raised.value.status_code == 404


def test_empty_ids_rejected() -> None:
    with pytest.raises(BadRequestError):
        # sync wrapper via asyncio.run in callers — validate early helpers path through import
        import asyncio

        project = SimpleNamespace(
            id="p",
            od_project_id="o",
            owner_user_id="u",
            workspace_id="w",
            s3_prefix="s",
        )

        async def _run():
            await svc.import_canvas_html(
                access_token="t",
                project=project,  # type: ignore[arg-type]
                session_id=" ",
                artifact_id="a",
            )

        asyncio.run(_run())


def test_map_main_status_stable_codes() -> None:
    err = svc._map_main_status(403)
    assert err.code == "canvas_export_forbidden"
    assert err.to_response_content()["error"]["message"] == "canvas_export_forbidden"
