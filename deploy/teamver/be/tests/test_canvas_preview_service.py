from __future__ import annotations

from app.services.canvas_preview_service import _extract_from_draft, _truncate


def test_extract_from_draft_builds_preview_and_headings() -> None:
    draft = {
        "title": "분기 계획",
        "sections": [
            {
                "heading": "목표",
                "blocks": [{"type": "paragraph", "text": "<p>전환율을 올립니다.</p>"}],
            },
            {
                "heading": "일정",
                "blocks": [{"type": "paragraph", "text": "<p>7월 중 런칭</p>"}],
            },
        ],
    }
    title, headings, count, preview = _extract_from_draft(draft)
    assert title == "분기 계획"
    assert count == 2
    assert headings == ["목표", "일정"]
    assert preview is not None
    assert "전환율" in preview


def test_truncate_ellipsis() -> None:
    assert _truncate("abc", 10) == "abc"
    assert _truncate("abcdefghij", 5) == "abcd…"
