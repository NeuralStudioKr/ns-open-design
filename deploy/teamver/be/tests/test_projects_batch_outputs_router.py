from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.auth_context import AuthContext
from app.db.crud import design_output_crud
from app.routers import projects as projects_router
from app.schemas.publish import BatchLatestPublishBody


def _output_row(*, od_project_id: str, published_at: datetime, drive_asset_id: str, kind: str, filename: str) -> MagicMock:
    row = MagicMock()
    row.od_project_id = od_project_id
    row.kind = kind
    row.drive_asset_id = drive_asset_id
    row.filename = filename
    row.publish_status = "ready"
    row.published_at = published_at
    return row


def _auth() -> AuthContext:
    return AuthContext(user_id="u1", workspace_id="ws1", raw_token="tok")


@pytest.mark.asyncio
async def test_batch_latest_publish_summaries_returns_camel_case(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()
    newer = datetime(2026, 6, 20, 12, 0, tzinfo=timezone.utc)
    older = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
    rows = [
        _output_row(od_project_id="od-a", published_at=newer, drive_asset_id="AST-A2", kind="pdf", filename="a.pdf"),
        _output_row(od_project_id="od-a", published_at=older, drive_asset_id="AST-A1", kind="html", filename="a.html"),
        _output_row(od_project_id="od-b", published_at=newer, drive_asset_id="AST-B1", kind="zip", filename="b.zip"),
    ]
    monkeypatch.setattr(
        design_output_crud,
        "alist_ready_outputs_for_od_projects",
        AsyncMock(return_value=rows),
    )

    body = BatchLatestPublishBody(od_project_ids=["od-a", "od-b"])
    response = await projects_router.batch_latest_publish_summaries(body, _auth(), db)

    payload = response.model_dump(mode="json", by_alias=True)
    assert len(payload["summaries"]) == 2
    by_id = {item["odProjectId"]: item for item in payload["summaries"]}
    assert by_id["od-a"]["version"] == 2
    assert by_id["od-a"]["driveAssetId"] == "AST-A2"
    assert by_id["od-b"]["version"] == 1
    assert by_id["od-b"]["kind"] == "zip"


@pytest.mark.asyncio
async def test_batch_latest_publish_body_rejects_more_than_twelve_ids() -> None:
    ids = [f"od-{index}" for index in range(13)]
    with pytest.raises(ValidationError):
        BatchLatestPublishBody(od_project_ids=ids)


@pytest.mark.asyncio
async def test_batch_latest_publish_summaries_dedupes_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()
    captured: dict[str, object] = {}

    async def _fake_list(
        _db: object,
        *,
        od_project_ids: list[str],
        workspace_id: str,
        owner_user_id: str,
    ) -> list[MagicMock]:
        captured["ids"] = od_project_ids
        captured["workspace_id"] = workspace_id
        captured["owner_user_id"] = owner_user_id
        return []

    monkeypatch.setattr(design_output_crud, "alist_ready_outputs_for_od_projects", _fake_list)

    body = BatchLatestPublishBody(od_project_ids=["od-a", "od-a", "od-b", ""])
    await projects_router.batch_latest_publish_summaries(body, _auth(), db)

    assert captured["ids"] == ["od-a", "od-b"]
    assert captured["workspace_id"] == "ws1"
    assert captured["owner_user_id"] == "u1"
