"""Daemon → Design BE → Main ``presentation.completed`` (1-106-2).

신규 Main API 를 만들지 않는다. Registry ``POST /api/app-service/events`` 만 사용한다.
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from ..config import settings
from ..errors import BadGatewayError, BadRequestError
from ..services import teamver_billing
from ..teamver_sdk import get_internal_api_key_dependency

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal", tags=["internal"])


class PresentationCompletedBody(BaseModel):
    workspace_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    artifact_id: str = Field(min_length=1)
    job_id: Optional[str] = None


def _registry_configured() -> bool:
    return bool(
        (settings.teamver_registry_app_id or "").strip()
        and (settings.teamver_registry_key_id or "").strip()
        and (settings.teamver_registry_access_key or "").strip()
    )


@router.post("/product-usage/presentation-completed", status_code=204, response_class=Response)
async def record_presentation_completed(
    body: PresentationCompletedBody,
    _: Literal[True] = Depends(get_internal_api_key_dependency()),
) -> Response:
    """슬라이드 artifact 성공 완료를 Main ingest 로 전달. 실패 이벤트는 받지 않는다."""
    workspace_id = body.workspace_id.strip()
    user_id = body.user_id.strip()
    artifact_id = body.artifact_id.strip()
    if not workspace_id or not user_id or not artifact_id:
        raise BadRequestError("presentation_completed_invalid_body")
    if not _registry_configured():
        logger.info(
            "presentation.completed skipped — registry credentials not configured workspace=%s",
            workspace_id,
        )
        return Response(status_code=204)
    try:
        await teamver_billing.post_presentation_completed(
            workspace_id=workspace_id,
            user_id=user_id,
            artifact_id=artifact_id,
            job_id=body.job_id,
        )
    except Exception as exc:
        logger.exception(
            "presentation.completed emit failed workspace=%s artifact_id=%s",
            workspace_id,
            artifact_id,
        )
        raise BadGatewayError("presentation_completed_emit_failed") from exc
    return Response(status_code=204)
