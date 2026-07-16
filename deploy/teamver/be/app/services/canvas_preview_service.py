from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from html import unescape
from typing import Any

import httpx

from ..config import settings
from ..errors import ApiError, BadRequestError

logger = logging.getLogger(__name__)

CANVAS_PREVIEW_TIMEOUT_SECONDS = min(float(settings.teamver_http_timeout_seconds), 20.0)
_PREVIEW_MAX = 180
_TITLE_MAX = 80
_THREAD_MAX = 80
_HEADING_MAX = 60
_HEADING_LIMIT = 5


@dataclass(frozen=True)
class CanvasPreviewResult:
    session_id: str
    artifact_id: str
    title: str | None
    preview: str | None
    thread_title: str | None
    section_count: int | None
    headings: list[str]
    updated_at: str | None


def _map_main_status(status: int) -> ApiError:
    if status in (401, 403):
        return ApiError(403, "canvas_export_forbidden", code="canvas_export_forbidden")
    if status == 404:
        return ApiError(404, "canvas_export_not_found", code="canvas_export_not_found")
    if status >= 500:
        return ApiError(502, "canvas_preview_failed", code="canvas_preview_failed")
    return ApiError(400, "canvas_preview_failed", code="canvas_preview_failed")


def _truncate(raw: str | None, max_len: int) -> str | None:
    text = re.sub(r"\s+", " ", (raw or "").strip())
    if not text:
        return None
    if len(text) <= max_len:
        return text
    return f"{text[: max(1, max_len - 1)].rstrip()}…"


def _strip_html(raw: str) -> str:
    text = unescape(raw)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _extract_from_draft(draft: dict[str, Any] | None) -> tuple[str | None, list[str], int, str | None]:
    if not isinstance(draft, dict):
        return None, [], 0, None

    title = _truncate(str(draft.get("title") or ""), _TITLE_MAX)
    sections = draft.get("sections")
    if not isinstance(sections, list):
        return title, [], 0, None

    headings: list[str] = []
    plain_bits: list[str] = []
    for section in sections:
        if not isinstance(section, dict):
            continue
        heading = _strip_html(str(section.get("heading") or ""))
        if heading:
            clipped = _truncate(heading, _HEADING_MAX)
            if clipped and clipped not in headings and len(headings) < _HEADING_LIMIT:
                headings.append(clipped)
            plain_bits.append(heading)
        blocks = section.get("blocks")
        if not isinstance(blocks, list):
            continue
        for block in blocks:
            if not isinstance(block, dict):
                continue
            text = _strip_html(str(block.get("text") or ""))
            if text:
                plain_bits.append(text)
            if sum(len(p) for p in plain_bits) > 280:
                break
        if sum(len(p) for p in plain_bits) > 280:
            break

    preview = _truncate(" ".join(plain_bits), _PREVIEW_MAX)
    return title, headings, len(sections), preview


def _pick_title(*candidates: Any) -> str | None:
    for value in candidates:
        if isinstance(value, str):
            clipped = _truncate(value, _TITLE_MAX)
            if clipped:
                return clipped
    return None


def _pick_updated_at(payload: dict[str, Any]) -> str | None:
    for key in ("updatedAt", "updated_at"):
        value = payload.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _unwrap_data(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    nested = payload.get("data")
    if isinstance(nested, dict):
        return nested
    return payload


async def fetch_canvas_preview(
    *,
    access_token: str,
    session_id: str,
    artifact_id: str,
) -> CanvasPreviewResult:
    session_id = session_id.strip()
    artifact_id = artifact_id.strip()
    if not session_id:
        raise BadRequestError("canvas_session_required")
    if not artifact_id:
        raise BadRequestError("canvas_artifact_required")

    base = settings.teamver_api_base_url.rstrip("/")
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }
    timeout = httpx.Timeout(CANVAS_PREVIEW_TIMEOUT_SECONDS)
    item_url = f"{base}/api/v2/session/{session_id}/canvas/item/{artifact_id}"
    session_url = f"{base}/api/v2/session/{session_id}"

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            item_task = client.get(item_url, headers=headers, params={"include_draft": "true"})
            session_task = client.get(session_url, headers=headers)
            item_resp, session_resp = await asyncio.gather(
                item_task,
                session_task,
                return_exceptions=True,
            )
    except httpx.TimeoutException as exc:
        raise ApiError(504, "canvas_preview_timeout", code="canvas_preview_timeout") from exc
    except httpx.HTTPError as exc:
        logger.warning("canvas preview upstream error: %s", exc)
        raise ApiError(502, "canvas_preview_failed", code="canvas_preview_failed") from exc

    if isinstance(item_resp, BaseException):
        if isinstance(item_resp, httpx.TimeoutException):
            raise ApiError(504, "canvas_preview_timeout", code="canvas_preview_timeout") from item_resp
        logger.warning("canvas preview item error: %s", item_resp)
        raise ApiError(502, "canvas_preview_failed", code="canvas_preview_failed") from item_resp

    if item_resp.status_code >= 400:
        raise _map_main_status(item_resp.status_code)

    try:
        payload = item_resp.json()
    except ValueError as exc:
        raise ApiError(502, "canvas_preview_failed", code="canvas_preview_failed") from exc

    data = _unwrap_data(payload)
    draft = data.get("draftBody") if isinstance(data.get("draftBody"), dict) else data.get("draft_body")
    draft_title, headings, section_count, preview = _extract_from_draft(
        draft if isinstance(draft, dict) else None
    )
    title = _pick_title(data.get("title"), draft_title)
    updated_at = _pick_updated_at(data)

    thread_title: str | None = None
    if not isinstance(session_resp, BaseException) and session_resp.status_code < 400:
        try:
            session_data = _unwrap_data(session_resp.json())
        except ValueError:
            session_data = {}
        thread_title = _truncate(
            str(session_data.get("title") or session_data.get("summary") or ""),
            _THREAD_MAX,
        )

    return CanvasPreviewResult(
        session_id=session_id,
        artifact_id=artifact_id,
        title=title,
        preview=preview,
        thread_title=thread_title,
        section_count=section_count or None,
        headings=headings,
        updated_at=updated_at,
    )
