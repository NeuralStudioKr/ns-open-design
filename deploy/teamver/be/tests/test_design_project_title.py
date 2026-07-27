from __future__ import annotations

from app.db.crud.design_project_title import (
    is_placeholder_registry_title,
    merge_registry_title_update,
)


def test_placeholder_detects_uuid_and_id_match() -> None:
    od = "a1b2c3d4-e5f6-4789-a012-3456789abcde"
    assert is_placeholder_registry_title(od_project_id=od, title=od)
    assert is_placeholder_registry_title(od_project_id=od, title=od.upper())
    assert is_placeholder_registry_title(od_project_id="od1", title="untitled")


def test_merge_replaces_placeholder_with_human_title() -> None:
    od = "a1b2c3d4-e5f6-4789-a012-3456789abcde"
    assert (
        merge_registry_title_update(
            od_project_id=od,
            current_title=od,
            incoming_title="My deck",
        )
        == "My deck"
    )


def test_merge_ignores_incoming_placeholder() -> None:
    od = "a1b2c3d4-e5f6-4789-a012-3456789abcde"
    assert (
        merge_registry_title_update(
            od_project_id=od,
            current_title="Good name",
            incoming_title=od,
        )
        is None
    )


def test_merge_accepts_hyphenated_rename() -> None:
    assert (
        merge_registry_title_update(
            od_project_id="od1",
            current_title="Old",
            incoming_title="annual-report-2026",
        )
        == "annual-report-2026"
    )
