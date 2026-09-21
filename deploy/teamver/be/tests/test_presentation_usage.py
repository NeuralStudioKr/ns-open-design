from __future__ import annotations

import os

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.routers import internal_presentation_usage
from app.routers.internal_presentation_usage import PresentationCompletedBody
from app.services import teamver_billing


@pytest.mark.asyncio
async def test_emit_posts_presentation_completed(monkeypatch: pytest.MonkeyPatch) -> None:
    called: dict[str, object] = {}

    async def fake_post(**kwargs):
        called.update(kwargs)
        return {"status": "accepted"}

    monkeypatch.setattr(teamver_billing, "post_presentation_completed", fake_post)
    monkeypatch.setattr(internal_presentation_usage.settings, "teamver_registry_app_id", "ai-design")
    monkeypatch.setattr(internal_presentation_usage.settings, "teamver_registry_key_id", "key-1")
    monkeypatch.setattr(
        internal_presentation_usage.settings, "teamver_registry_access_key", "secret-1"
    )

    response = await internal_presentation_usage.record_presentation_completed(
        PresentationCompletedBody(
            workspace_id="WS-1",
            user_id="U-1",
            artifact_id="ART-1",
            job_id="JOB-1",
        ),
        True,
    )

    assert response.status_code == 204
    assert called["workspace_id"] == "WS-1"
    assert called["artifact_id"] == "ART-1"
    assert called["job_id"] == "JOB-1"


@pytest.mark.asyncio
async def test_emit_skips_without_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_post(**kwargs):
        raise AssertionError(kwargs)

    monkeypatch.setattr(teamver_billing, "post_presentation_completed", fake_post)
    monkeypatch.setattr(internal_presentation_usage.settings, "teamver_registry_app_id", "")
    monkeypatch.setattr(internal_presentation_usage.settings, "teamver_registry_key_id", "")
    monkeypatch.setattr(internal_presentation_usage.settings, "teamver_registry_access_key", "")

    response = await internal_presentation_usage.record_presentation_completed(
        PresentationCompletedBody(workspace_id="WS-1", user_id="U-1", artifact_id="ART-1"),
        True,
    )
    assert response.status_code == 204
