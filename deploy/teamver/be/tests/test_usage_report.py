from __future__ import annotations

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
