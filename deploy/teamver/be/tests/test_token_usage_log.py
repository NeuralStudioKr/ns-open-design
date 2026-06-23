from __future__ import annotations

import logging
import os

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.services import token_usage_log
from app.services.token_usage_log import UsageScope, alog_token_usage


class _BoomSession:
    async def __aenter__(self) -> "_BoomSession":
        raise RuntimeError("db unavailable")

    async def __aexit__(self, exc_type, exc, tb) -> None:  # pragma: no cover - never entered
        return None


@pytest.mark.asyncio
async def test_alog_token_usage_emits_usage_5xx_marker_on_failure(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def boom_session_factory() -> _BoomSession:
        return _BoomSession()

    monkeypatch.setattr(token_usage_log, "async_session_maker", boom_session_factory)
    caplog.set_level(logging.ERROR, logger="app.services.token_usage_log")

    with pytest.raises(RuntimeError):
        await alog_token_usage(
            model_name="claude-sonnet-4-5",
            input_tokens=10,
            output_tokens=20,
            total_tokens=30,
            scope=UsageScope(user_id="u1", workspace_id="ws1", run_id="run-1"),
        )

    matched = [
        record
        for record in caplog.records
        if "teamver_usage_5xx" in record.getMessage()
    ]
    assert matched, "expected CloudWatch metric filter marker in failure log"
