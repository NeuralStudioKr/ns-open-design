from __future__ import annotations

import re

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_GENERIC_TITLES = frozenset(
    {
        "untitled",
        "design",
        "new-project",
        "new project",
        "기본 슬라이드 템플릿",
    },
)


def is_placeholder_registry_title(*, od_project_id: str, title: str | None) -> bool:
    cleaned = (title or "").strip()
    if not cleaned:
        return True
    if cleaned == od_project_id.strip():
        return True
    if _UUID_RE.fullmatch(cleaned):
        return True
    lower = cleaned.lower()
    if lower in _GENERIC_TITLES or cleaned in _GENERIC_TITLES:
        return True
    return False


def merge_registry_title_update(
    *,
    od_project_id: str,
    current_title: str | None,
    incoming_title: str | None,
) -> str | None:
    """Return a new title when RDS should be updated, else None."""
    incoming = (incoming_title or "").strip()
    if not incoming or is_placeholder_registry_title(
        od_project_id=od_project_id,
        title=incoming,
    ):
        return None
    current = (current_title or "").strip()
    if not current or is_placeholder_registry_title(
        od_project_id=od_project_id,
        title=current,
    ):
        return incoming if incoming != current else None
    if incoming != current:
        return incoming
    return None
