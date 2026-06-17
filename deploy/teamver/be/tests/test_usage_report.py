from __future__ import annotations

import os
from types import SimpleNamespace

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.routers import usage_report
from app.schemas.usage_event import UsageEventBody


def test_usage_event_body_accepts_embed_camel_case_payload() -> None:
    body = UsageEventBody.model_validate(
        {
            "workspaceId": "ws-1",
            "modelName": "claude-sonnet-4-5",
            "inputTokens": 120,
            "outputTokens": 45,
            "operation": "design_run",
            "projectId": "od-proj-1",
            "runId": "run-abc",
        },
    )

    assert body.workspace_id == "ws-1"
    assert body.model_name == "claude-sonnet-4-5"
    assert body.input_tokens == 120
    assert body.output_tokens == 45
    assert body.project_id == "od-proj-1"
    assert body.run_id == "run-abc"


def test_usage_event_body_accepts_snake_case_payload() -> None:
    body = UsageEventBody.model_validate(
        {
            "workspace_id": "ws-2",
            "model_name": "gpt-4o",
            "input_tokens": 1,
            "output_tokens": 2,
            "run_id": "run-1",
        },
    )

    assert body.workspace_id == "ws-2"
    assert body.model_name == "gpt-4o"


@pytest.mark.asyncio
async def test_record_usage_event_returns_request_id(monkeypatch: pytest.MonkeyPatch) -> None:
    scheduled: list[dict] = []

    def fake_schedule(**kwargs):
        scheduled.append(kwargs)

    monkeypatch.setattr(usage_report, "schedule_token_usage_log", fake_schedule)
    monkeypatch.setattr(
        usage_report,
        "uuid4",
        lambda: SimpleNamespace(hex="abcdef1234567890abcdef1234567890"),
    )

    ctx = SimpleNamespace(
        user=SimpleNamespace(user_id="user-1"),
        workspace=SimpleNamespace(workspace_id="ws-1"),
    )
    response = await usage_report.record_usage_event(
        UsageEventBody(
            workspaceId="ws-1",
            modelName="claude-sonnet-4-5",
            inputTokens=11,
            outputTokens=22,
            projectId="od-proj-1",
            runId="run-1",
        ),
        ctx,
        "ws-1",
    )

    assert response.accepted is True
    assert response.request_id == "UREQ-ABCDEF123456"
    assert response.model_dump(by_alias=True) == {
        "accepted": True,
        "requestId": "UREQ-ABCDEF123456",
    }
    assert len(scheduled) == 1
    assert scheduled[0]["model_name"] == "claude-sonnet-4-5"
    scope = scheduled[0]["scope"]
    assert scope.user_id == "user-1"
    assert scope.workspace_id == "ws-1"
    assert scope.project_id == "od-proj-1"
    assert scope.run_id == "run-1"
