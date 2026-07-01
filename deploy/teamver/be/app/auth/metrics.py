"""Lightweight auth counters — process-local."""

from __future__ import annotations

import threading
from collections import Counter

_lock = threading.Lock()
_counters: Counter[str] = Counter()


def inc(name: str, value: int = 1) -> None:
    with _lock:
        _counters[name] += value


def snapshot() -> dict[str, int]:
    with _lock:
        return dict(_counters)
