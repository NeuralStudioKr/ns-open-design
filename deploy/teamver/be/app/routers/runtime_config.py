from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from ..auth_context import AuthContext, require_auth
from ..services.od_runtime_config import resolve_od_runtime_config_payload

router = APIRouter(prefix="/api/v1", tags=["runtime-config"])


@router.get("/runtime-config", response_model=None)
async def get_runtime_config(
    auth: Annotated[AuthContext, Depends(require_auth)],
) -> Any:
    """Authenticated embed — server-managed BYOK for API mode (git/VITE 주입 금지)."""
    _ = auth
    return resolve_od_runtime_config_payload()
