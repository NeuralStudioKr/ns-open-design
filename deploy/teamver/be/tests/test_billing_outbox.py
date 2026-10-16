from __future__ import annotations

from typing import Any

import pytest

from app.services import billing_outbox


class _Result:
    def __init__(self, *, scalar: Any = None, rows: list[tuple[Any, ...]] | None = None) -> None:
        self._scalar = scalar
        self._rows = rows or []

    def scalar(self) -> Any:
        return self._scalar

    def all(self) -> list[tuple[Any, ...]]:
        return self._rows


class _Session:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any] | None]] = []

    async def execute(self, statement: Any, params: dict[str, Any] | None = None) -> _Result:
        self.calls.append((str(statement), params))
        return _Result()

    async def commit(self) -> None:
        return None


@pytest.mark.asyncio
async def test_enqueue_is_idempotent_upsert(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(billing_outbox.settings, "teamver_billing_disabled", False)
    db = _Session()
    await billing_outbox.enqueue(
        db,
        workspace_id="ws-1",
        run_id="run-1",
        amount_t=12,
        model_name="MiniMax-M3",
    )
    assert len(db.calls) == 1
    sql, params = db.calls[0]
    assert "ON CONFLICT (workspace_id, run_id)" in sql
    assert params is not None
    assert params["ws"] == "ws-1"
    assert params["rid"] == "run-1"
    assert params["amount"] == 12


@pytest.mark.asyncio
async def test_enqueue_skips_when_disabled_or_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _Session()
    monkeypatch.setattr(billing_outbox.settings, "teamver_billing_disabled", True)
    await billing_outbox.enqueue(db, workspace_id="ws", run_id="run", amount_t=1)
    monkeypatch.setattr(billing_outbox.settings, "teamver_billing_disabled", False)
    await billing_outbox.enqueue(db, workspace_id="", run_id="run", amount_t=1)
    await billing_outbox.enqueue(db, workspace_id="ws", run_id="run", amount_t=0)
    assert db.calls == []


@pytest.mark.asyncio
async def test_consume_settlement_marks_done_and_ledger(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[tuple[str, Any]] = []

    async def mark_attempted(reference_id: str) -> None:
        events.append(("attempted", reference_id))

    async def consume(**kwargs: Any) -> None:
        events.append(("consume", kwargs))

    async def mark(reference_id: str, **kwargs: Any) -> None:
        events.append(("mark", (reference_id, kwargs)))

    async def ledger(workspace_id: str, reference_id: str) -> None:
        events.append(("ledger", (workspace_id, reference_id)))

    monkeypatch.setattr(billing_outbox, "_mark_consume_attempted", mark_attempted)
    monkeypatch.setattr(billing_outbox.teamver_billing, "consume_credits", consume)
    monkeypatch.setattr(billing_outbox, "_mark_settlement", mark)
    monkeypatch.setattr(billing_outbox, "_mark_ledger_committed", ledger)
    assert await billing_outbox._consume_settlement("ws-1", "ref-1", 30) is True
    assert events == [
        ("attempted", "ref-1"),
        (
            "consume",
            {"workspace_id": "ws-1", "amount_t": 30, "reference_id": "ref-1"},
        ),
        ("mark", ("ref-1", {"status": "done"})),
        ("ledger", ("ws-1", "ref-1")),
    ]


@pytest.mark.asyncio
async def test_consume_failure_is_retained_for_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    marks: list[dict[str, Any]] = []

    async def noop(_reference_id: str) -> None:
        return None

    async def fail(**_kwargs: Any) -> None:
        raise RuntimeError("insufficient_balance")

    async def mark(reference_id: str, **kwargs: Any) -> None:
        marks.append({"reference_id": reference_id, **kwargs})

    invalidated: list[str] = []
    monkeypatch.setattr(billing_outbox, "_mark_consume_attempted", noop)
    monkeypatch.setattr(billing_outbox.teamver_billing, "consume_credits", fail)
    monkeypatch.setattr(billing_outbox, "_mark_settlement", mark)
    monkeypatch.setattr(billing_outbox, "invalidate_spendable_cache", invalidated.append)
    assert await billing_outbox._consume_settlement("ws-1", "ref-1", 30) is True
    assert invalidated == ["ws-1"]
    assert marks == [
        {
            "reference_id": "ref-1",
            "status": "failed",
            "error": "insufficient_balance",
            "bump_attempts": True,
        }
    ]
