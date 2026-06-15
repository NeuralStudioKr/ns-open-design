"""Main BE Registry billing — Phase 2. teamver-app-sdk ``BillingClient``."""
from __future__ import annotations

import logging
from typing import Any

from teamver_app_sdk.registry import AppServiceRegistryCredentials

from ..config import settings
from ..teamver_sdk import get_teamver_client

logger = logging.getLogger(__name__)


def _registry_credentials() -> AppServiceRegistryCredentials:
    app_id = (settings.teamver_registry_app_id or "").strip()
    key_id = (settings.teamver_registry_key_id or "").strip()
    access_key = (settings.teamver_registry_access_key or "").strip()
    if not app_id or not key_id or not access_key:
        raise RuntimeError("registry_credentials_not_configured")
    return AppServiceRegistryCredentials(app_id=app_id, key_id=key_id, access_key=access_key)


async def reserve_credits(*, workspace_id: str, amount: int, reason: str = "design_run") -> dict[str, Any]:
    client = get_teamver_client()
    return await client.billing.reserve(
        workspace_id=workspace_id,
        amount=amount,
        reason=reason,
        credentials=_registry_credentials(),
        app_id=settings.teamver_registry_app_id or None,
    )


async def commit_usage(*, usage_id: str) -> dict[str, Any]:
    client = get_teamver_client()
    return await client.billing.commit(
        usage_id=usage_id,
        credentials=_registry_credentials(),
    )


async def refund_usage(*, usage_id: str, reason: str = "design_run_failed") -> dict[str, Any]:
    client = get_teamver_client()
    return await client.billing.refund(
        usage_id=usage_id,
        reason=reason,
        credentials=_registry_credentials(),
    )
