"""Regression coverage for the DB pool observability accessors used by
``/api/healthz/deps``. We assert two properties:

1. Successful path returns integer stats for every field with the
   configured limits echoed back.
2. Field-level failure isolation — if one accessor raises or is missing,
   only that field falls back to ``-1`` while the rest remain valid.
   NullPool 은 checkedout 을 정의하지 않아 이 경계가 실제로 발생한다.
"""

from __future__ import annotations

import os

os.environ.setdefault("POSTGRES_PASSWORD", "test")

import pytest

from app.db import connection as db_connection


def test_get_pool_stats_returns_integers_and_config() -> None:
    stats = db_connection.get_pool_stats()
    assert isinstance(stats, dict)
    for field in ("size", "checked_out", "checked_in", "overflow"):
        assert field in stats
        assert isinstance(stats[field], int), f"{field} must be int, got {type(stats[field])}"
    # Configured mirrors the module-level env-resolved defaults so ops can
    # distinguish "current usage" from "configured cap".
    assert stats["configured_size"] == db_connection._POOL_SIZE
    assert stats["configured_max_overflow"] == db_connection._MAX_OVERFLOW


def test_pool_field_returns_minus_one_when_accessor_missing() -> None:
    """SQLAlchemy NullPool / StaticPool 은 checkedout 같은 accessor 를
    정의하지 않을 수 있다. 이 경우 전체 dict 를 무효화하지 않고 해당
    field 만 -1 로 fallback 되어야 한다.
    """

    class _FakePool:
        # Only exposes ``size`` — mimicking a stripped-down pool adapter.
        def size(self) -> int:
            return 7

    assert db_connection._pool_field(_FakePool(), "size") == 7
    assert db_connection._pool_field(_FakePool(), "checkedout") == -1
    assert db_connection._pool_field(_FakePool(), "not_a_method") == -1


def test_pool_field_isolates_exceptions() -> None:
    """Broken accessor 하나가 다른 field 까지 오염시키면 안 된다."""

    class _AngryPool:
        def size(self) -> int:
            raise RuntimeError("boom")

        def checkedout(self) -> int:
            return 3

    assert db_connection._pool_field(_AngryPool(), "size") == -1
    assert db_connection._pool_field(_AngryPool(), "checkedout") == 3


def test_pos_int_env_rejects_invalid_and_below_minimum(monkeypatch: pytest.MonkeyPatch) -> None:
    """Env override 는 파싱 실패나 minimum 미만이면 default 로 fallback."""
    monkeypatch.setenv("__TEST_POOL_VAR__", "not-a-number")
    assert db_connection._pos_int_env("__TEST_POOL_VAR__", default=10, minimum=1) == 10

    monkeypatch.setenv("__TEST_POOL_VAR__", "0")
    assert db_connection._pos_int_env("__TEST_POOL_VAR__", default=10, minimum=1) == 10

    monkeypatch.setenv("__TEST_POOL_VAR__", "5")
    assert db_connection._pos_int_env("__TEST_POOL_VAR__", default=10, minimum=1) == 5

    monkeypatch.delenv("__TEST_POOL_VAR__", raising=False)
    assert db_connection._pos_int_env("__TEST_POOL_VAR__", default=10, minimum=1) == 10
